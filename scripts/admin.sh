#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT/server"
CGO_ENABLED=0 go run ./src/cmd/admin -config config/config.yaml -migrate "$@"
