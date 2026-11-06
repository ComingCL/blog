"use client";
import { CommentStatus } from "@/models/enums";
import { useEffect, useState, type FormEvent } from "react";
import { usePage } from "@/api/usePage";
import { write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { Comment } from "@/api/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { useApp } from "@/components/Providers";
import { date, Empty, ErrorMessage, Pagination } from "@/components/Content";
export function CommentItem({
  comment,
  onChange,
  admin = false,
}: {
  comment: Comment;
  onChange: () => void;
  admin?: boolean;
}) {
  const { site, user, notify } = useApp();
  const confirm = useConfirm();
  const [reply, setReply] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await write(endpoints.reply(comment.id), "POST", { body: reply });
      setReply("");
      setOpen(false);
      onChange();
      notify("回复已发送");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="nl-comment">
      <span className="nl-avatar">
        {(comment.is_admin ? site.name : comment.author_name).slice(0, 1)}
      </span>
      <div className="nl-comment-content">
        <div className="nl-comment-name">
          <span>{comment.is_admin ? site.name : comment.author_name}</span>
          {comment.is_admin && <span className="nl-tag">博主</span>}
          <span className="nl-comment-time">{date(comment.created_at)}</span>
          {admin && (
            <span className="nl-tag">
              {comment.status === CommentStatus.Hidden
                ? "已隐藏"
                : comment.read_at
                  ? "已读"
                  : "未读"}
            </span>
          )}
        </div>
        <p>{comment.body}</p>
        {comment.replies.map((r) => (
          <div key={r.id} className="nl-reply">
            <div className="nl-comment-name">
              {r.is_admin ? site.name : r.author_name}
              <span className="nl-tag">博主</span>
            </div>
            <p>{r.body}</p>
            {admin && <ReplyEditor reply={r} onChange={onChange} />}
          </div>
        ))}
        <div className="nl-table-actions" style={{ marginTop: 12 }}>
          {admin && (
            <>
              <button onClick={() => setOpen(!open)}>回复</button>
              <button
                onClick={async () => {
                  try {
                    await write(endpoints.comment(comment.id, true), "PATCH", {
                      read: true,
                    });
                    onChange();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                标为已读
              </button>
              <button
                onClick={async () => {
                  try {
                    await write(endpoints.comment(comment.id, true), "PATCH", {
                      status:
                        comment.status === CommentStatus.Hidden
                          ? CommentStatus.Visible
                          : CommentStatus.Hidden,
                    });
                    onChange();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {comment.status === CommentStatus.Hidden ? "恢复显示" : "隐藏"}
              </button>
            </>
          )}
          {comment.status !== CommentStatus.Deleted &&
            (admin || user?.id === comment.author_id) && (
              <button
                className="nl-danger"
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "删除这条留言？",
                      description: "留言内容删除后无法恢复，已产生的回复会保留在对话中。",
                      action: "删除留言",
                      destructive: true,
                    }))
                  )
                    return;
                  try {
                    await write(endpoints.comment(comment.id, admin), "DELETE");
                    onChange();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                删除
              </button>
            )}
        </div>
        {open && (
          <form onSubmit={send} style={{ marginTop: 14 }}>
            <label className="nl-field">
              以博主身份回复
              <textarea
                className="nl-search"
                required
                maxLength={2000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </label>
            <button className="nl-btn nl-btn-primary" disabled={busy}>
              发送回复
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
function ReplyEditor({ reply, onChange }: { reply: Comment; onChange: () => void }) {
  const { notify } = useApp();
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(reply.body);
  return (
    <>
      <button className="nl-textbtn" onClick={() => setOpen(!open)}>
        修改回复
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await write(endpoints.editReply(reply.id), "PATCH", { body });
              setOpen(false);
              onChange();
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          <label className="nl-field">
            回复内容
            <textarea
              className="nl-search"
              required
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button className="nl-btn">保存回复</button>
        </form>
      )}
    </>
  );
}
export function Comments({ postId }: { postId?: string }) {
  const { user, notify, openAuth } = useApp();
  const [body, setBody] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = postId ? endpoints.comments(postId) : endpoints.guestbook;
  const {
    data,
    error: loadError,
    loading,
    reload: load,
  } = usePage<Comment>(path + "?page=" + page, page, setPage);
  useEffect(() => {
    try {
      setBody(sessionStorage.getItem("comment-draft:" + path) || "");
    } catch {}
  }, [path]);
  function change(v: string) {
    setBody(v);
    try {
      sessionStorage.setItem("comment-draft:" + path, v);
    } catch {}
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await write(path, "POST", { body });
      change("");
      load();
      notify("留言已发布");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nl-comment-section">
      <h2 style={{ fontSize: 22 }}>
        窗边的对话 <span className="nl-comment-time">{data?.pagination.total || 0}</span>
      </h2>
      <form className="nl-composer" onSubmit={send}>
        <label className="nl-field">
          {postId ? "聊聊你的想法" : "留下一点想说的话"}
          <textarea
            className="nl-search"
            name="body"
            value={body}
            maxLength={2000}
            onChange={(e) => change(e.target.value)}
            placeholder="此刻的想法，也值得被记录。"
            required
          />
        </label>
        <div className="nl-spread">
          <span className="nl-comment-time">
            {user ? `以「${user.display_name}」的身份留言` : "登录后可发布，未提交文字会保留"}
          </span>
          {user ? (
            <button className="nl-btn nl-btn-primary" disabled={busy}>
              {busy ? "发布中…" : "发布留言 ↗"}
            </button>
          ) : (
            <button type="button" className="nl-btn nl-btn-primary" onClick={() => openAuth()}>
              登录后留言
            </button>
          )}
        </div>
      </form>
      {(error || loadError) && (
        <ErrorMessage
          message={error || loadError}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {loading && <Empty>正在载入留言…</Empty>}
      <div>
        {data?.list.map((c) => (
          <CommentItem key={c.id} comment={c} onChange={load} />
        ))}
      </div>
      {data && data.list.length === 0 && <Empty>第一句话，留给此刻的你。</Empty>}
      {data && (
        <Pagination page={page} totalPages={data.pagination.total_pages} onChange={setPage} />
      )}
    </section>
  );
}
