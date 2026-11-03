"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import * as commands from "@uiw/react-md-editor/commands-cn";
import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { Markdown } from "./Content";
import { useApp } from "./AppContext";

const MDEditor = dynamic(() => import("@uiw/react-md-editor/nohighlight"), {
  ssr: false,
  loading: () => <div className="nl-md-loading">正在载入写作工具…</div>,
});
const tools = [
  commands.title,
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.link,
  commands.image,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
  commands.table,
];
const views = [commands.codeEdit, commands.codeLive, commands.codePreview, commands.fullscreen];
const preview = { preview: (source: string) => <Markdown content={source} /> };

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { notify } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef(value);
  current.current = value;
  const selection = useRef({ start: value.length, end: value.length });
  const [uploading, setUploading] = useState(false);
  return (
    <div className="nl-markdown-editor" ref={container} data-color-mode="dark">
      <div className="nl-md-heading">
        <div>
          <span>正文 · Markdown</span>
          <small>左侧编辑，右侧预览 · 同步滚动</small>
        </div>
        <button
          type="button"
          className="nl-btn"
          disabled={uploading}
          onClick={() => {
            const input = container.current?.querySelector("textarea");
            if (input) selection.current = { start: input.selectionStart, end: input.selectionEnd };
            fileInput.current?.click();
          }}
        >
          <ImagePlus size={15} />
          {uploading ? "图片上传中…" : "上传并插入图片"}
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          aria-label="上传正文图片"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const snapshot = current.current;
            const range = selection.current;
            setUploading(true);
            try {
              const data = new FormData();
              data.set("file", file);
              const { url } = await api<{ url: string }>(endpoints.media, {
                method: "POST",
                body: data,
              });
              const text = current.current;
              const start = text === snapshot ? range.start : text.length;
              const end = text === snapshot ? range.end : text.length;
              const label = file.name.replace(/[\[\]\r\n\\]/g, "");
              onChange(text.slice(0, start) + `\n\n![${label}](${url})\n\n` + text.slice(end));
              notify("图片已插入正文");
            } catch (error) {
              notify((error as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <MDEditor
        value={value}
        onChange={(text) => onChange(text || "")}
        height={640}
        minHeight={400}
        maxHeight={1200}
        preview="live"
        enableScroll
        commands={tools}
        extraCommands={views}
        components={preview}
        highlightEnable={false}
        autoFocus={false}
        defaultTabEnable
        textareaProps={{ "aria-label": "Markdown 正文", spellCheck: false, maxLength: 500000 }}
      />
    </div>
  );
}
