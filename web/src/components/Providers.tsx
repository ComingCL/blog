"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { UserRole } from "@/models/enums";
import Link from "next/link";
import { Toaster, toast } from "sonner";
import { usePathname } from "next/navigation";
import { AppContext, useApp, AuthMode } from "./AppContext";
import { AuthWindow } from "./AuthWindow";
import { ConfirmProvider } from "./ConfirmDialog";
import { api, write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { defaultSite, type Site, type User } from "@/api/types";
import { routes } from "@/router";
import { Telemetry } from "@/telemetry/Telemetry";
export { useApp } from "./AppContext";
export function Providers({ children, initialSite }: { children: ReactNode; initialSite?: Site }) {
  const [user, setUser] = useState<User | null>(null);
  const [site, setSite] = useState(initialSite || defaultSite);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const openAuth = useCallback((mode: AuthMode = AuthMode.Login) => setAuthMode(mode), []);
  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>(endpoints.me));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    api<Site>(endpoints.site)
      .then((value) => setSite((current) => (value.version >= current.version ? value : current)))
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    document.title = site.name + " · 个人博客";
  }, [site.name]);
  return (
    <AppContext.Provider value={{ user, site, ready, refresh, setSite, notify: toast, openAuth }}>
      <ConfirmProvider>
        <div id="nightlog">
          <Header />
          <main className="nl-main">{children}</main>
          <footer className="nl-footer">
            <span>
              © {new Date().getFullYear()} {site.name} · 把想法写进生活
            </span>
            <Link href={routes.about}>站点与隐私说明</Link>
          </footer>
          <Telemetry />
        </div>
        <AuthWindow mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} />
        <Toaster
          theme="dark"
          position="bottom-right"
          closeButton
          duration={3800}
          toastOptions={{ className: "nl-notification" }}
        />
      </ConfirmProvider>
    </AppContext.Provider>
  );
}
function Header() {
  const { user, site, ready, openAuth } = useApp();
  const pathname = usePathname();
  return (
    <header className={`nl-nav ${pathname === routes.home ? "nl-nav-home" : ""}`}>
      <Link className="nl-logo" href={routes.home}>
        <span className="nl-mark">{site.english_name[0]?.toLowerCase() || "n"}.</span>
        <span>
          <span data-site-name>{site.name}</span>
          {site.english_name.toLowerCase() !== site.name.toLowerCase() && (
            <span className="nl-word">{site.english_name}</span>
          )}
        </span>
      </Link>
      <nav className="nl-links" aria-label="博客导航">
        <Link href={routes.home} className="nl-link">
          首页
        </Link>
        <Link href={routes.posts} className="nl-link">
          文章
        </Link>
        <Link href={routes.guestbook} className="nl-link">
          留言
        </Link>
        <Link href={routes.bookmarks} className="nl-link">
          我的记录
        </Link>
        {user?.role === UserRole.Admin && (
          <Link href={routes.admin} className="nl-link">
            工作台 ↗
          </Link>
        )}
        {user ? (
          <Link href={routes.settings} className="nl-link nl-nav-account">
            {user.display_name}
          </Link>
        ) : (
          <button type="button" className="nl-link nl-nav-account" onClick={() => openAuth()}>
            {ready ? "登录 / 注册" : "…"}
          </button>
        )}
      </nav>
    </header>
  );
}
export function AuthGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, ready, openAuth } = useApp();
  if (!ready) return <div className="nl-page">正在确认登录状态…</div>;
  if (!user)
    return (
      <div className="nl-page nl-empty">
        <h2>登录后继续</h2>
        <p>收藏、留言和个人记录会保存在你的账号中。</p>
        <button className="nl-btn nl-btn-primary" onClick={() => openAuth()}>
          去登录
        </button>
      </div>
    );
  if (admin && user.role !== UserRole.Admin)
    return <div className="nl-page nl-empty">此页面需要管理员权限。</div>;
  return children;
}
export function Logout() {
  const { refresh, notify } = useApp();
  return (
    <button
      className="nl-btn"
      onClick={async () => {
        try {
          await write(endpoints.logout, "POST");
          await refresh();
          notify("已安全退出");
        } catch (e) {
          notify((e as Error).message);
        }
      }}
    >
      退出登录
    </button>
  );
}
