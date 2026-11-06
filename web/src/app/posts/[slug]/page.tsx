import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverApi, ServerApiError } from "@/api/server";
import type { Post } from "@/api/types";
import { Markdown, date } from "@/components/Content";
import { Reactions } from "@/features/Reactions";
import { Comments } from "@/features/Comments";
import { routes, toPublicPath } from "@/router";
import { articleHeadings } from "@/components/headings";
const load = cache(async (slug: string) => {
  try {
    return await serverApi<Post>("/posts/" + encodeURIComponent(slug));
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  return {
    title: p.title,
    description: p.excerpt,
    alternates: { canonical: toPublicPath(routes.post(p.slug)) },
    openGraph: { title: p.title, description: p.excerpt, type: "article" },
  };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  const headings = articleHeadings(p.markdown || "");
  const readingClass = headings.length ? "nl-reading" : "nl-reading nl-reading-single";
  return (
    <article data-post-id={p.id}>
      <header className="nl-article-top">
        <div className={`${readingClass} nl-reading-head`}>
          <div>
            <Link href={routes.posts} className="nl-textbtn">
              ← 所有文章
            </Link>
            <div style={{ marginTop: 20 }}>
              <span className="nl-tag">{p.category || "随笔"}</span>
            </div>
            <h1>{p.title}</h1>
            <p className="nl-article-intro">{p.excerpt}</p>
            <div className="nl-meta">
              <span>{date(p.published_at)}</span>
              <span>{Math.max(1, Math.ceil((p.markdown || "").length / 500))} 分钟阅读</span>
              <span>{p.likes} 次喜欢</span>
            </div>
          </div>
        </div>
      </header>
      <div className={readingClass}>
        <div>
          <Markdown content={p.markdown || ""} reading />
          <Reactions postId={p.id} likes={p.likes} />
          <Comments postId={p.id} />
        </div>
        {headings.length > 0 && (
          <aside className="nl-toc" aria-label="文章目录">
            <strong>文章目录</strong>
            {headings.map((h, i) => (
              <a href={"#section-" + i} key={i}>
                {h}
              </a>
            ))}
          </aside>
        )}
      </div>
    </article>
  );
}
