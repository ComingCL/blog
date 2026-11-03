import { serverConfig } from "@/api/server";
import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const base = serverConfig.siteURL;
  return {
    rules: {
      userAgent: "*",
      allow: "/v1",
      disallow: ["/v1/admin", "/v1/me", "/v1/login", "/v1/register", "/v1/api"],
    },
    sitemap: base + "/v1/sitemap.xml",
  };
}
