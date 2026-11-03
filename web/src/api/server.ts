import "server-only";
import { serverConfig } from "../../server-config.mjs";
export { serverConfig };
import { cookies, headers } from "next/headers";
import { API_BASE } from "./endpoints";
import type { Envelope } from "./types";
export class ServerApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function serverApi<T>(path: string): Promise<T> {
  const incoming = await headers();
  const forwarded = new Headers({
    Cookie: (await cookies()).toString(),
    "X-Nightlog-SSR-Key": serverConfig.internalAPIKey,
  });
  for (const name of ["x-forwarded-for", "user-agent", "x-request-id"]) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  const response = await fetch(serverConfig.apiOrigin + API_BASE + path, {
    headers: forwarded,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok) throw new ServerApiError(body.message, response.status);
  return body.data;
}
