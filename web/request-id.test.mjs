import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assignRequestID } from "./request-id.mjs";

test("the HTTP entry supplies a fresh shared ID to SSR, Go and the browser", () => {
  const first = { headers: { "x-request-id": "untrusted-client-value" } };
  const second = { headers: {} };
  const headers = new Map();
  assignRequestID(first, { setHeader: (name, value) => headers.set(name.toLowerCase(), value) });
  assignRequestID(second, { setHeader: () => {} });
  assert.match(first.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.notEqual(first.headers["x-request-id"], second.headers["x-request-id"]);
  assert.equal(first.headers["x-request-id"], headers.get("x-request-id"));
});
