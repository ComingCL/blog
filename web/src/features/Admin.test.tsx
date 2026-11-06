import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api, write } from "@/api/client";
import { AdminPosts, DraftPreview, Editor, NewPost } from "./Admin";
import { PostStatus } from "@/models/enums";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  notify: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
  usePathname: () => "/admin/posts/example/edit",
}));
vi.mock("@/api/client", () => ({
  api: vi.fn(),
  write: vi.fn(),
  ApiError: class extends Error {
    status = 0;
  },
}));
vi.mock("@/components/Providers", () => ({
  useApp: () => ({ notify: mocks.notify }),
  AuthGate: ({ children }: any) => children,
}));
vi.mock("@/components/ConfirmDialog", () => ({ useConfirm: () => mocks.confirm }));
vi.mock("@/components/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: any) => (
    <textarea aria-label="正文" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
const draft = {
  post_id: "example",
  title: "原有标题",
  slug: "example",
  excerpt: "",
  markdown: "正文",
  category: "随笔",
  tags: [],
  cover_url: "",
  version: 1,
  post_version: 1,
  status: PostStatus.Published,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue(draft);
});

it("can retry a failed draft creation without reloading the whole site", async () => {
  vi.mocked(write)
    .mockRejectedValueOnce(new Error("创建失败"))
    .mockResolvedValueOnce({ id: "new-draft" });
  render(<NewPost />);
  expect(await screen.findByRole("alert")).toHaveTextContent("创建失败");
  await userEvent.click(screen.getByRole("button", { name: "重试创建" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/posts/new-draft/edit"));
  expect(write).toHaveBeenCalledTimes(2);
});

it("guards internal navigation with unsaved edits and stays when cancelled", async () => {
  mocks.confirm.mockResolvedValue(false);
  render(
    <>
      <a href="/v1/posts">站点文章</a>
      <Editor id="example" />
    </>,
  );
  await screen.findByDisplayValue("原有标题");
  fireEvent.change(screen.getByLabelText("文章标题"), { target: { value: "尚未保存的标题" } });
  await userEvent.click(screen.getByRole("link", { name: "站点文章" }));
  expect(mocks.confirm).toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("尚未保存的标题")).toBeInTheDocument();
});

it("saves dirty content before confirmed internal navigation and preserves it if saving fails", async () => {
  mocks.confirm.mockResolvedValue(true);
  vi.mocked(write).mockRejectedValue(new Error("保存失败"));
  render(
    <>
      <a href="/v1/posts">站点文章</a>
      <Editor id="example" />
    </>,
  );
  await screen.findByDisplayValue("原有标题");
  fireEvent.change(screen.getByLabelText("文章标题"), { target: { value: "未保存" } });
  await userEvent.click(screen.getByRole("link", { name: "站点文章" }));
  await waitFor(() => expect(write).toHaveBeenCalled());
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("未保存")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
});

it("does not call an already published article unpublished in its draft preview", async () => {
  render(<DraftPreview id="example" />);
  await screen.findByRole("heading", { name: "原有标题" });
  expect(screen.queryByText("草稿预览 · 未发布")).not.toBeInTheDocument();
  expect(screen.getByText("草稿预览 · 不影响已发布内容")).toBeInTheDocument();
});

it("keeps the newest article search when an older response arrives late", async () => {
  let finishOld!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path) =>
    String(path).includes("q=new")
      ? Promise.resolve({
          list: [{ ...draft, id: "new", title: "新搜索结果" }],
          pagination: { total_pages: 1 },
        })
      : new Promise((resolve) => {
          finishOld = resolve;
        }),
  );
  render(<AdminPosts />);
  await waitFor(() => expect(api).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "搜索文章" }), { target: { value: "new" } });
  await screen.findByText("新搜索结果");
  await act(async () =>
    finishOld({
      list: [{ ...draft, id: "old", title: "过期搜索结果" }],
      pagination: { total_pages: 1 },
    }),
  );
  expect(screen.getByText("新搜索结果")).toBeInTheDocument();
  expect(screen.queryByText("过期搜索结果")).not.toBeInTheDocument();
});
