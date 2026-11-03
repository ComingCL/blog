#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
if [[ ! -f server/config/config.yaml ]]; then echo '先运行 python3 scripts/setup.py 生成 YAML 配置。'; exit 1; fi
python3 scripts/setup.py
export CGO_ENABLED=0
API_PID=''
cleanup(){ if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM
docker compose -f deploy/compose.yaml up -d postgres
for ((i=0;i<40;i++)); do if docker compose -f deploy/compose.yaml exec -T postgres pg_isready -U nightlog >/dev/null 2>&1; then break; fi; sleep 1; done
cd server
mkdir -p bin
go build -o bin/nightlog ./src/cmd/api
./bin/nightlog -config config/config.yaml -migrate &
API_PID=$!
cd ../web
npm run dev
