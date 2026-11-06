import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../server-config.mjs", () => ({
  serverConfig: {
    apiOrigin: "http://127.0.0.1:8080",
    internalAPIKey: "private-ssr-key",
  },
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-request-id": "request-article", "x-forwarded-for": "192.0.2.5" }),
  cookies: async () => ({ toString: () => "session=private-session" }),
}));
import { serverApi } from "./server";

let output: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  output = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("server API diagnostics", () => {
  it("preserves article content, forwarding authentication without logging success", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: "OK", data: { markdown: "# Article" } })),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await serverApi("/posts/article")).toEqual({ markdown: "# Article" });
    const forwarded = fetcher.mock.calls[0][1].headers;
    expect(forwarded.get("Cookie")).toBe("session=private-session");
    expect(forwarded.get("X-Nightlog-SSR-Key")).toBe("private-ssr-key");
    expect(output).not.toHaveBeenCalled();
  });
  it("logs API status and request ID without logging response text or query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "INTERNAL_ERROR",
            message: "private-db-password",
            request_id: "backend-request",
          }),
          { status: 500 },
        ),
      ),
    );
    await expect(serverApi("/posts/article?token=private-query")).rejects.toMatchObject({
      status: 500,
      requestId: "backend-request",
    });
    expect(output).toHaveBeenCalledTimes(1);
    const record = JSON.parse(output.mock.calls[0][0]);
    expect(record).toMatchObject({
      event: "server_api_failed",
      reason: "HTTP_ERROR",
      status: 500,
      path: "/v1/api/posts/article",
      request_id: "backend-request",
      api_code: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(record)).not.toContain("private-");
  });
  it("retains a normal not-found result for the article 404 page without an error log", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 })),
    );
    await expect(serverApi("/posts/missing")).rejects.toMatchObject({ status: 404 });
    expect(output).not.toHaveBeenCalled();
  });
  it("classifies transport failure and excludes its raw cause", async () => {
    const failure = Object.assign(new TypeError("fetch failed: private-host-password"), {
      cause: { code: "ECONNREFUSED", message: "private-db-url" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    await expect(serverApi("/posts/article")).rejects.toMatchObject({ status: 502 });
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
      reason: "NETWORK_ERROR",
      error_code: "ECONNREFUSED",
      request_id: "request-article",
    });
    expect(output.mock.calls[0][0]).not.toContain("private-");
  });
  it("rejects an HTML upstream response with a useful diagnostic", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<html>private-upstream-body</html>", { status: 502 })),
    );
    await expect(serverApi("/posts/article")).rejects.toMatchObject({ status: 502 });
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
      reason: "INVALID_RESPONSE",
      status: 502,
    });
    expect(output.mock.calls[0][0]).not.toContain("private-");
  });
  it("rejects an OK HTTP response carrying a failed API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "INTERNAL_ERROR" }))),
    );
    await expect(serverApi("/posts/article")).rejects.toMatchObject({ status: 502 });
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ reason: "INVALID_RESPONSE" });
  });
});
