import { ResponseCode, ClientErrorCode } from "@/models/enums";
import { API_BASE, endpoints } from "./endpoints";
import type { Envelope } from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ResponseCode | ClientErrorCode,
    public requestId: string,
  ) {
    super(message);
  }
}
let csrfFlight: Promise<string> | null = null;
function csrfToken(): Promise<string> {
  if (!csrfFlight) {
    csrfFlight = (async () => {
      const r = await fetch(API_BASE + endpoints.csrf, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const csrf = (await r.json()) as Envelope<{ token: string }>;
      if (!r.ok) throw new ApiError(csrf.message, r.status, csrf.code, csrf.request_id);
      return csrf.data.token;
    })().finally(() => {
      csrfFlight = null;
    });
  }
  return csrfFlight;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CSRF-Token", await csrfToken());
  }
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const r = await fetch(API_BASE + path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  let body: Envelope<T>;
  try {
    body = await r.json();
  } catch {
    throw new ApiError("服务连接失败，请稍后重试", r.status, ClientErrorCode.ConnectionError, "");
  }
  if (!r.ok || body.code !== ResponseCode.OK)
    throw new ApiError(body.message, r.status, body.code, body.request_id);
  return body.data;
}
export const write = <T>(path: string, method: string, data?: unknown) =>
  api<T>(path, {
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
