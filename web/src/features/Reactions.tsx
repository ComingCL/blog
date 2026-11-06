"use client";
import { ReactionKind } from "@/models/enums";
import { useEffect, useRef, useState } from "react";
import { api, write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { useApp } from "@/components/Providers";
export function Reactions({ postId, likes }: { postId: string; likes: number }) {
  const { user, notify, openAuth } = useApp();
  const [state, setState] = useState({ liked: false, bookmarked: false }),
    [count, setCount] = useState(likes),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!user),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const owner = `${postId}:${user?.id || "guest"}`;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  useEffect(() => setCount(likes), [postId, likes]);
  useEffect(() => {
    let active = true;
    setState({ liked: false, bookmarked: false });
    setLoaded(!user);
    setError("");
    setBusy(false);
    if (user) {
      api<typeof state>(endpoints.reactions(postId))
        .then((value) => {
          if (active) {
            setState(value);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [user?.id, postId, retry]);
  async function toggle(kind: ReactionKind) {
    if (!user) {
      openAuth();
      return;
    }
    if (busy || !loaded) return;
    const field = kind === ReactionKind.Like ? "liked" : "bookmarked",
      previous = state,
      on = !previous[field];
    setBusy(true);
    setState({ ...previous, [field]: on });
    if (kind === ReactionKind.Like) setCount((c) => c + (on ? 1 : -1));
    try {
      await write(endpoints.reaction(postId, kind), on ? "PUT" : "DELETE");
      if (currentOwner.current !== owner) return;
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
      if (currentOwner.current !== owner) return;
      setState(previous);
      if (kind === ReactionKind.Like) setCount((c) => c + (on ? -1 : 1));
      notify((e as Error).message);
    } finally {
      if (currentOwner.current === owner) setBusy(false);
    }
  }
  return (
    <div className="nl-reactions">
      <button
        className={"nl-btn " + (state.liked ? "nl-selected" : "")}
        aria-pressed={state.liked}
        disabled={busy || (!!user && !loaded)}
        onClick={() => toggle(ReactionKind.Like)}
      >
        {state.liked ? "♥ 已点赞" : "♡ 点赞"} · {count}
      </button>
      <button
        className={"nl-btn " + (state.bookmarked ? "nl-selected" : "")}
        aria-pressed={state.bookmarked}
        disabled={busy || (!!user && !loaded)}
        onClick={() => toggle(ReactionKind.Bookmark)}
      >
        {state.bookmarked ? "已收藏 ✓" : "收藏文章 ＋"}
      </button>
      <span className="nl-comment-time">留住值得再读的文字</span>
      {error && (
        <div role="alert" className="nl-reaction-error">
          {error}{" "}
          <button className="nl-textbtn" onClick={() => setRetry((v) => v + 1)}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
