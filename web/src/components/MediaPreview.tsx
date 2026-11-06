"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { PlayCircle, X, ArrowUpRight } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { MediaKind } from "@/models/enums";

export function MediaPreview({
  src,
  title,
  kind,
  children,
}: {
  src: string;
  title: string;
  kind: MediaKind;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const attachVideo = useCallback((player: HTMLVideoElement | null) => {
    if (!player) video.current?.pause();
    video.current = player;
  }, []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setFailed(false);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`nl-media-trigger ${kind === MediaKind.Video ? "is-video" : ""}`}
          aria-label={`预览${kind === MediaKind.Video ? "视频" : "图片"}：${title}`}
        >
          {children || (
            <span className="nl-video-card">
              <PlayCircle size={35} strokeWidth={1.2} />
              <span>
                {title}
                <small>点击播放视频</small>
              </span>
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="nl-dialog-overlay nl-media-overlay" />
        <Dialog.Content className="nl-media-window">
          <div className="nl-media-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {kind === MediaKind.Video
                  ? "视频预览 · 关闭窗口后停止播放"
                  : "图片预览 · 按 Esc 返回阅读"}
              </Dialog.Description>
            </div>
            <Dialog.Close className="nl-dialog-close" aria-label="关闭预览">
              <X size={20} strokeWidth={1.5} />
            </Dialog.Close>
          </div>
          <div className="nl-media-canvas">
            {failed ? (
              <p className="nl-media-unavailable" role="status">
                媒体暂时无法加载，可以打开原文件查看。
              </p>
            ) : kind === MediaKind.Video ? (
              <video
                ref={attachVideo}
                src={src}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => setFailed(true)}
                aria-label={title}
              />
            ) : (
              <img
                src={src}
                alt={title}
                referrerPolicy="no-referrer"
                decoding="async"
                onError={() => setFailed(true)}
              />
            )}
          </div>
          <div className="nl-media-footer">
            <span>把片刻，留在这里。</span>
            <a href={src} target="_blank" rel="noreferrer">
              打开原文件 <ArrowUpRight size={13} />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
