"use client";
import { useState } from "react";
import { MediaPreview } from "./MediaPreview";
import { isVideoURL } from "./media";
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
  const description = alt?.trim() === "在这里插入图片描述" ? "" : alt?.trim();
  if (failed === src)
    return (
      <span className="nl-image-error" role="status">
        图片暂时无法加载{description && ` · ${description}`}{" "}
        <a href={src} target="_blank" rel="noreferrer">
          打开原图 ↗
        </a>
        <small>外链可能已失效，可上传图片后重新插入。</small>
      </span>
    );
  return (
    <MediaPreview src={src} title={description || "文章图片"} kind={MediaKind.Image}>
      <img
        src={src}
        alt={description || "文章图片"}
        title={title?.trim() === "在这里插入图片描述" ? undefined : title}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(src)}
      />
    </MediaPreview>
  );
}
