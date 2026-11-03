import { afterEach, describe, expect, it, vi } from "vitest";
import { api, write } from "./client";
import { ClientErrorCode, ResponseCode } from "@/models/enums";

afterEach(() => vi.unstubAllGlobals());
describe("API request compatibility", () => {
  it("obtains CSRF protection before a mutation and includes session credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: ResponseCode.OK, data: { token: "test-csrf" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: ResponseCode.OK, data: { saved: true } }),
      });
    vi.stubGlobal("fetch", fetcher);
    expect(await write("/admin/posts/test/draft", "PATCH", { title: "测试文章" })).toEqual({
      saved: true,
    });
    expect(fetcher.mock.calls[0][0]).toBe("/v1/api/auth/csrf");
    const [path, options] = fetcher.mock.calls[1];
    expect(path).toBe("/v1/api/admin/posts/test/draft");
    expect(options.credentials).toBe("same-origin");
    expect(new Headers(options.headers).get("X-CSRF-Token")).toBe("test-csrf");
    expect(JSON.parse(options.body)).toEqual({ title: "测试文章" });
  });
  it("preserves the response enum and request ID when authentication fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            code: ResponseCode.Unauthorized,
            message: "请登录",
            request_id: "request-test",
          }),
        }),
    );
    await expect(api("/me")).rejects.toMatchObject({
      status: 401,
      code: ResponseCode.Unauthorized,
      requestId: "request-test",
    });
  });
  it("reports an invalid upstream response as a client connection error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("upstream HTML");
        },
      }),
    );
    await expect(api("/posts")).rejects.toMatchObject({
      status: 502,
      code: ClientErrorCode.ConnectionError,
    });
  });
});
