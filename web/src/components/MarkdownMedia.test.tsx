import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Content";
import { MarkdownImage } from "./MarkdownImage";

describe("Markdown media preview", () => {
  it("keeps an open media dialog alive when the editor parent rerenders", async () => {
    const content = "![窗边](https://images.example.com/window.jpg)";
    const { rerender } = render(<Markdown content={content} />);
    await userEvent.click(screen.getByRole("button", { name: "预览图片：窗边" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    rerender(<Markdown content={content} />);
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("opens a soft dialog from an image and keeps no-referrer on the enlarged image", async () => {
    render(<MarkdownImage src="https://images.example.com/photo.png" alt="山间日落" />);
    fireEvent.click(screen.getByRole("img", { name: "山间日落" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "山间日落" })).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭预览" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("supports keyboard opening, Escape closing, and focus restoration", async () => {
    const user = userEvent.setup();
    render(<MarkdownImage src="/v1/uploads/test.jpg" alt="窗边" />);
    const trigger = screen.getByRole("button", { name: "预览图片：窗边" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("opens video links in a controlled player and stops playback when closed", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    render(<Markdown content="[旅途片段](https://media.example.com/travel.mp4?version=2)" />);
    await userEvent.click(screen.getByRole("button", { name: "预览视频：旅途片段" }));
    const dialog = await screen.findByRole("dialog");
    const player = dialog.querySelector("video");
    expect(player).toHaveAttribute("controls");
    expect(player).toHaveAttribute("src", "https://media.example.com/travel.mp4?version=2");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(pause).toHaveBeenCalled();
    pause.mockRestore();
  });
  it("previews video URLs written using image-style Markdown too", async () => {
    render(<Markdown content="![山海视频](https://media.example.com/movie.webm)" />);
    expect(screen.getByRole("button", { name: "预览视频：山海视频" })).toBeVisible();
  });
  it("does not turn normal article links into media", () => {
    render(<Markdown content="[项目文档](https://example.com/guide)" />);
    expect(screen.getByRole("link", { name: "项目文档" })).toHaveAttribute(
      "href",
      "https://example.com/guide",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("handles linked images without nesting an interactive button in a link", async () => {
    render(
      <Markdown content="[![山海](https://images.example.com/sea.jpg)](https://example.com/original)" />,
    );
    const trigger = screen.getByRole("button", { name: "预览图片：山海" });
    expect(trigger.closest("a")).toBeNull();
    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
  it("reports unavailable external images instead of opening a broken preview", () => {
    render(<MarkdownImage src="https://images.example.com/missing.jpg" alt="旧照片" />);
    fireEvent.error(screen.getByRole("img", { name: "旧照片" }));
    expect(screen.getByRole("status")).toHaveTextContent("图片暂时无法加载");
    expect(screen.getByRole("link", { name: "打开原图 ↗" })).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps raw HTML and executable URLs out of the article", () => {
    const { container } = render(
      <Markdown content={"<script>alert(1)</script>\n\n[恶意视频](javascript:alert(1))"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /预览视频/ })).not.toBeInTheDocument();
  });
});
