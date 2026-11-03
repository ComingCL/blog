import { serverApi, serverConfig } from "@/api/server";
import type { Page, Post, Site } from "@/api/types";
import { routes, toPublicPath } from "@/router";
export const dynamic = "force-dynamic";
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function GET() {
  const [site, posts] = await Promise.all([
    serverApi<Site>("/site"),
    serverApi<Page<Post>>("/posts?page_size=50"),
  ]);
  const base = serverConfig.siteURL;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.name)}</title><link>${xml(base + "/v1")}</link><description>${xml(site.description)}</description>${posts.list.map((p) => `<item><title>${xml(p.title)}</title><link>${xml(base + toPublicPath(routes.post(p.slug)))}</link><guid>${xml(base + toPublicPath(routes.post(p.slug)))}</guid><description>${xml(p.excerpt)}</description><pubDate>${new Date(p.published_at!).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`,
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
