"use client";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { Page, Post } from "@/api/types";
import { PostCard, Empty, ErrorMessage, Pagination } from "@/components/Content";
export function Posts() {
  const [data, setData] = useState<Page<Post> | null>(null),
    [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [categories, setCategories] = useState<string[]>([]),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    api<string[]>(endpoints.categories)
      .then(setCategories)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    const timer = setTimeout(() => {
      api<Page<Post>>(
        endpoints.posts + "?" + new URLSearchParams({ q, category, page: String(page) }),
      )
        .then((v) => active && setData(v))
        .catch((e) => active && setError(e.message));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, category, page]);
  return (
    <section className="nl-page">
      <div className="nl-pagehead">
        <div className="nl-eyebrow">The journal</div>
        <h1>
          写下的，都是<span className="nl-gradient">来过的。</span>
        </h1>
        <p>技术笔记与日常碎片，在这里慢慢生长。</p>
      </div>
      <label className="nl-field">
        搜索文章
        <input
          className="nl-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="搜索文章标题…"
        />
      </label>
      <div className="nl-tabs">
        {["", ...categories].map((c) => (
          <button
            key={c}
            className={"nl-tab " + (category === c ? "is-active" : "")}
            onClick={() => {
              setCategory(c);
              setPage(1);
            }}
          >
            {c || "全部"}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorMessage message={error} />
      ) : !data ? (
        <Empty>正在寻找那些值得留下的文字…</Empty>
      ) : data.list.length ? (
        <>
          <div className="nl-grid">
            {data.list.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
        </>
      ) : (
        <Empty>没有找到文章，换个关键词试试。</Empty>
      )}
    </section>
  );
}
