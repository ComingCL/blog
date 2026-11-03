import { serverConfig } from "./server-config.mjs";

/** @type {import('next').NextConfig} */
const config = {
  basePath: "/v1",
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    const origin = serverConfig.apiOrigin;
    return [
      { source: "/api/:path*", destination: `${origin}/v1/api/:path*` },
      { source: "/uploads/:path*", destination: `${origin}/v1/uploads/:path*` },
      { source: "/healthz", destination: `${origin}/v1/healthz` },
      { source: "/readyz", destination: `${origin}/v1/readyz` },
    ];
  },
};
export default config;
