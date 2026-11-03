import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function supervise(
  commands,
  {
    log = (entry) => console.log(JSON.stringify(entry)),
    shutdownMs = 10000,
  } = {},
) {
  const children = new Map();
  let stopping = false,
    result = 0,
    timer;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  const emit = (level, event, fields = {}) =>
    log({ time: new Date().toISOString(), level, event, ...fields });
  function complete() {
    if (!stopping || children.size) return;
    clearTimeout(timer);
    emit("INFO", "application_stopped", { exit_code: result });
    finish(result);
  }
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    result = code;
    for (const child of children.keys()) child.kill("SIGTERM");
    timer = setTimeout(() => {
      for (const child of children.keys()) child.kill("SIGKILL");
    }, shutdownMs);
    timer.unref();
    complete();
  }
  for (const item of commands) {
    const child = spawn(item.command, item.args ?? [], {
      cwd: item.cwd,
      stdio: "inherit",
    });
    children.set(child, item.name);
    emit("INFO", "child_started", { service: item.name, pid: child.pid });
    child.on("error", () => {
      emit("ERROR", "child_start_failed", { service: item.name });
      stop(1);
    });
    child.once("close", (code, signal) => {
      children.delete(child);
      if (!stopping) {
        emit("ERROR", "child_exited", {
          service: item.name,
          exit_code: code,
          signal,
        });
        stop(1);
      }
      complete();
    });
  }
  return { finished, stop: () => stop(0) };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const group = supervise([
    {
      name: "api",
      command: "/app/bin/blog-api",
      args: ["-config", "/app/server/config/config.yaml"],
      cwd: "/app/server",
    },
    {
      name: "web",
      command: process.execPath,
      args: ["server.mjs"],
      cwd: "/app/web",
    },
  ]);
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, group.stop);
  process.exitCode = await group.finished;
}
