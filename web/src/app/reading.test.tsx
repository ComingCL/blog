import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { serverApi } from "@/api/server";
import Home from "./page";
import Article from "./posts/[slug]/page";
vi.mock("@/api/server", () => ({ serverApi: vi.fn(), ServerApiError: class extends Error {} }));
vi.mock("@/components/Hero", () => ({ Hero: () => <div>首页影像</div> }));
vi.mock("@/features/Reactions", () => ({ Reactions: () => null }));
vi.mock("@/features/Comments", () => ({ Comments: () => null }));
const post = {
  id: "sample",
  slug: "sample",
  title: "雨夜笔记",
  excerpt: "记录日常",
  category: "随笔",
  likes: 0,
  published_at: "2026-11-01T00:00:00Z",
  cover_url: "",
};
beforeEach(() => vi.clearAllMocks());

it("shows each recent article once without an invented editor selection", async () => {
  vi.mocked(serverApi).mockResolvedValue({ list: [post] });
  render(await Home());
  expect(screen.getAllByRole("heading", { name: "雨夜笔记" })).toHaveLength(1);
  expect(screen.queryByText(/本期精选/)).not.toBeInTheDocument();
});

it("makes the article index match real Markdown headings including formatted and setext headings", async () => {
  vi.mocked(serverApi).mockResolvedValue({
    ...post,
    markdown: "```md\n## 代码示例\n```\n\n## **真实**标题\n\n第二节\n---\n",
  });
  render(await Article({ params: Promise.resolve({ slug: "sample" }) }));
  const toc = screen.getByRole("complementary");
  expect(within(toc).queryByRole("link", { name: "代码示例" })).not.toBeInTheDocument();
  const first = within(toc).getByRole("link", { name: "真实标题" });
  const second = within(toc).getByRole("link", { name: "第二节" });
  expect(first).toHaveAttribute("href", "#section-0");
  expect(second).toHaveAttribute("href", "#section-1");
  expect(document.querySelector(first.getAttribute("href")!)).toHaveTextContent("真实标题");
  expect(document.querySelector(second.getAttribute("href")!)).toHaveTextContent("第二节");
});

it("omits the empty index on articles without section headings", async () => {
  vi.mocked(serverApi).mockResolvedValue({ ...post, markdown: "只有一段正文。" });
  render(await Article({ params: Promise.resolve({ slug: "sample" }) }));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});
