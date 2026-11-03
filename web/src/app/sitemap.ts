import type { MetadataRoute } from "next";
import { serverApi, serverConfig } from "@/api/server";
import type { Page, Post } from "@/api/types";
import { routes, toPublicPath } from "@/router";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = serverConfig.siteURL;
  const all: Post[] = [];
  let page = 1;
  while (page <= 100) {
    const r = await serverApi<Page<Post>>("/posts?page_size=50&page=" + page);
    all.push(...r.list);
    if (!r.pagination.has_next) break;
    page++;
  }
  return [routes.home, routes.posts, routes.guestbook, routes.about]
    .map((p) => ({ url: base + toPublicPath(p) }))
    .concat(
      all.map((p) => ({
        url: base + toPublicPath(routes.post(p.slug)),
        lastModified: p.updated_at,
      })),
    );
}
