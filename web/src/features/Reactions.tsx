"use client";
import { ReactionKind } from "@/models/enums";
import { useEffect, useState } from "react";
import { api, write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { useApp } from "@/components/Providers";
export function Reactions({ postId, likes }: { postId: string; likes: number }) {
  const { user, notify, openAuth } = useApp();
  const [state, setState] = useState({ liked: false, bookmarked: false }),
    [count, setCount] = useState(likes),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user)
      api<typeof state>(endpoints.reactions(postId))
        .then(setState)
        .catch(() => {});
  }, [user, postId]);
  async function toggle(kind: ReactionKind) {
    if (!user) {
      openAuth();
      return;
    }
    if (busy) return;
    const field = kind === ReactionKind.Like ? "liked" : "bookmarked",
      previous = state,
      on = !previous[field];
    setBusy(true);
    setState({ ...previous, [field]: on });
    if (kind === ReactionKind.Like) setCount((c) => c + (on ? 1 : -1));
    try {
      await write(endpoints.reaction(postId, kind), on ? "PUT" : "DELETE");
      notify(
        kind === ReactionKind.Bookmark
          ? on
            ? "已加入我的收藏"
            : "已取消收藏"
          : on
            ? "谢谢你的喜欢"
            : "已取消点赞",
      );
    } catch (e) {
      setState(previous);
      if (kind === ReactionKind.Like) setCount((c) => c + (on ? -1 : 1));
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="nl-reactions">
      <button
        className={"nl-btn " + (state.liked ? "nl-selected" : "")}
        aria-pressed={state.liked}
        disabled={busy}
        onClick={() => toggle(ReactionKind.Like)}
      >
        {state.liked ? "♥ 已点赞" : "♡ 点赞"} · {count}
      </button>
      <button
        className={"nl-btn " + (state.bookmarked ? "nl-selected" : "")}
        aria-pressed={state.bookmarked}
        disabled={busy}
        onClick={() => toggle(ReactionKind.Bookmark)}
      >
        {state.bookmarked ? "已收藏 ✓" : "收藏文章 ＋"}
      </button>
      <span className="nl-comment-time">留住值得再读的文字</span>
    </div>
  );
}
