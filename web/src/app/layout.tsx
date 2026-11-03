import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { serverApi, serverConfig } from "@/api/server";
import { defaultSite, type Site } from "@/api/types";
import "@/styles/global.css";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "@/styles/editorial.css";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  let site = defaultSite;
  try {
    site = await serverApi<Site>("/site");
  } catch {}
  return {
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description,
    metadataBase: new URL(serverConfig.siteURL),
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let site = defaultSite;
  try {
    site = await serverApi<Site>("/site");
  } catch {}
  return (
    <html lang="zh-CN">
      <body>
        <Providers initialSite={site}>{children}</Providers>
      </body>
    </html>
  );
}
