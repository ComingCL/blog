// Server-only configuration. Never import this module from a Client Component.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { isIP } from "node:net";

/** Read the same private YAML file used by the Go backend. */
export function loadServerConfig(path = resolve(process.cwd(), "../server/config/config.yaml")) {
  // Runtime configuration is provided separately; do not trace private credentials into build artifacts.
  const input = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  if (Buffer.byteLength(input) > 65536) throw new Error("YAML configuration exceeds 64 KiB");
  let value;
  try {
    value = parse(input, { logLevel: "silent" });
  } catch {
    throw new Error("Invalid YAML configuration; check the private configuration file");
  }
  const port = value?.server?.port ?? 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("server.port must be between 1 and 65535");
  }
  const apiOrigin = value?.server?.api_origin || `http://127.0.0.1:${port}`;
  const siteURL = value?.server?.origin || "http://127.0.0.1:3100";
  let publicOrigin;
  try {
    for (const origin of [apiOrigin, siteURL]) {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error();
    }
    publicOrigin = new URL(siteURL);
  } catch {
    throw new Error("YAML server origins must be HTTP(S) origins without credentials or paths");
  }
  const webHost = value?.server?.web_host ?? "127.0.0.1";
  const webPort =
    value?.server?.web_port ??
    Number(publicOrigin.port || (publicOrigin.protocol === "https:" ? 443 : 80));
  if (!isIP(webHost)) throw new Error("server.web_host must be an IP address");
  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535)
    throw new Error("server.web_port must be between 1 and 65535");
  const auditKey = value?.security?.audit_key;
  const trustedProxies = value?.server?.trusted_proxies ?? [];
  if (!Array.isArray(trustedProxies) || trustedProxies.some((v) => typeof v !== "string"))
    throw new Error("server.trusted_proxies must be an array of IP/CIDR strings");
  if (typeof auditKey !== "string" || Buffer.byteLength(auditKey) < 32) {
    throw new Error("security.audit_key must contain at least 32 bytes");
  }
  return Object.freeze({
    webHost,
    webPort,
    trustedProxies,
    apiOrigin: String(apiOrigin).replace(/\/$/, ""),
    siteURL: String(siteURL).replace(/\/$/, ""),
    internalAPIKey: auditKey,
  });
}

export const serverConfig = loadServerConfig();
