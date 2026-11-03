#!/bin/sh
set -eu
umask 077
# Compose bind-mounted secrets retain host ownership. Copy as root, then drop privileges.
install -o blog -g blog -m 600 /run/secrets/app_config /app/server/config/config.yaml
mkdir -p /app/data/uploads /app/data/logs /app/data/audit-spool
chown blog:blog /app/data /app/data/uploads /app/data/logs /app/data/audit-spool /app/server/config /app/web/.next
chmod 700 /app/data /app/data/uploads /app/data/logs /app/data/audit-spool
exec setpriv --reuid=10001 --regid=10001 --clear-groups --no-new-privs "$@"
