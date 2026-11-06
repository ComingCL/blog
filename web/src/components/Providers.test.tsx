import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/api/client";
import { Providers, useApp, AuthGate } from "./Providers";
import { ClientErrorCode, ResponseCode, UserRole } from "@/models/enums";
import { defaultSite } from "@/api/types";
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  api: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/me/bookmarks" }));
vi.mock("./AuthWindow", () => ({ AuthWindow: () => null }));
vi.mock("./ConfirmDialog", () => ({ ConfirmProvider: ({ children }: any) => children }));
vi.mock("@/telemetry/Telemetry", () => ({ Telemetry: () => null }));
function Probe() {
  const { user, refresh } = useApp();
  return (
    <>
      <output>{user?.username || "无会话"}</output>
      <button onClick={() => void refresh()}>刷新身份</button>
      <AuthGate>
        <p>个人内容</p>
      </AuthGate>
    </>
  );
}
beforeEach(() => vi.clearAllMocks());
it("preserves the current route title when the client hydrates and loads site settings", async () => {
  const previous = document.title;
  document.title = "雨夜笔记 · Clarence Liu";
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/site") return { ...defaultSite, name: "Clarence Liu", version: 1 };
    throw new ApiError("未登录", 401, ResponseCode.Unauthorized, "");
  });
  try {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    await screen.findByText("登录后继续");
    expect(document.title).toBe("雨夜笔记 · Clarence Liu");
  } finally {
    document.title = previous;
  }
});
it("keeps a known session on transient server failure but clears it on a confirmed 401", async () => {
  let calls = 0;
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/site") return defaultSite;
    calls++;
    if (calls === 1)
      return { id: "reader", username: "reader", display_name: "读者", role: UserRole.Reader };
    throw new ApiError(
      "服务暂不可用",
      calls === 2 ? 503 : 401,
      calls === 2 ? ClientErrorCode.ConnectionError : ResponseCode.Unauthorized,
      "",
    );
  });
  render(
    <Providers>
      <Probe />
    </Providers>,
  );
  await screen.findByText("reader");
  await userEvent.click(screen.getByRole("button", { name: "刷新身份" }));
  expect(screen.getByText("reader")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "刷新身份" }));
  expect(await screen.findByText("无会话")).toBeInTheDocument();
});
it("shows an identity retry when authentication is unavailable instead of asking the user to log in again", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/site") return defaultSite;
    throw new Error("连接中断");
  });
  render(
    <Providers>
      <Probe />
    </Providers>,
  );
  expect(await screen.findByRole("button", { name: "重新检查登录状态" })).toBeInTheDocument();
  expect(screen.queryByText("登录后继续")).not.toBeInTheDocument();
});
it("ignores an old session response after a newer refresh confirms logout", async () => {
  let resolveOld!: (value: unknown) => void;
  let calls = 0;
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/site") return defaultSite;
    if (++calls === 1)
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    throw new ApiError("会话已结束", 401, ResponseCode.Unauthorized, "");
  });
  render(
    <Providers>
      <Probe />
    </Providers>,
  );
  await userEvent.click(screen.getByRole("button", { name: "刷新身份" }));
  await screen.findByText("登录后继续");
  await act(async () =>
    resolveOld({ id: "old", username: "old_user", display_name: "旧用户", role: UserRole.Reader }),
  );
  expect(screen.getByText("无会话")).toBeInTheDocument();
  expect(screen.queryByText("old_user")).not.toBeInTheDocument();
});
