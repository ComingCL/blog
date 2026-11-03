ARG GO_IMAGE=golang:1.26.10-bookworm
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${GO_IMAGE} AS go-build
WORKDIR /build
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/src ./src
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/blog-api ./src/cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/blog-admin ./src/cmd/admin

FROM ${NODE_IMAGE} AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY deploy/build-config.yaml /app/server/config/config.yaml
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build && npm prune --omit=dev && rm -rf .next/cache

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 blog && useradd -u 10001 -g blog -M blog \
    && mkdir -p /app/server/config /app/data
WORKDIR /app/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=go-build /out/ /app/bin/
COPY --from=web-build --chown=10001:10001 /app/web/ /app/web/
COPY deploy/app-entrypoint.sh deploy/healthcheck.mjs deploy/supervisor.mjs /app/deploy/
ENTRYPOINT ["/bin/sh", "/app/deploy/app-entrypoint.sh"]
CMD ["node", "/app/deploy/supervisor.mjs"]
