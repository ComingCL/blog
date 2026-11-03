import Link from "next/link";
import { serverApi } from "@/api/server";
import type { Page, Post } from "@/api/types";
import { Hero } from "@/components/Hero";
import { PostCard, Empty, ErrorMessage } from "@/components/Content";
import { routes } from "@/router";
export default async function Home() {
  let posts: Post[] = [];
  let error = "";
  try {
    posts = (await serverApi<Page<Post>>("/posts?page_size=4")).list;
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <Hero />
      <div className="nl-wrap" id="recent-stories">
        {posts[0] && (
          <section className="nl-feature">
            <div>
              <div className="nl-label">EDITOR&apos;S PICK / 本期精选</div>
              <Link href={routes.post(posts[0].slug)} className="nl-card-title">
                <h2>{posts[0].title}</h2>
              </Link>
              <div className="nl-meta">
                <span>{posts[0].category}</span>
                <span>{posts[0].likes} 次喜欢</span>
              </div>
            </div>
            <Link className="nl-orbit" href={routes.post(posts[0].slug)}>
              ↗
            </Link>
          </section>
        )}
        <div className="nl-sectionhead">
          <div>
            <h2>最近写下的</h2>
            <small>NOTES & STORIES</small>
          </div>
          <Link href={routes.posts}>全部文章 ↗</Link>
        </div>
        {error ? (
          <ErrorMessage message={error} />
        ) : posts.length ? (
          <div className="nl-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <Empty>这里的故事，正在开始。博主发布文章后，会出现在这里。</Empty>
        )}
      </div>
    </>
  );
}
