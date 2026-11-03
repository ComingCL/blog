"""Create private YAML and Compose credentials; preserve existing settings."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def quote(value):
    return json.dumps(str(value), ensure_ascii=False)


def initialize():
    if not (ROOT / 'web/node_modules/yaml/dist/index.js').is_file():
        raise ValueError('Run (cd web && npm ci) before initializing local configuration.')
    config = ROOT / 'server/config/config.yaml'
    if config.exists():
        print('YAML configuration already exists; unchanged.')
    else:
        # One-time migration only. Applications never read .env or these legacy keys.
        legacy = {}
        legacy_path = ROOT / '.env'
        if legacy_path.exists():
            legacy = dict(line.split('=', 1) for line in legacy_path.read_text().splitlines()
                          if '=' in line and not line.lstrip().startswith('#'))
        storage = Path(legacy.get('STORAGE_DIR', './storage'))
        if not storage.is_absolute():
            storage = Path(os.path.relpath(ROOT / 'server' / storage, config.parent))
        dsn = legacy.get('DATABASE_URL') or (
            f'postgres://nightlog:{secrets.token_hex(32)}@127.0.0.1:5432/nightlog?sslmode=disable'
        )
        config.parent.mkdir(parents=True, exist_ok=True)
        content = f'''# 本机私有配置，不提交 Git。修改后重启前后端。
server:
  port: {int(legacy.get("PORT", "8080"))}
  origin: {quote(legacy.get("APP_ORIGIN", "http://127.0.0.1:3100"))}
  api_origin: {quote(legacy.get("API_ORIGIN", "http://127.0.0.1:8080"))}
database:
  dsn: {quote(dsn)}
security:
  audit_key: {quote(legacy.get("AUDIT_HASH_KEY") or secrets.token_hex(32))}
  cookie_secure: {str(legacy.get("COOKIE_SECURE", "false").lower() == "true").lower()}
storage:
  path: {quote(storage)}
admin:
  username: {quote(legacy.get("ADMIN_USERNAME", "admin"))}
  password: {quote(legacy.get("ADMIN_PASSWORD") or secrets.token_urlsafe(18))}
'''
        with open(config, 'x', opener=lambda file, flags: os.open(file, flags, 0o600)) as output:
            output.write(content)
        print('Private YAML configuration created; credentials are not printed.')
    result = subprocess.run(['node', str(ROOT / 'scripts/setup-db.mjs')], capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Cannot prepare database credential; check private YAML, local DB settings and existing secret mismatch.')
    print('Private Compose credential prepared. Existing database passwords and data are unchanged.')


if __name__ == '__main__':
    try:
        initialize()
    except (OSError, ValueError):
        # Do not expose private YAML, parsed values or subprocess output in errors.
        print('Local setup failed. Install web dependencies with npm ci, then check YAML, local DB settings and private file permissions/mismatch.', file=sys.stderr)
        raise SystemExit(1)
