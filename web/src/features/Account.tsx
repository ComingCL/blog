"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { useApp, AuthGate, Logout } from "@/components/Providers";
import { ErrorMessage } from "@/components/Content";
import { safeReturnTo } from "@/router";
import { AuthArtwork, AuthFields } from "@/components/AuthWindow";
import { AuthMode } from "@/components/AppContext";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(register ? AuthMode.Register : AuthMode.Login);
  return (
    <section className="nl-auth-page">
      <div className="nl-auth-window is-page">
        <AuthArtwork />
        <AuthFields
          mode={mode}
          onModeChange={setMode}
          onSuccess={() => {
            router.push(safeReturnTo(new URL(location.href).searchParams.get("next")));
            router.refresh();
          }}
        />
      </div>
    </section>
  );
}
export function AccountSettings() {
  return (
    <AuthGate>
      <SettingsForm />
    </AuthGate>
  );
}
function SettingsForm() {
  const { user, refresh, notify } = useApp();
  const [error, setError] = useState("");
  return (
    <section className="nl-page">
      <div className="nl-form-narrow">
        <h1>你的账号</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await write(endpoints.me, "PATCH", {
                display_name: new FormData(e.currentTarget).get("display_name"),
              });
              await refresh();
              notify("昵称已更新");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label className="nl-field">
            昵称
            <input
              className="nl-search"
              name="display_name"
              defaultValue={user?.display_name}
              required
              maxLength={40}
            />
          </label>
          <button className="nl-btn">保存昵称</button>
        </form>
        <hr style={{ margin: "25px 0", borderColor: "#ffffff12" }} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await write(endpoints.password, "PUT", {
                current_password: f.get("current"),
                password: f.get("password"),
              });
              await refresh();
              notify("密码已更新，请重新登录");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label className="nl-field">
            当前密码
            <input
              className="nl-search"
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label className="nl-field">
            新密码
            <input
              className="nl-search"
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <button className="nl-btn">修改密码</button>
        </form>
        {error && <ErrorMessage message={error} />}
        <div style={{ marginTop: 25 }}>
          <Logout />
        </div>
      </div>
    </section>
  );
}
