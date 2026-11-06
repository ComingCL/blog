import { randomUUID } from "node:crypto";

export function assignRequestID(request, response) {
  const id = randomUUID();
  request.headers["x-request-id"] = id;
  response.setHeader("X-Request-ID", id);
}
