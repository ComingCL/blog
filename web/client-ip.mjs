import { BlockList, isIP } from "node:net";

function normalize(value) {
  if (typeof value !== "string" || value.includes("%")) return "";
  const ip = value.trim().toLowerCase();
  if (!isIP(ip)) return "";
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** Only configured edge proxies may forward IPs. Direct clients cannot supply their IP. */
export function clientIPResolver(proxies = []) {
  const trusted = new BlockList();
  for (const item of proxies) {
    const [address, mask, extra] = item.split("/");
    const family = isIP(address);
    if (!family || extra !== undefined)
      throw new Error("server.trusted_proxies contains an invalid IP/CIDR");
    if (mask === undefined) trusted.addAddress(address, family === 4 ? "ipv4" : "ipv6");
    else {
      const prefix = Number(mask);
      if (!/^\d+$/.test(mask) || prefix < 0 || prefix > (family === 4 ? 32 : 128))
        throw new Error("server.trusted_proxies contains an invalid CIDR");
      trusted.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
    }
  }
  const isTrusted = (ip) => trusted.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
  return (remoteAddress, forwardedFor) => {
    const peer = normalize(remoteAddress);
    if (!peer || !isTrusted(peer) || typeof forwardedFor !== "string" || forwardedFor.length > 2048)
      return peer;
    const chain = forwardedFor.split(",").map(normalize);
    if (chain.length > 32 || chain.some((ip) => !ip)) return peer;
    chain.push(peer);
    for (let i = chain.length - 1; i > 0; i--) if (!isTrusted(chain[i])) return chain[i];
    return chain[0];
  };
}

export function sanitizeClientHeaders(request, resolve) {
  const ip = resolve(request.socket.remoteAddress, request.headers["x-forwarded-for"]);
  delete request.headers.forwarded;
  delete request.headers["x-real-ip"];
  delete request.headers["x-nightlog-ssr-key"];
  if (ip) request.headers["x-forwarded-for"] = ip;
  else delete request.headers["x-forwarded-for"];
}
