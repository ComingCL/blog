"use client";
import { PostStatus, PostAction, CommentFilter, AuditEvent, AuditSource } from "@/models/enums";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, write, ApiError } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { usePage } from "@/api/usePage";
import type { Page, Post, Draft, Comment, Site, Audit } from "@/api/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { AuthGate, useApp } from "@/components/Providers";
import { date, Empty, ErrorMessage, Markdown, Pagination } from "@/components/Content";
import { CommentItem } from "./Comments";
import { BASE, routes } from "@/router";
import { MarkdownEditor } from "@/components/MarkdownEditor";
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGate admin>
      <div className="nl-admin">
        <aside className="nl-sidebar">
          <div className="nl-sidebar-title">WRITING STUDIO</div>
          {[
            [routes.admin, "文章管理"],
            [routes.newPost, "写一篇文章"],
            [routes.comments, "评论与留言"],
            [routes.siteSettings, "站点设置"],
            [routes.audits, "审计与轨迹"],
          ].map(([path, label]) => (
            <Link
              className={
                "nl-sidebar-link " +
                (pathname === path || pathname === "/v1" + path ? "is-active" : "")
              }
              key={path}
              href={path}
            >
              {label}
            </Link>
          ))}
        </aside>
        <section className="nl-admin-body">{children}</section>
      </div>
    </AuthGate>
  );
}
export function AdminPosts() {
  const { notify } = useApp();
  const confirm = useConfirm();
  const [status, setStatus] = useState<PostStatus | "">(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const {
    data,
    error: loadError,
    loading,
    reload: load,
  } = usePage<Post>(
    endpoints.adminPosts + "?" + new URLSearchParams({ status, q, page: String(page) }),
    page,
    setPage,
    200,
  );
  async function action(id: string, kind: PostAction) {
    if (
      (kind === PostAction.Trash || kind === PostAction.Purge) &&
      !(await confirm({
        title: kind === PostAction.Purge ? "永久删除这篇文章？" : "将文章移入回收站？",
        description:
          kind === PostAction.Purge
            ? "文章和草稿将永久删除，无法恢复。"
            : "文章将从前台隐藏，你仍可在回收站中恢复。",
        action: kind === PostAction.Purge ? "永久删除" : "移入回收站",
        destructive: true,
      }))
    )
      return;
    setError("");
    try {
      await write(
        endpoints.postAction(id, kind === PostAction.Trash ? "" : kind),
        kind === PostAction.Trash || kind === PostAction.Purge ? "DELETE" : "POST",
      );
      load();
      notify("文章状态已更新");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="nl-spread">
        <div>
          <h1>文章管理</h1>
          <p className="nl-admin-sub">每一个想法，都从这里开始。</p>
        </div>
        <Link className="nl-btn nl-btn-gradient" href={routes.newPost}>
          ＋ 写文章
        </Link>
      </div>
      <label className="nl-field" style={{ marginTop: 24 }}>
        搜索文章
        <input
          className="nl-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="搜索文章或草稿标题"
        />
      </label>
      <div className="nl-tabs">
        {(
          [
            ["", "全部"],
            [PostStatus.Published, "已发布"],
            [PostStatus.Draft, "草稿"],
            [PostStatus.Trashed, "回收站"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            className={"nl-tab " + (v === status ? "is-active" : "")}
            onClick={() => {
              setStatus(v);
              setPage(1);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {(error || loadError) && (
        <ErrorMessage
          message={error || loadError}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {loading && <Empty>正在载入文章…</Empty>}
      <div className="nl-table-wrap">
        <table className="nl-table nl-post-table">
          <thead>
            <tr>
              <th>文章</th>
              <th>状态</th>
              <th>更新日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.list.map((p) => (
              <tr key={p.id}>
                <td className="nl-post-title">
                  <Link href={routes.edit(p.id)}>{p.title || "未命名草稿"}</Link>
                  <small>{p.category || "未分类"}</small>
                </td>
                <td>
                  <span className={"nl-status " + p.status}>
                    {p.status === PostStatus.Published
                      ? "● 已发布"
                      : p.status === PostStatus.Trashed
                        ? "○ 回收站"
                        : "○ 草稿"}
                  </span>
                </td>
                <td className="nl-post-date">{date(p.updated_at)}</td>
                <td className="nl-post-actions">
                  <div className="nl-table-actions">
                    {p.status === PostStatus.Trashed ? (
                      <>
                        <button onClick={() => action(p.id, PostAction.Restore)}>恢复</button>
                        <button
                          className="nl-danger"
                          onClick={() => action(p.id, PostAction.Purge)}
                        >
                          永久删除
                        </button>
                      </>
                    ) : (
                      <>
                        <Link href={routes.edit(p.id)}>编辑</Link>
                        <Link href={routes.preview(p.id)}>预览</Link>
                        {p.status === PostStatus.Published && (
                          <button onClick={() => action(p.id, PostAction.Unpublish)}>撤回</button>
                        )}
                        <button
                          className="nl-danger"
                          onClick={() => action(p.id, PostAction.Trash)}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.list.length === 0 && <Empty>还没有文章，写下第一段故事吧。</Empty>}
      {data && (
        <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
      )}
    </>
  );
}
export function NewPost() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");
  const create = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setError("");
    write<{ id: string }>(endpoints.adminPosts, "POST")
      .then((v) => router.replace(routes.edit(v.id)))
      .catch((e) => {
        started.current = false;
        setError(e.message);
      });
  }, [router]);
  useEffect(create, [create]);
  return error ? (
    <>
      <ErrorMessage message={error} />
      <button className="nl-btn" onClick={create}>
        重试创建
      </button>
    </>
  ) : (
    <Empty>正在为你的想法创建草稿…</Empty>
  );
}
function contentKey(d: Draft) {
  return JSON.stringify([d.title, d.slug, d.excerpt, d.markdown, d.category, d.tags, d.cover_url]);
}
export function Editor({ id }: { id: string }) {
  const { notify } = useApp();
  const confirm = useConfirm();
  const router = useRouter();
  const [form, setForm] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("正在载入…"),
    [saving, setSaving] = useState(false),
    [conflict, setConflict] = useState(false);
  const latest = useRef<Draft | null>(null),
    savedKey = useRef(""),
    inFlight = useRef<Promise<Draft | null> | null>(null),
    saveRef = useRef<() => Promise<Draft | null>>(async () => null);
  latest.current = form;
  const load = useCallback(async () => {
    try {
      const d = await api<Draft>(endpoints.draft(id));
      savedKey.current = contentKey(d);
      setForm(d);
      setConflict(false);
      setError("");
      setStatus("已载入草稿");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(): Promise<Draft | null> {
    if (inFlight.current) return inFlight.current;
    const snapshot = latest.current;
    if (!snapshot || conflict) return null;
    if (contentKey(snapshot) === savedKey.current) return snapshot;
    setSaving(true);
    setStatus("保存中…");
    const run = (async () => {
      try {
        const { post_id, status, ...payload } = snapshot;
        void post_id;
        void status;
        await write(endpoints.draft(id), "PATCH", payload);
        const fresh = await api<Draft>(endpoints.draft(id));
        savedKey.current = contentKey(snapshot);
        const merged = {
          ...(latest.current || snapshot),
          version: fresh.version,
          post_version: fresh.post_version,
        };
        latest.current = merged;
        setForm(merged);
        setStatus("已保存 · " + new Date().toLocaleTimeString("zh-CN"));
        setError("");
        return {
          ...snapshot,
          version: fresh.version,
          post_version: fresh.post_version,
        };
      } catch (e) {
        setError((e as Error).message);
        setStatus("保存失败，内容仍保留在编辑器中");
        if (e instanceof ApiError && e.status === 409) setConflict(true);
        return null;
      } finally {
        inFlight.current = null;
        setSaving(false);
      }
    })();
    inFlight.current = run;
    return run;
  }
  saveRef.current = save;
  useEffect(() => {
    if (!form || saving || conflict || contentKey(form) === savedKey.current) return;
    const t = setTimeout(() => void saveRef.current(), 3000);
    return () => clearTimeout(t);
  }, [form, saving, conflict]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (latest.current && contentKey(latest.current) !== savedKey.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setStatus("有未保存的修改");
  }
  async function ensureSaved(): Promise<Draft | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const saved = await saveRef.current();
      if (!saved) return null;
      if (latest.current && contentKey(latest.current) === savedKey.current) return latest.current;
    }
    setError("还有修改正在保存，请稍后再试。");
    return null;
  }
  const ensureSavedRef = useRef(ensureSaved);
  ensureSavedRef.current = ensureSaved;
  useEffect(() => {
    let asking = false;
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, location.href);
      if (
        target.origin !== location.origin ||
        (target.pathname !== BASE && !target.pathname.startsWith(BASE + "/"))
      )
        return;
      if (target.pathname === location.pathname && target.search === location.search) return;
      if (!latest.current || contentKey(latest.current) === savedKey.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (asking) return;
      asking = true;
      void (async () => {
        try {
          if (
            await confirm({
              title: "保存后离开编辑器？",
              description: "当前修改还未保存。保存成功后再打开新页面，也可以留在这里继续写。",
              action: "保存并离开",
            })
          ) {
            if (await ensureSavedRef.current())
              router.push(
                (target.pathname.slice(BASE.length) || "/") + target.search + target.hash,
              );
          }
        } finally {
          asking = false;
        }
      })();
    };
    document.addEventListener("click", guardLink, true);
    return () => document.removeEventListener("click", guardLink, true);
  }, [confirm, router]);
  async function publish() {
    const d = await ensureSaved();
    if (!d) return;
    if (!d.title.trim() || !d.markdown.trim()) {
      setError("请先填写标题与正文");
      return;
    }
    try {
      await write(endpoints.publish(id), "POST", {
        version: d.version,
        post_version: d.post_version,
      });
      notify("文章已发布");
      router.push(routes.admin);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!form)
    return <>{error ? <ErrorMessage message={error} /> : <Empty>正在载入编辑器…</Empty>}</>;
  return (
    <>
      <div className="nl-spread nl-editor-head">
        <div>
          <Link className="nl-textbtn" href={routes.admin}>
            ← 文章管理
          </Link>
          <h1 style={{ marginTop: 10 }}>安静地，写一点。</h1>
          <p className="nl-admin-sub" aria-live="polite">
            {status}
          </p>
        </div>
        <div className="nl-actions" style={{ marginTop: 0 }}>
          <button className="nl-btn" disabled={saving || conflict} onClick={() => void save()}>
            保存草稿
          </button>
          <button
            className="nl-btn"
            disabled={saving || conflict}
            onClick={async () => {
              if (await ensureSaved()) router.push(routes.preview(id));
            }}
          >
            预览
          </button>
          <button
            className="nl-btn nl-btn-gradient"
            disabled={saving || conflict}
            onClick={() => void publish()}
          >
            {form.status === PostStatus.Published ? "更新发布 ↗" : "发布文章 ↗"}
          </button>
        </div>
      </div>
      {error && <ErrorMessage message={error} />}{" "}
      {conflict && (
        <button
          className="nl-btn"
          onClick={async () => {
            if (
              await confirm({
                title: "重新载入最新草稿？",
                description: "当前尚未保存的修改会被最新草稿替换。",
                action: "重新载入",
              })
            )
              void load();
          }}
        >
          重新载入最新草稿
        </button>
      )}
      <label className="nl-field">
        文章标题
        <input
          className="nl-editor-title"
          value={form.title}
          maxLength={200}
          onChange={(e) => update("title", e.target.value)}
          placeholder="为这个想法起一个名字"
        />
      </label>
      <div className="nl-editor-meta">
        <label className="nl-field">
          固定链接 slug
          <input
            className="nl-search"
            value={form.slug}
            disabled={form.status === PostStatus.Published}
            onChange={(e) => update("slug", e.target.value)}
            pattern="[a-z0-9-]+"
          />
          <small>小写字母、数字和连字符，首次发布后不可修改</small>
        </label>
        <label className="nl-field">
          分类
          <input
            className="nl-search"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="技术 / 随笔"
          />
        </label>
        <label className="nl-field">
          标签，以逗号分隔
          <input
            className="nl-search"
            value={form.tags.join(", ")}
            onChange={(e) =>
              update(
                "tags",
                e.target.value.split(",").map((x) => x.trim()),
              )
            }
          />
        </label>
        <label className="nl-field">
          封面图片
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="nl-search"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              try {
                const v = await api<{ url: string }>(endpoints.media, {
                  method: "POST",
                  body: data,
                });
                update("cover_url", v.url);
                notify("封面已上传");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
      </div>
      <label className="nl-field">
        摘要
        <textarea
          className="nl-search"
          value={form.excerpt}
          maxLength={1000}
          onChange={(e) => update("excerpt", e.target.value)}
        />
      </label>
      <MarkdownEditor value={form.markdown} onChange={(text) => update("markdown", text)} />
      <span className="nl-admin-sub">
        {form.markdown.length} 字符 · 修改后 3 秒自动保存，发布需手动确认
      </span>
    </>
  );
}
export function DraftPreview({ id }: { id: string }) {
  const [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Draft>(endpoints.draft(id))
      .then(setDraft)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      {error && <ErrorMessage message={error} />}
      <div className="nl-banner">
        <span>
          {draft?.status === PostStatus.Published
            ? "草稿预览 · 不影响已发布内容"
            : "草稿预览 · 未发布"}
        </span>
        <Link href={routes.edit(id)}>返回编辑器 ↗</Link>
      </div>
      {draft && (
        <article style={{ maxWidth: 740, margin: "30px auto" }}>
          <span className="nl-tag">{draft.category}</span>
          <h1 style={{ fontSize: 40, lineHeight: 1.4, margin: "22px 0" }}>{draft.title}</h1>
          <p style={{ color: "#b8bac4", marginBottom: 28 }}>{draft.excerpt}</p>
          <Markdown content={draft.markdown} />
        </article>
      )}
    </>
  );
}
export function AdminComments() {
  const [filter, setFilter] = useState<CommentFilter>(CommentFilter.All),
    [page, setPage] = useState(1);
  const {
    data,
    error,
    loading,
    reload: load,
  } = usePage<Comment>(
    endpoints.adminComments + "?" + new URLSearchParams({ filter, page: String(page) }),
    page,
    setPage,
  );
  return (
    <>
      <h1>窗边的回声</h1>
      <p className="nl-admin-sub">读者的评论与留言，都在这里。</p>
      <div className="nl-tabs">
        {(
          [
            [CommentFilter.All, "全部"],
            [CommentFilter.Unread, "未读"],
            [CommentFilter.Unreplied, "待回复"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            className={"nl-tab " + (filter === v ? "is-active" : "")}
            onClick={() => {
              setFilter(v);
              setPage(1);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && <Empty>正在载入评论…</Empty>}
      {data?.list.map((c) => (
        <article className="nl-inbox-item" key={c.id}>
          <CommentItem comment={c} onChange={load} admin />
          <div className="nl-source">{c.post_id ? "文章评论 · " + c.post_id : "来自留言板"}</div>
        </article>
      ))}
      {data?.list.length === 0 && <Empty>已处理完所有对话，去写点新东西吧。</Empty>}
      {data && (
        <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
      )}
    </>
  );
}
export function SiteSettings() {
  const { site, setSite, notify } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<Site>(site),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Site>(endpoints.adminSettings)
      .then((value) => {
        setForm(value);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!loaded) return error ? <ErrorMessage message={error} /> : <Empty>正在载入站点设置…</Empty>;
  return (
    <>
      <div className="nl-settings-head">
        <div className="nl-eyebrow">Make it yours</div>
        <h1>你的名字，你的空间。</h1>
        <p className="nl-admin-sub">设置博客名称、简介与首页背景，保存后对访客生效。</p>
      </div>
      <div className="nl-settings-grid">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await write(endpoints.adminSettings, "PUT", form);
              const fresh = await api<Site>(endpoints.site);
              setForm(fresh);
              setSite(fresh);
              notify("站点设置已保存");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="nl-field">
            博客名称
            <input
              className="nl-search"
              required
              maxLength={24}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="nl-field">
            英文名称
            <input
              className="nl-search"
              maxLength={40}
              value={form.english_name}
              onChange={(e) => setForm({ ...form, english_name: e.target.value })}
            />
          </label>
          <label className="nl-field">
            简介
            <textarea
              className="nl-search"
              maxLength={120}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="nl-motion-setting">
            <input
              type="checkbox"
              checked={form.hero_motion_enabled}
              onChange={(e) => setForm({ ...form, hero_motion_enabled: e.target.checked })}
            />
            <span>
              动态雨夜背景
              <small>静音循环播放，可暂停；减少动态效果时自动回退静态封面。</small>
            </span>
          </label>
          {error && <ErrorMessage message={error} />}
          <button className="nl-btn nl-btn-gradient" disabled={busy}>
            保存设置 ↗
          </button>
        </form>
        <aside className="nl-brand-preview">
          <div className="nl-eyebrow">Brand preview</div>
          <span className="nl-mark">{form.english_name[0]?.toLowerCase() || "n"}.</span>
          <h2>{form.name}</h2>
          <div className="nl-word" style={{ margin: "auto" }}>
            {form.english_name}
          </div>
          <p>{form.description}</p>
          <span className="nl-comment-time">写下自己的故事。</span>
        </aside>
      </div>
    </>
  );
}
export function Audits() {
  const [data, setData] = useState<Page<Audit> | null>(null),
    [page, setPage] = useState(1),
    [event, setEvent] = useState<AuditEvent | "">(""),
    [actor, setActor] = useState(""),
    [username, setUsername] = useState(""),
    [clientIP, setClientIP] = useState(""),
    [visit, setVisit] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<Page<Audit>>(
        endpoints.audits +
          "?" +
          new URLSearchParams({
            page: String(page),
            event_type: event,
            actor_id: actor,
            username,
            client_ip: clientIP,
            visit_id: visit,
          }),
      )
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, event, actor, visit, username, clientIP]);
  return (
    <>
      <h1>审计与访问轨迹</h1>
      <p className="nl-admin-sub">记录访问 IP、登录用户名、页面与操作，支持按访问会话追踪。</p>
      <div className="nl-editor-meta" style={{ marginTop: 25 }}>
        <label className="nl-field">
          事件类型
          <select
            className="nl-search"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value as AuditEvent | "");
              setPage(1);
            }}
          >
            {[
              "",
              AuditEvent.PageView,
              AuditEvent.ArticleRead,
              AuditEvent.Engagement,
              AuditEvent.ContentAccess,
              AuditEvent.Login,
              AuditEvent.LoginFailed,
              AuditEvent.PostPublish,
              AuditEvent.DraftSave,
              AuditEvent.SettingsUpdate,
              AuditEvent.AuditView,
            ].map((v) => (
              <option key={v} value={v}>
                {v || "全部事件"}
              </option>
            ))}
          </select>
        </label>
        <label className="nl-field">
          用户名
          <input
            className="nl-search"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPage(1);
            }}
            placeholder="完整用户名，如 admin"
            maxLength={24}
          />
        </label>
        <label className="nl-field">
          访问 IP
          <input
            className="nl-search"
            value={clientIP}
            onChange={(e) => {
              setClientIP(e.target.value);
              setPage(1);
            }}
            placeholder="IPv4 或 IPv6"
          />
        </label>
        <label className="nl-field">
          用户 ID
          <input
            className="nl-search"
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="nl-field">
          访问会话 ID
          <input
            className="nl-search"
            value={visit}
            onChange={(e) => {
              setVisit(e.target.value);
              setPage(1);
            }}
            placeholder="点击记录中的会话查看轨迹"
          />
        </label>
      </div>
      {error && <ErrorMessage message={error} />}
      <div className="nl-table-wrap">
        <table className="nl-table">
          <thead>
            <tr>
              <th>时间 / 请求</th>
              <th>事件</th>
              <th>用户 / 访问会话</th>
              <th>访问 IP</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {data?.list.map((a) => (
              <tr key={a.id}>
                <td>
                  {new Date(a.occurred_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                  <small>{a.request_id}</small>
                </td>
                <td>
                  {a.event_type}
                  <small>
                    {a.route} · {a.source === AuditSource.Client ? "客户端上报" : "服务端确认"}
                  </small>
                </td>
                <td>
                  <span>{a.username || (a.actor_id ? "历史用户记录" : "匿名访客")}</span>
                  {a.actor_id && <small>用户 ID：{a.actor_id}</small>}
                  <small>
                    {a.visit_id ? (
                      <button
                        className="nl-textbtn"
                        onClick={() => {
                          setVisit(a.visit_id);
                          setPage(1);
                        }}
                      >
                        {a.visit_id}
                      </button>
                    ) : (
                      a.visitor_id
                    )}
                  </small>
                </td>
                <td>
                  <code>{a.client_ip || "历史记录未采集"}</code>
                </td>
                <td>{a.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.list.length === 0 && <Empty>没有匹配的审计记录。</Empty>}
      {data && (
        <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
      )}
    </>
  );
}
