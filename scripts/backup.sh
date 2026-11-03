#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
umask 077
BLOG_BACKUP_DIR="server/storage/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BLOG_BACKUP_DIR"
docker compose -f deploy/compose.yaml exec -T postgres pg_dump -U nightlog -Fc nightlog > "$BLOG_BACKUP_DIR/database.dump"
if [[ -d server/storage/uploads ]]; then tar -czf "$BLOG_BACKUP_DIR/uploads.tar.gz" -C server/storage uploads; fi
printf 'Backup saved to %s\n' "$BLOG_BACKUP_DIR"
