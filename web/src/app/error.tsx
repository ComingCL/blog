"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="nl-page nl-empty">
      <h1>暂时没能取回这些文字</h1>
      <p>请检查后端服务是否正常，或稍后再试。</p>
      <button className="nl-btn" onClick={reset}>
        重新载入
      </button>
    </section>
  );
}
