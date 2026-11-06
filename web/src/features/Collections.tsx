"use client";
import { CollectionKind, ReactionKind } from "@/models/enums";
import { useState } from "react";
import Link from "next/link";
import { write } from "@/api/client";
import { usePage } from "@/api/usePage";
import { endpoints } from "@/api/endpoints";
import type { Post } from "@/api/types";
import { AuthGate, useApp } from "@/components/Providers";
import { date, Empty, ErrorMessage, Pagination } from "@/components/Content";
import { routes } from "@/router";
export function Collections({ kind }: { kind: CollectionKind }) {
  const { user } = useApp();
  return (
    <AuthGate>
      <List key={`${user?.id}:${kind}`} kind={kind} />
    </AuthGate>
  );
}
function List({ kind }: { kind: CollectionKind }) {
  const { notify, user } = useApp();
  const [page, setPage] = useState(1);
  const {
    data,
    error,
    loading,
    reload: load,
  } = usePage<Post>(endpoints.collection(kind) + "?page=" + page, page, setPage);
  return (
    <section className="nl-page">
      <div className="nl-pagehead">
        <div className="nl-eyebrow">Your reading corner</div>
        <h1>
          留给<span className="nl-gradient">下一次阅读。</span>
        </h1>
        <p>你好，{user?.display_name}。这里收好了你喜欢的文字。</p>
      </div>
      <div className="nl-tabs">
        <Link
          className={"nl-tab " + (kind === CollectionKind.Bookmarks ? "is-active" : "")}
          href={routes.bookmarks}
        >
          我的收藏
        </Link>
        <Link
          className={"nl-tab " + (kind === CollectionKind.Likes ? "is-active" : "")}
          href={routes.likes}
        >
          我的点赞
        </Link>
      </div>
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && <Empty>正在载入你的记录…</Empty>}
      <div>
        {data?.list.map((p) => (
          <article className="nl-list-row" key={p.id}>
            <div>
              {!p.unavailable && <span className="nl-tag">{p.category || "随笔"}</span>}
              {p.unavailable ? (
                <h3>文章暂不可用</h3>
              ) : (
                <Link className="nl-card-title" href={routes.post(p.slug)}>
                  <h3>{p.title}</h3>
                </Link>
              )}
              <p>{p.unavailable ? "作者暂时收起了这篇文章。" : p.excerpt}</p>
              {!p.unavailable && <div className="nl-meta">{date(p.published_at)}</div>}
            </div>
            <button
              className="nl-btn"
              onClick={async () => {
                try {
                  await write(
                    endpoints.reaction(
                      p.id,
                      kind === CollectionKind.Likes ? ReactionKind.Like : ReactionKind.Bookmark,
                    ),
                    "DELETE",
                  );
                  load();
                  notify("记录已更新");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              {kind === CollectionKind.Likes ? "取消点赞" : "取消收藏"}
            </button>
          </article>
        ))}
      </div>
      {data?.list.length === 0 && (
        <Empty>
          这里还是空的。<Link href={routes.posts}>去读一篇喜欢的文章 ↗</Link>
        </Empty>
      )}
      {data && (
        <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
      )}
    </section>
  );
}
