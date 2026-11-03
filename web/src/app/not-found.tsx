import Link from "next/link";
import { routes } from "@/router";
export default function NotFound() {
  return (
    <section className="nl-page nl-empty">
      <div className="nl-eyebrow">404 / a little detour</div>
      <h1>这篇故事暂时不在这里。</h1>
      <p>也许作者还在修改，或已经收起了它。</p>
      <Link className="nl-btn" href={routes.posts}>
        回到文章列表
      </Link>
    </section>
  );
}
