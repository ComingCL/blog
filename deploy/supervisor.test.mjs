import { test } from "node:test";
import assert from "node:assert/strict";
import { supervise } from "./supervisor.mjs";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("child output reaches private rotating host files before completion, with secrets omitted", async () => {
  const directory = mkdtempSync(join(tmpdir(), "blog-process-logs-"));
  try {
    const failure = {
      level: "ERROR",
      event: "ssr_api_failed",
      status: 500,
      request_id: "request-test",
      path: "/v1/api/posts?token=private-query",
      error_code: "ECONNREFUSED",
      password: "private-password",
      cookie: "private-cookie",
      message: "private-message",
    };
    const group = supervise(
      [
        {
          name: "web",
          command: process.execPath,
          args: [
            "-e",
            `console.log(JSON.stringify({level:'INFO',event:'web_listening',port:3100}));process.stderr.write(${JSON.stringify(JSON.stringify(failure))});`,
          ],
        },
      ],
      { log: () => {}, logDirectory: directory, consoleWrite: () => {} },
    );
    assert.equal(await group.finished, 1);
    assert.ok(
      existsSync(join(directory, "web-error.jsonl")),
      "stderr must be available as a host file",
    );
    const errors = readFileSync(join(directory, "web-error.jsonl"), "utf8");
    const entry = JSON.parse(errors.trim());
    assert.equal(entry.event, "ssr_api_failed");
    assert.equal(entry.request_id, "request-test");
    assert.equal(entry.error_code, "ECONNREFUSED");
    assert.equal(entry.path, "/v1/api/posts");
    assert.ok(!errors.includes("private-"));
    assert.equal(
      statSync(join(directory, "web-error.jsonl")).mode & 0o777,
      0o600,
    );
    assert.ok(
      readFileSync(join(directory, "web.jsonl"), "utf8").includes(
        "web_listening",
      ),
    );
    assert.ok(
      readFileSync(join(directory, "runtime.jsonl"), "utf8").includes(
        "application_stopped",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("process files rotate within configured limit and retain the final diagnostic", async () => {
  const directory = mkdtempSync(join(tmpdir(), "blog-process-rotation-"));
  try {
    const group = supervise(
      [
        {
          name: "web",
          command: process.execPath,
          args: [
            "-e",
            "for(let i=0;i<30;i++)console.error(JSON.stringify({level:'ERROR',event:'ssr_api_failed',request_id:'request-'+i}));",
          ],
        },
      ],
      {
        log: () => {},
        logDirectory: directory,
        consoleWrite: () => {},
        logMaxBytes: 400,
        logBackups: 2,
      },
    );
    await group.finished;
    assert.ok(
      existsSync(join(directory, "web-error.jsonl.1")),
      "full logs must rotate",
    );
    assert.ok(!existsSync(join(directory, "web-error.jsonl.3")));
    assert.ok(
      readFileSync(join(directory, "web-error.jsonl"), "utf8").includes(
        "request-29",
      ),
    );
    for (const file of readdirSync(directory))
      assert.ok(statSync(join(directory, file)).size <= 400);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("unstructured framework errors keep type and digest without leaking message payloads", async () => {
  const directory = mkdtempSync(join(tmpdir(), "blog-process-error-"));
  try {
    const group = supervise(
      [
        {
          name: "web",
          command: process.execPath,
          args: [
            "-e",
            `console.error("Error: Attempted to call isVideoURL() from the server private-payload");console.error("  digest: '2288339371'");`,
          ],
        },
      ],
      { log: () => {}, logDirectory: directory, consoleWrite: () => {} },
    );
    await group.finished;
    assert.ok(existsSync(join(directory, "web-error.jsonl")));
    const text = readFileSync(join(directory, "web-error.jsonl"), "utf8");
    assert.ok(text.includes("2288339371"));
    assert.ok(text.includes("Error"));
    assert.ok(!text.includes("private-payload"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("API startup stderr keeps known Go failure events without accepting arbitrary messages", async () => {
  const directory = mkdtempSync(join(tmpdir(), "blog-api-startup-"));
  try {
    const group = supervise(
      [
        {
          name: "api",
          command: process.execPath,
          args: [
            "-e",
            `for (const msg of ['config_load_failed', 'logging unavailable', 'private-config-value']) console.error(JSON.stringify({level:'ERROR',msg}));`,
          ],
        },
      ],
      { log: () => {}, logDirectory: directory, consoleWrite: () => {} },
    );
    assert.equal(await group.finished, 1);
    const content = readFileSync(join(directory, "api-stderr.jsonl"), "utf8");
    const entries = content.trim().split("\n").map(JSON.parse);
    assert.deepEqual(
      entries.map((entry) => entry.event),
      ["config_load_failed", "logging_unavailable", "process_output"],
    );
    assert.ok(!content.includes("private-config-value"));
    assert.ok(entries.every((entry) => !("msg" in entry)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("unexpected child exit is a failure and terminates its sibling", async () => {
  const logs = [];
  const group = supervise(
    [
      {
        name: "api",
        command: process.execPath,
        args: ["-e", "setTimeout(()=>process.exit(0),100)"],
      },
      {
        name: "web",
        command: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
      },
    ],
    { log: (entry) => logs.push(entry) },
  );
  assert.equal(await group.finished, 1);
  assert.ok(
    logs.some(
      (entry) => entry.event === "child_exited" && entry.service === "api",
    ),
  );
  assert.ok(logs.some((entry) => entry.event === "application_stopped"));
});

test("requested shutdown stops both children and completes successfully", async () => {
  const logs = [];
  const group = supervise(
    [
      {
        name: "api",
        command: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
      },
      {
        name: "web",
        command: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
      },
    ],
    { log: (entry) => logs.push(entry) },
  );
  group.stop();
  assert.equal(await group.finished, 0);
  const started = logs.filter((entry) => entry.event === "child_started");
  assert.equal(started.length, 2);
  for (const entry of started)
    assert.throws(() => process.kill(entry.pid, 0), { code: "ESRCH" });
});
