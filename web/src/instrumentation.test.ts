import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "./instrumentation";

afterEach(() => vi.restoreAllMocks());

describe("Next server render diagnostics", () => {
  it("records the server/client boundary failure with digest and route, excluding secrets", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(
      new Error(
        "Attempted to call isVideoURL() from the server but isVideoURL is on the client. password=private-secret",
      ),
      { digest: "2288339371" },
    );
    await onRequestError(
      error,
      {
        path: "/v1/posts/sample?token=secret-query",
        method: "GET",
        headers: { "x-request-id": "request-render", cookie: "session=private-cookie" },
      },
      {
        routerKind: "App Router",
        routePath: "/posts/[slug]",
        routeType: "render",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );
    expect(output).toHaveBeenCalledTimes(1);
    const record = JSON.parse(output.mock.calls[0][0]);
    expect(record).toMatchObject({
      level: "ERROR",
      event: "web_render_failed",
      error_type: "CLIENT_BOUNDARY",
      digest: "2288339371",
      request_id: "request-render",
      route: "/posts/[slug]",
      method: "GET",
    });
    expect(JSON.stringify(record)).not.toMatch(/private-|secret-query|password|session/);
  });
  it("handles arbitrary thrown values without leaking their contents", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(
      { message: "token=private-token", headers: { authorization: "private-auth" } },
      {
        path: "/v1/posts/sample",
        method: "GET",
        headers: {},
      },
      {
        routerKind: "App Router",
        routePath: "/posts/[slug]",
        routeType: "render",
        revalidateReason: undefined,
      },
    );
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ error_type: "RENDER_ERROR" });
    expect(output.mock.calls[0][0]).not.toContain("private-");
  });
});
