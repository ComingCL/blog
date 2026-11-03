import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspect } from "node:util";
import { loadServerConfig } from "./server-config.mjs";

test("YAML controls both API proxy and server-side rendering configuration", () => {
  const dir = mkdtempSync(join(tmpdir(), "nightlog-yaml-"));
  try {
    const path = join(dir, "config.yaml");
    writeFileSync(
      path,
      'server:\n  port: 9090\n  origin: "https://blog.example.com/"\nsecurity:\n  audit_key: "01234567890123456789012345678901"\n',
    );
    const cfg = loadServerConfig(path);
    assert.equal(cfg.apiOrigin, "http://127.0.0.1:9090");
    assert.equal(cfg.siteURL, "https://blog.example.com");
    writeFileSync(path, "server:\n  port: 99999\n");
    assert.throws(() => loadServerConfig(path), /server.port/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("container listener is independent of the HTTPS public origin", () => {
  const dir = mkdtempSync(join(tmpdir(), "blog-listener-"));
  try {
    const path = join(dir, "config.yaml");
    writeFileSync(
      path,
      'server:\n  origin: "https://blog.example.com"\n  web_host: "0.0.0.0"\n  web_port: 3100\nsecurity:\n  audit_key: "01234567890123456789012345678901"\n',
    );
    const cfg = loadServerConfig(path);
    assert.equal(cfg.webHost, "0.0.0.0");
    assert.equal(cfg.webPort, 3100);
    writeFileSync(
      path,
      'server:\n  web_host: "public.example.com"\nsecurity:\n  audit_key: "01234567890123456789012345678901"\n',
    );
    assert.throws(() => loadServerConfig(path), /web_host/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid origin errors do not print private configuration input", () => {
  const dir = mkdtempSync(join(tmpdir(), "blog-private-origin-"));
  try {
    const path = join(dir, "config.yaml");
    writeFileSync(
      path,
      'server:\n  origin: "private-sensitive-origin-marker"\nsecurity:\n  audit_key: "01234567890123456789012345678901"\n',
    );
    assert.throws(
      () => loadServerConfig(path),
      (error) => !inspect(error).includes("private-sensitive-origin-marker"),
    );
    writeFileSync(path, "security:\n  audit_key: [private-sensitive-yaml-marker\n");
    assert.throws(
      () => loadServerConfig(path),
      (error) => !inspect(error).includes("private-sensitive-yaml-marker"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
