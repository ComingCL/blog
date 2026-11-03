"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Eye, EyeOff, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { BASE } from "@/router";
import { useApp, AuthMode } from "./AppContext";

export function AuthArtwork() {
  const { site } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (motion.matches || document.hidden || !site.hero_motion_enabled) video.current?.pause();
      else void video.current?.play().catch(() => {});
    };
    sync();
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [site.hero_motion_enabled]);
  return (
    <aside className="nl-auth-art" aria-label="雨夜窗边">
      <video
        ref={video}
        src={`${BASE}/images/rainy-night-loop.mp4`}
        poster={`${BASE}/images/rainy-night-poster.jpg`}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <span className="nl-art-label">A WINDOW TO THE WANDERER</span>
      <div className="nl-art-caption">
        <span className="nl-art-index">01 / 在文字里，遇见远方</span>
        <p>
          把日子写成诗，
          <br />
          把远方留给自己。
        </p>
        <span>一扇窗，一场雨，还有未写完的故事。</span>
      </div>
    </aside>
  );
}

export function AuthFields({
  mode,
  onModeChange,
  onSuccess,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
}) {
  const { site, refresh, notify } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const id = useId();
  const register = mode === AuthMode.Register;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username")),
      password = String(data.get("password"));
    try {
      if (register)
        await write(endpoints.register, "POST", {
          username,
          password,
          display_name: String(data.get("display_name")),
        });
      await write(endpoints.login, "POST", { username, password });
      await refresh();
      if (mounted.current) onSuccess();
      notify(register ? "很高兴在这里遇见你" : "欢迎回来，继续你的故事");
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="nl-auth-fields">
      <div className="nl-auth-brand">
        <span className="nl-auth-mark">{site.english_name[0]?.toLowerCase() || "n"}.</span>
        <span>
          {site.name}
          {site.english_name.toLowerCase() !== site.name.toLowerCase() && (
            <small>{site.english_name}</small>
          )}
        </span>
      </div>
      <div className="nl-auth-intro">
        <span>GOOD TO SEE YOU HERE</span>
        <h2>{register ? "初次见面，幸会。" : "好久不见，欢迎回来。"}</h2>
        <p>
          {register
            ? "为文字停留，也为彼此留下一个名字。"
            : "登录，收好喜欢的文字，留下此刻的心情。"}
        </p>
      </div>
      <div className="nl-auth-switch" aria-label="账号操作">
        <button
          type="button"
          aria-pressed={!register}
          disabled={busy}
          onClick={() => {
            setError("");
            onModeChange(AuthMode.Login);
          }}
        >
          登录
        </button>
        <button
          type="button"
          aria-pressed={register}
          disabled={busy}
          onClick={() => {
            setError("");
            onModeChange(AuthMode.Register);
          }}
        >
          注册
        </button>
      </div>
      <form onSubmit={submit} aria-label={register ? "注册账号" : "登录账号"}>
        <label className="nl-auth-field">
          用户名
          <input
            name="username"
            required
            pattern="[a-zA-Z0-9_]{3,24}"
            autoComplete="username"
            placeholder="3–24 位字母、数字或下划线"
            disabled={busy}
          />
        </label>
        {register && (
          <label className="nl-auth-field">
            昵称
            <input
              name="display_name"
              maxLength={40}
              placeholder="希望我们怎么称呼你"
              disabled={busy}
            />
          </label>
        )}
        <label className="nl-auth-field" htmlFor={`${id}-password`}>
          密码
        </label>
        <div className="nl-password-wrap">
          <input
            id={`${id}-password`}
            name="password"
            type={visible ? "text" : "password"}
            required
            minLength={10}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            placeholder="至少 10 位字符"
            disabled={busy}
          />
          <button
            type="button"
            aria-label={visible ? "隐藏密码" : "显示密码"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {error && (
          <p className="nl-auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="nl-auth-submit" disabled={busy}>
          {busy ? "稍等，正在为你开门…" : register ? "创建账号" : "走进这扇窗"}
          <ArrowUpRight size={17} />
        </button>
      </form>
      <p className="nl-auth-footnote">让喜欢的文字，有一个可以回来的地方。</p>
    </div>
  );
}

export function AuthWindow({
  mode,
  onModeChange,
  onClose,
}: {
  mode: AuthMode | null;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mode)
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [!!mode]);
  return (
    <Dialog.Root
      open={!!mode}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="nl-dialog-overlay" />
        <Dialog.Content
          className="nl-auth-window"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <Dialog.Title className="nl-sr-only">
            {mode === AuthMode.Register ? "创建账号" : "欢迎回来"}
          </Dialog.Title>
          <Dialog.Description className="nl-sr-only">
            登录后可留言、点赞和收藏文章。
          </Dialog.Description>
          <AuthArtwork />
          <AuthFields
            mode={mode || AuthMode.Login}
            onModeChange={onModeChange}
            onSuccess={onClose}
          />
          <Dialog.Close className="nl-dialog-close" aria-label="关闭登录窗口">
            <X size={20} strokeWidth={1.5} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
