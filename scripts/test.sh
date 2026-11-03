#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
export CGO_ENABLED=0
python3 -m unittest discover -s scripts -p 'test_*.py'
node --test deploy/supervisor.test.mjs scripts/setup-db.test.mjs
(cd server && go test ./... && go test ./src/infrastructure/db -count=1 -args -integration-config "$TASK_ROOT/server/config/config.yaml" && go vet ./...)
(cd web && npm run test:config && npm run test:unit && npm run typecheck && npm run build)
