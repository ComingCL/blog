import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const Level = Object.freeze({ INFO: "INFO", WARN: "WARN", ERROR: "ERROR" });
// Go may fail before its file logger exists; these fixed messages are safe events.
const apiStartupEvents = new Map([
  ["config_load_failed", "config_load_failed"],
  ["logging unavailable", "logging_unavailable"],
]);
const fields = new Set([
  "event",
  "reason",
  "error_type",
  "error_name",
  "error_code",
  "api_code",
  "digest",
  "request_id",
  "path",
  "route",
  "method",
  "status",
  "duration_ms",
  "port",
  "host",
  "pid",
  "exit_code",
  "signal",
]);

// Framework errors may contain headers, user data and configuration. Retain only
// diagnostic metadata; application SSR instrumentation supplies safe reason codes.
export function diagnostic(line, service, stream) {
  const entry = {
    time: new Date().toISOString(),
    level: stream === "stderr" ? Level.ERROR : Level.INFO,
    service,
    stream,
    event: "process_output",
  };
  try {
    const value = JSON.parse(line);
    if (Object.values(Level).includes(value?.level)) entry.level = value.level;
    if (
      service === "api" &&
      stream === "stderr" &&
      apiStartupEvents.has(value?.msg)
    )
      entry.event = apiStartupEvents.get(value.msg);
    for (const [key, field] of Object.entries(value ?? {})) {
      if (
        !fields.has(key) ||
        !["string", "number", "boolean"].includes(typeof field)
      )
        continue;
      entry[key] = typeof field === "string" ? field.slice(0, 1024) : field;
      if (key === "path" || key === "route")
        entry[key] = String(entry[key]).split(/[?#]/)[0];
    }
  } catch {
    const errorName = line.match(
      /\b(TypeError|ReferenceError|SyntaxError|RangeError|Error)\b/,
    );
    if (errorName) entry.error_name = errorName[1];
    const code = line.match(
      /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EADDRINUSE|EACCES|ENOSPC)\b/,
    );
    if (code) entry.error_code = code[1];
    const digest = line.match(/\bdigest:\s*['"]?([0-9a-f]{1,64})/i);
    if (digest) entry.digest = digest[1];
    if (/Attempted to call .+ from (?:the )?server/.test(line))
      entry.error_type = "CLIENT_BOUNDARY";
    // Keep a stack location, never its function arguments or exception payload.
    const location = line.match(/(?:\/app\/|node:)[^\s()]*:\d+:\d+/);
    if (location) entry.location = location[0].slice(0, 512);
    entry.reason = "UNSTRUCTURED_OUTPUT";
  }
  return entry;
}

export function processLogs(
  directory,
  {
    maxBytes = 10 * 1024 * 1024,
    backups = 5,
    consoleWrite = (stream, text) => process[stream].write(text),
  } = {},
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink())
    throw new Error("Log directory must not be a symlink");
  chmodSync(directory, 0o700);
  function writeFile(name, entry) {
    const file = join(directory, name);
    const text = JSON.stringify(entry) + "\n";
    if (existsSync(file) && lstatSync(file).isSymbolicLink())
      throw new Error("Log file must not be a symlink");
    if (
      existsSync(file) &&
      statSync(file).size + Buffer.byteLength(text) > maxBytes
    ) {
      if (existsSync(file + "." + backups)) unlinkSync(file + "." + backups);
      for (let i = backups - 1; i > 0; i--)
        if (existsSync(file + "." + i))
          renameSync(file + "." + i, file + "." + (i + 1));
      renameSync(file, file + ".1");
    }
    appendFileSync(file, text, { mode: 0o600 });
    chmodSync(file, 0o600);
    return text;
  }
  return {
    runtime(entry) {
      writeFile("runtime.jsonl", entry);
    },
    output(service, stream, line) {
      // Go structured logs already have their own durable file sink.
      if (service === "api" && stream === "stdout") {
        consoleWrite(stream, line + "\n");
        return;
      }
      const entry = diagnostic(line, service, stream);
      if (service === "web") {
        writeFile("web.jsonl", entry);
        if (entry.level === Level.ERROR) writeFile("web-error.jsonl", entry);
      } else writeFile("api-stderr.jsonl", entry);
      consoleWrite(stream, JSON.stringify(entry) + "\n");
    },
  };
}

export function captureOutput(readable, write) {
  readable.setEncoding("utf8");
  let pending = "";
  readable.on("data", (chunk) => {
    pending += chunk;
    let end;
    while ((end = pending.indexOf("\n")) !== -1) {
      write(pending.slice(0, end));
      pending = pending.slice(end + 1);
    }
    // Bound buffering even when an unexpected child emits an unbroken payload.
    if (pending.length > 16384) {
      write(pending.slice(0, 16384));
      pending = "";
    }
  });
  readable.on("end", () => {
    if (pending) write(pending);
  });
}
