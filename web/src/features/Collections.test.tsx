import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Collections } from "./Collections";
import { CollectionKind } from "@/models/enums";
import { api, write } from "@/api/client";
vi.mock("@/api/client", () => ({ api: vi.fn(), write: vi.fn() }));
vi.mock("@/components/Providers", () => ({
  useApp: () => ({ user: { id: "reader", display_name: "读者" }, notify: vi.fn() }),
  AuthGate: ({ children }: any) => children,
}));

it("returns to the previous page after removing the last item on the last collection page", async () => {
  let removed = false;
  vi.mocked(api).mockImplementation(async (path) => {
    const page = new URL("http://test" + path).searchParams.get("page");
    return {
      list:
        removed && page === "2"
          ? []
          : [
              {
                id: page === "2" ? "last" : "first",
                title: page === "2" ? "最后一篇" : "第一页文章",
                slug: "sample",
              },
            ],
      pagination: { total_pages: removed ? 1 : 2 },
    };
  });
  vi.mocked(write).mockImplementation(async () => {
    removed = true;
  });
  render(<Collections kind={CollectionKind.Bookmarks} />);
  await userEvent.click(await screen.findByRole("button", { name: "下一页 →" }));
  await screen.findByText("最后一篇");
  await userEvent.click(screen.getByRole("button", { name: "取消收藏" }));
  await waitFor(() => expect(screen.getByText("第一页文章")).toBeInTheDocument());
  expect(screen.queryByText("这里还是空的。")).not.toBeInTheDocument();
});
