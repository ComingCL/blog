import "server-only";
import { randomUUID } from "node:crypto";
import { serverConfig } from "../../server-config.mjs";
export { serverConfig };
import { cookies, headers } from "next/headers";
import { API_BASE } from "./endpoints";
import type { Envelope } from "./types";
import { ClientErrorCode, DiagnosticEvent, ResponseCode, ServerAPIFailure } from "@/models/enums";
import { safeIdentifier, transportCode } from "@/telemetry/server-diagnostics";
export class ServerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId = "",
  ) {
    super(message);
    this.name = "ServerApiError";
  }
}
export async function serverApi<T>(path: string): Promise<T> {
  const incoming = await headers();
  const requestId = safeIdentifier(incoming.get("x-request-id")) || randomUUID();
  const forwarded = new Headers({
    Cookie: (await cookies()).toString(),
    "X-Nightlog-SSR-Key": serverConfig.internalAPIKey,
    "X-Request-ID": requestId,
  });
  for (const name of ["x-forwarded-for", "user-agent"]) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  const started = Date.now();
  const fail = (
    reason: ServerAPIFailure,
    status: number,
    responseId = requestId,
    code: ResponseCode | ClientErrorCode = ClientErrorCode.ConnectionError,
    error?: unknown,
  ): never => {
    if (status >= 500)
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: DiagnosticEvent.ServerAPIFailed,
          reason,
          path: (API_BASE + path).split(/[?#]/)[0],
          status,
          request_id: responseId,
          api_code: code,
          duration_ms: Date.now() - started,
          ...(error ? { error_code: transportCode(error) } : {}),
        }),
      );
    throw new ServerApiError(
      status === 404 ? "文章不存在" : "服务连接失败，请稍后重试",
      status,
      responseId,
    );
  };
  let response: Response;
  try {
    response = await fetch(serverConfig.apiOrigin + API_BASE + path, {
      headers: forwarded,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return fail(
      timeout ? ServerAPIFailure.Timeout : ServerAPIFailure.Network,
      timeout ? 504 : 502,
      requestId,
      ClientErrorCode.ConnectionError,
      error,
    );
  }
  const responseId = safeIdentifier(response.headers.get("x-request-id")) || requestId;
  let body: Envelope<T>;
  try {
    body = await response.json();
  } catch {
    return fail(
      ServerAPIFailure.InvalidResponse,
      response.status >= 500 ? response.status : 502,
      responseId,
    );
  }
  if (!body || typeof body !== "object" || !Object.values(ResponseCode).includes(body.code))
    return fail(ServerAPIFailure.InvalidResponse, 502, responseId);
  const confirmedId = safeIdentifier(body.request_id) || responseId;
  if (!response.ok) return fail(ServerAPIFailure.HTTP, response.status, confirmedId, body.code);
  if (body.code !== ResponseCode.OK || !("data" in body))
    return fail(ServerAPIFailure.InvalidResponse, 502, confirmedId, body.code);
  return body.data;
}
