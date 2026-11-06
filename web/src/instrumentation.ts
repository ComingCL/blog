import type { Instrumentation } from "next";
import { DiagnosticEvent } from "@/models/enums";
import { renderFailure, safeErrorName, safeIdentifier } from "@/telemetry/server-diagnostics";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = error && typeof error === "object" && "digest" in error ? error.digest : undefined;
  // Next may handle render errors before the custom HTTP server's catch runs.
  // Log route templates and classifications, never raw messages, request headers or bodies.
  console.error(
    JSON.stringify({
      level: "ERROR",
      event: DiagnosticEvent.WebRenderFailed,
      error_type: renderFailure(error),
      error_name: safeErrorName(error),
      digest: safeIdentifier(digest),
      request_id: safeIdentifier(request.headers["x-request-id"]),
      route: context.routePath,
      method: request.method,
    }),
  );
};
