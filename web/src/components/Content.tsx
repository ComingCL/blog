import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Post } from "@/api/types";
import { routes } from "@/router";
import { MarkdownImage } from "./MarkdownImage";
import { MediaPreview } from "./MediaPreview";
import { isVideoURL } from "./media";
import { readingMedia } from "./readingMedia";
import { MediaKind } from "@/models/enums";

// Keep stateful media renderers stable when the editor dispatches scroll/click
// updates. Inline component functions would remount and close their dialogs.
const renderImage: Components["img"] = ({ src, alt, title }) => (
  <MarkdownImage src={src} alt={alt} title={title} />
);
const renderLink: Components["a"] = ({ href, children, node }) => {
  if (node?.children.some((child) => child.type === "element" && child.tagName === "img"))
    return <span>{children}</span>;
  if (href && isVideoURL(href))
    return (
      <MediaPreview
        src={href}
        title={typeof children === "string" ? children : "文章视频"}
        kind={MediaKind.Video}
      />
    );
  return <a href={href}>{children}</a>;
};
export const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "尚未发布";
export function Markdown({ content, reading = false }: { content: string; reading?: boolean }) {
  let heading = 0;
  return (
    <div className={reading ? "nl-prose nl-prose-reading" : "nl-prose"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={reading ? [readingMedia] : []}
        skipHtml
        components={{
          h2: ({ children }) => <h2 id={"section-" + heading++}>{children}</h2>,
          img: renderImage,
          a: renderLink,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
export function PostCard({ post }: { post: Post }) {
  return (
    <article className="nl-card">
      <Link href={routes.post(post.slug)} aria-label={post.title}>
        <div
          className={"nl-cover " + (post.category === "技术" ? "nl-cover-code" : "nl-cover-photo")}
          style={
            post.cover_url
              ? {
                  backgroundImage: `url(${post.cover_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {!post.cover_url && post.category === "技术" && (
            <div className="nl-code-art">
              <em>func</em> main() {"{"}
              <br />
              　ideas := <em>"hello, world"</em>
              <br />
              　write(ideas)
              <br />
              {"}"}
            </div>
          )}
        </div>
      </Link>
      <div className="nl-card-body">
        <span className="nl-tag">{post.category || "随笔"}</span>
        <Link className="nl-card-title" href={routes.post(post.slug)}>
          <h3>{post.title}</h3>
        </Link>
        <p>{post.excerpt}</p>
        <div className="nl-card-foot">
          <span>
            {date(post.published_at)} · {post.likes} 次喜欢
          </span>
          <Link href={routes.post(post.slug)}>阅读全文 ↗</Link>
        </div>
      </div>
    </article>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="nl-empty">{children}</div>;
}
export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="nl-error" role="alert">
      {message}
      {onRetry && (
        <button className="nl-textbtn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages < 2) return null;
  return (
    <div className="nl-pagination">
      <button className="nl-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← 上一页
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button className="nl-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页 →
      </button>
    </div>
  );
}
