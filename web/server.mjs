import { createServer } from "node:http";
import next from "next";
import { serverConfig } from "./server-config.mjs";
import { clientIPResolver, sanitizeClientHeaders } from "./client-ip.mjs";

// Normalize the TCP peer before Next.js rewrites and server-side rendering.
const dev = process.argv.includes("--dev");
const port = serverConfig.webPort;
const hostname = serverConfig.webHost;
const resolveIP = clientIPResolver(serverConfig.trustedProxies);
const server = createServer();
const app = next({ dev, hostname, port, httpServer: server });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
server.on("request", (req, res) => {
  sanitizeClientHeaders(req, resolveIP);
  void handle(req, res).catch(() => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        event: "web_request_failed",
        method: req.method,
        path: req.url?.split("?")[0],
        request_id: req.headers["x-request-id"],
      }),
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    } else res.destroy();
  });
});
server.on("upgrade", (req, socket, head) => {
  sanitizeClientHeaders(req, resolveIP);
  void upgrade(req, socket, head);
});
server.on("error", () => {
  console.error(JSON.stringify({ level: "ERROR", event: "web_listen_failed" }));
  process.exit(1);
});
server.listen(port, hostname, () =>
  console.log(JSON.stringify({ level: "INFO", event: "web_listening", host: hostname, port })),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void app.close().finally(() => process.exit(0));
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
