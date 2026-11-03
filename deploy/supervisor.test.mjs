import { test } from "node:test";
import assert from "node:assert/strict";
import { supervise } from "./supervisor.mjs";

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
