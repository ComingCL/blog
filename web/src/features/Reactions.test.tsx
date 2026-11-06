import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api, write } from "@/api/client";
import { Reactions } from "./Reactions";
const app = vi.hoisted(() => ({
  user: { id: "alice" } as { id: string } | null,
  notify: vi.fn(),
  openAuth: vi.fn(),
}));
vi.mock("@/components/Providers", () => ({ useApp: () => app }));
vi.mock("@/api/client", () => ({ api: vi.fn(), write: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  app.user = { id: "alice" };
});

it("clears personal reaction state on logout and ignores late account responses", async () => {
  let finish!: (value: { liked: boolean; bookmarked: boolean }) => void;
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<Reactions postId="article" likes={2} />);
  app.user = null;
  rerender(<Reactions postId="article" likes={2} />);
  await act(async () => finish({ liked: true, bookmarked: true }));
  expect(screen.getByRole("button", { name: /点赞/ })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: /收藏/ })).toHaveAttribute("aria-pressed", "false");
});

it("waits for personal state before toggling so a saved article is removed correctly", async () => {
  let finish!: (value: { liked: boolean; bookmarked: boolean }) => void;
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Reactions postId="article" likes={2} />);
  expect(screen.getByRole("button", { name: /收藏/ })).toBeDisabled();
  await act(async () => finish({ liked: false, bookmarked: true }));
  await userEvent.click(screen.getByRole("button", { name: /已收藏/ }));
  await waitFor(() => expect(write).toHaveBeenCalledWith("/posts/article/bookmark", "DELETE"));
});

it("offers retry when personal state cannot be loaded instead of assuming no reactions", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("暂时无法连接"))
    .mockResolvedValueOnce({ liked: true, bookmarked: false });
  render(<Reactions postId="article" likes={2} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法连接");
  expect(screen.getByRole("button", { name: /点赞/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByRole("button", { name: /已点赞/ })).toBeEnabled();
});
