import { strict as assert } from "node:assert";
import { test } from "node:test";
import { clientIPResolver, sanitizeClientHeaders } from "./client-ip.mjs";

test("direct clients cannot spoof forwarding headers", () => {
  const resolve = clientIPResolver();
  assert.equal(resolve("203.0.113.8", "198.51.100.1"), "203.0.113.8");
  assert.equal(resolve("::ffff:127.0.0.1", "198.51.100.1"), "127.0.0.1");
  assert.equal(resolve("2001:db8::8", "198.51.100.1"), "2001:db8::8");
});
test("trusted proxy chains stop at the closest untrusted hop", () => {
  const resolve = clientIPResolver(["10.0.0.0/8", "2001:db8:1::/48"]);
  assert.equal(resolve("10.1.1.1", "198.51.100.66, 203.0.113.8, 10.2.2.2"), "203.0.113.8");
  assert.equal(resolve("2001:db8:1::1", "2001:db8:2::2"), "2001:db8:2::2");
  assert.equal(resolve("10.1.1.1", "not-an-ip, 203.0.113.8"), "10.1.1.1");
  assert.equal(resolve("10.1.1.1", ""), "10.1.1.1");
  assert.equal(resolve("10.1.1.1", ["203.0.113.8"]), "10.1.1.1");
  assert.throws(() => clientIPResolver(["10.0.0.0/99"]));
  assert.throws(() => clientIPResolver(["example.com"]));
});
test("entry overwrites spoofed IPs and removes internal SSR identity", () => {
  const request = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: {
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
      "x-nightlog-ssr-key": "untrusted",
      forwarded: "for=198.51.100.3",
      cookie: "kept",
    },
  };
  sanitizeClientHeaders(request, clientIPResolver());
  assert.deepEqual(request.headers, { "x-forwarded-for": "127.0.0.1", cookie: "kept" });
});
