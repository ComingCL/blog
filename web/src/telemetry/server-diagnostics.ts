import { RenderFailure, TransportErrorCode } from "@/models/enums";

export function safeIdentifier(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : "";
}

export function transportCode(error: unknown): TransportErrorCode {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  return Object.values(TransportErrorCode).includes(code as TransportErrorCode)
    ? (code as TransportErrorCode)
    : TransportErrorCode.Other;
}

export function renderFailure(error: unknown): RenderFailure {
  if (!(error instanceof Error)) return RenderFailure.Unknown;
  if (error.name === "ServerApiError") return RenderFailure.ServerAPI;
  if (/Attempted to call .* from the server but .* is on the client/.test(error.message))
    return RenderFailure.ClientBoundary;
  return RenderFailure.Unknown;
}

export function safeErrorName(error: unknown): string {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof Error && error.name === "ServerApiError") return "ServerApiError";
  return "Error";
}
