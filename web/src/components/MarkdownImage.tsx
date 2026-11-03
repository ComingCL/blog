"use client";
import { useState } from "react";
import { MediaPreview, isVideoURL } from "./MediaPreview";
import { MediaKind } from "@/models/enums";

export function MarkdownImage({
  src,
  alt,
  title,
}: {
  src?: string | Blob;
  alt?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState<string | Blob>();
  if (typeof src !== "string" || !src) return <span className="nl-image-error">图片地址无效</span>;
  if (isVideoURL(src))
    return <MediaPreview src={src} title={alt || "文章视频"} kind={MediaKind.Video} />;
  if (failed === src)
    return (
      <span className="nl-image-error" role="status">
        图片暂时无法加载 · {alt || "未命名图片"}{" "}
        <a href={src} target="_blank" rel="noreferrer">
          打开原图 ↗
        </a>
        <small>外链可能已失效，可上传图片后重新插入。</small>
      </span>
    );
  return (
    <MediaPreview src={src} title={alt || "文章图片"} kind={MediaKind.Image}>
      <img
        src={src}
        alt={alt || "文章图片"}
        title={title}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(src)}
      />
    </MediaPreview>
  );
}
