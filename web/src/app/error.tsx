"use client";
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest)
      ? error.digest
      : "";
  return (
    <section className="nl-page nl-empty">
      <h1>暂时没能取回这些文字</h1>
      <p>页面加载遇到问题，请重试；若仍无法打开，请把错误编号提供给博主。</p>
      {digest && (
        <p>
          错误编号：<code>{digest}</code>
        </p>
      )}
      <button className="nl-btn" onClick={retry}>
        重新载入
      </button>
    </section>
  );
}
