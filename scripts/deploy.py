#!/usr/bin/env python3
"""One-command Compose deployment. Requires only Python 3.10+ and Docker Compose v2."""
import argparse
from contextlib import contextmanager
from enum import Enum
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import string
import subprocess
import sys
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = ROOT / "deploy/runtime/production"
DEFAULT_REGISTRY = "m.daocloud.io/docker.io/library"
DEFAULT_APT_MIRROR = "https://mirrors.aliyun.com"
DEFAULT_NPM_REGISTRY = "https://registry.npmmirror.com"
DEFAULT_GOPROXY = "https://goproxy.cn,direct"


class Action(str, Enum):
    DEPLOY = "deploy"
    REDEPLOY = "redeploy"
    INIT = "init"
    STATUS = "status"
    LOGS = "logs"
    BACKUP = "backup"


def strong_password() -> str:
    # At least 288 random bits, URL/SQL-safe, with every required character class.
    return (secrets.choice(string.ascii_uppercase) + secrets.choice(string.ascii_lowercase)
            + secrets.choice(string.digits) + "_" + secrets.token_urlsafe(36))


def validate(origin: str, project: str, subnet: str):
    if not re.fullmatch(r"[a-z][a-z0-9-]{2,39}", project) or project == "deploy":
        raise ValueError("project must be 3-40 lowercase letters/digits/hyphens and differ from the development project")
    if any(c.isspace() for c in origin):
        raise ValueError("origin must not contain whitespace")
    try:
        url = urlsplit(origin)
        port = url.port
        network = ipaddress.IPv4Network(subnet)
    except ValueError as error:
        raise ValueError("invalid origin or private subnet") from error
    private_ranges = [ipaddress.IPv4Network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    if network.prefixlen != 24 or not any(network.subnet_of(value) for value in private_ranges):
        raise ValueError("subnet must be a private IPv4 /24 network")
    local = url.scheme == "http" and url.hostname == "127.0.0.1" and port and port >= 1024
    domain = url.hostname or ""
    try:
        ipaddress.ip_address(domain)
        is_ip = True
    except ValueError:
        is_ip = False
    if url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise ValueError("origin must not contain credentials, paths, queries or fragments")
    if not local and (url.scheme != "https" or port not in (None, 443) or is_ip
                      or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain)
                      or "." not in domain or ".." in domain):
        raise ValueError("production requires https://your.domain; smoke testing permits http://127.0.0.1:PORT")
    return origin.rstrip("/"), network, bool(local)


def validate_source_url(value: str, name: str, allow_http: bool = False) -> str:
    """Validate a public package/OS mirror without accepting credentials or shell syntax."""
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise ValueError(f"{name} must be a valid HTTPS URL") from error
    schemes = ("http", "https") if allow_http else ("https",)
    if (parsed.scheme not in schemes or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or any(char in value for char in "\"'`$;\n\r")):
        expected = "HTTP(S)" if allow_http else "HTTPS"
        raise ValueError(f"{name} must be an {expected} URL without credentials, query or shell characters")
    return value.rstrip("/")


def validate_goproxy(value: str) -> str:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if not parts:
        raise ValueError("goproxy must contain at least one HTTPS proxy or direct")
    for part in parts:
        if part in ("direct", "off"):
            continue
        validate_source_url(part, "goproxy")
    return ",".join(parts)


def private_write(path: Path, text: str):
    # Exclusive creation: never silently replace credentials or follow symlinks.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(text)
        output.flush()
        os.fsync(output.fileno())


def replace_generated(path: Path, text: str):
    temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".tmp")
    try:
        private_write(temporary, text)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_directory(directory: Path):
    resolved = directory.resolve()
    root = ROOT.resolve()
    if resolved == root or root in resolved.parents:
        private_root = root / "deploy/runtime"
        if resolved != private_root and private_root not in resolved.parents:
            raise ValueError("inside this repository, private deployment files must stay under deploy/runtime")


def initialize(directory: Path, origin: str, project: str = "clarence-blog", subnet: str = "172.30.240.0/24",
               registry: str = DEFAULT_REGISTRY, apt_mirror: str = DEFAULT_APT_MIRROR,
               npm_registry: str = DEFAULT_NPM_REGISTRY, goproxy: str = DEFAULT_GOPROXY) -> dict:
    origin, network, local = validate(origin, project, subnet)
    if not re.fullmatch(r"[a-z0-9.-]+(?::[0-9]+)?(?:/[a-z0-9._-]+)+", registry):
        raise ValueError("registry must be a hostname/path without credentials or query parameters")
    apt_mirror = validate_source_url(apt_mirror, "apt_mirror", allow_http=True)
    npm_registry = validate_source_url(npm_registry, "npm_registry")
    goproxy = validate_goproxy(goproxy)
    directory = directory.absolute()
    validate_directory(directory)
    expected = {"version": 1, "origin": origin, "project": project, "subnet": str(network),
                "registry": registry, "apt_mirror": apt_mirror, "npm_registry": npm_registry,
                "goproxy": goproxy}
    required = ["state.json", "config.yaml", "db_password", "db_root_password", "app-init.sql", "compose.yaml", "Caddyfile"]
    if directory.is_symlink():
        raise ValueError("deployment directory must not be a symlink")
    reusing = any((directory / name).exists() for name in required)
    if reusing:
        if not all((directory / name).is_file() and not (directory / name).is_symlink() for name in required):
            raise ValueError("partial deployment state: restore the complete private configuration; credentials will not be regenerated")
        state = json.loads((directory / "state.json").read_text())
        identity = {name: expected[name] for name in ("version", "origin", "project", "subnet")}
        if any(state.get(name) != value for name, value in identity.items()):
            raise ValueError("existing deployment identity differs; use its original origin/project/subnet")
        config = json.loads((directory / "config.yaml").read_text())
        password = (directory / "db_password").read_text().strip()
        if urlsplit(config["database"]["dsn"]).password != password or len(password) < 48:
            raise ValueError("database credentials do not agree; restore private configuration")
        os.chmod(directory, 0o700)
        for name in required:
            os.chmod(directory / name, 0o600)
    else:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        password, root_password = strong_password(), strong_password()
    for log_directory in (directory / "logs", directory / "logs" / "app"):
        if log_directory.is_symlink():
            raise ValueError("deployment log directory must not be a symlink")
        log_directory.mkdir(exist_ok=True, mode=0o700)
    proxy_ip, app_ip = str(network[2]), str(network[3])
    if not reusing:
        config = {
            "server": {"port": 8080, "origin": origin, "api_origin": "http://127.0.0.1:8080",
                       "trusted_proxies": [proxy_ip], "web_host": "0.0.0.0", "web_port": 3100},
            "database": {"dsn": f"postgres://nightlog:{password}@postgres:5432/nightlog?sslmode=disable"},
            "security": {"audit_key": secrets.token_hex(48), "cookie_secure": not local},
            "storage": {"path": "/app/data"},
            "admin": {"username": "admin", "password": strong_password()},
        }
    logging = {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}
    application = {
        "image": f"{project}-app:local",
        "build": {"context": str(ROOT), "dockerfile": "deploy/Dockerfile", "args": {
            "GO_IMAGE": f"{registry}/golang:1.26",
                "NODE_IMAGE": f"{registry}/node:26",
                "GOPROXY": goproxy,
                "APT_MIRROR": apt_mirror,
                "NPM_REGISTRY": npm_registry,
        }},
        "restart": "unless-stopped", "init": True,
        "secrets": ["app_config"], "volumes": ["app_data:/app/data", {
            "type": "bind", "source": str(directory / "logs" / "app"),
            "target": "/app/data/logs", "bind": {"create_host_path": False},
        }],
        "networks": {"edge": {"ipv4_address": app_ip}, "database": {}},
        "depends_on": {"postgres": {"condition": "service_healthy"}},
        "healthcheck": {"test": ["CMD", "node", "/app/deploy/healthcheck.mjs"], "interval": "20s", "timeout": "10s", "retries": 6, "start_period": "30s"},
        "logging": logging, "stop_grace_period": "20s",
    }
    bootstrap = {k: v for k, v in application.items() if k not in ("restart", "healthcheck", "networks", "build")}
    bootstrap.update({"profiles": ["tools"], "networks": ["database"],
                      "command": ["/app/bin/blog-admin", "-config", "/app/server/config/config.yaml", "-migrate", "-if-missing"]})
    ports = [f"127.0.0.1:{urlsplit(origin).port}:80"] if local else ["80:80", "443:443", "443:443/udp"]
    compose = {
        "name": project,
        "services": {
            "postgres": {"image": f"{registry}/postgres:16-alpine", "restart": "unless-stopped",
                         "entrypoint": ["/bin/sh", "/opt/blog/postgres-entrypoint.sh"],
                         "environment": {"POSTGRES_DB": "nightlog", "POSTGRES_USER": "postgres", "POSTGRES_PASSWORD_FILE": "/run/pg-private/root-password"},
                         "secrets": ["db_password", "db_root_password", "app_init"],
                         "volumes": ["postgres_data:/var/lib/postgresql/data", f"{ROOT}/deploy/postgres-entrypoint.sh:/opt/blog/postgres-entrypoint.sh:ro"],
                         "networks": ["database"], "healthcheck": {"test": ["CMD-SHELL", "pg_isready -U postgres -d nightlog"], "interval": "3s", "timeout": "3s", "retries": 40}, "logging": logging},
            "bootstrap": bootstrap,
            "app": application,
            "caddy": {"image": f"{registry}/caddy:2-alpine", "restart": "unless-stopped", "ports": ports,
                      "volumes": ["./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy_data:/data", "caddy_config:/config"],
                      "networks": {"edge": {"ipv4_address": proxy_ip}},
                      "depends_on": {"app": {"condition": "service_healthy"}}, "logging": logging},
        },
        "networks": {"edge": {"ipam": {"config": [{"subnet": str(network)}]}}, "database": {"internal": True}},
        "volumes": {name: {} for name in ["postgres_data", "app_data", "caddy_data", "caddy_config"]},
        "secrets": {"app_config": {"file": "./config.yaml"}, "db_password": {"file": "./db_password"},
                    "db_root_password": {"file": "./db_root_password"}, "app_init": {"file": "./app-init.sql"}},
    }
    site_address = "http://:80" if local else urlsplit(origin).hostname
    caddy = f"""{{
    admin off
}}
{site_address} {{
    encode zstd gzip
    request_body {{
        max_size 12MB
    }}
    header {{
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }}
    redir / /v1 308
    @blog path /v1 /v1/*
    handle @blog {{
        reverse_proxy app:3100 {{
            header_up X-Forwarded-For {{remote_host}}
            header_up -X-Real-IP
            header_up -Forwarded
            header_up -X-Nightlog-SSR-Key
        }}
    }}
    handle {{
        respond 404
    }}
}}
"""
    if not reusing:
        private_write(directory / "db_password", password + "\n")
        private_write(directory / "db_root_password", root_password + "\n")
        private_write(directory / "app-init.sql", f"CREATE ROLE nightlog LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '{password}';\nALTER DATABASE nightlog OWNER TO nightlog;\nALTER SCHEMA public OWNER TO nightlog;\n")
        private_write(directory / "config.yaml", json.dumps(config, indent=2) + "\n")
    # JSON is a YAML 1.2 subset, accepted by Go, Node and Compose; no host YAML package needed.
    replace_generated(directory / "compose.yaml", json.dumps(compose, indent=2) + "\n")
    replace_generated(directory / "Caddyfile", caddy)
    if not reusing:
        private_write(directory / "state.json", json.dumps(expected, indent=2) + "\n")
    elif any(state.get(name) != expected[name] for name in ("registry", "apt_mirror", "npm_registry", "goproxy")):
        # Build mirrors are interchangeable deployment inputs; preserve data and credentials.
        replace_generated(directory / "state.json", json.dumps(expected, indent=2) + "\n")
    return expected


def compose_command(directory: Path) -> list:
    return ["docker", "compose", "--project-directory", str(directory.absolute()), "-f", str(directory.absolute() / "compose.yaml")]


def deploy_commands(directory: Path) -> list:
    command = compose_command(directory)
    return [command + ["build", "app"], command + ["up", "-d", "--wait", "--wait-timeout", "180", "postgres"],
            command + ["run", "--rm", "--no-deps", "bootstrap"],
            command + ["up", "-d", "--wait", "--wait-timeout", "180", "app", "caddy"]]


def redeploy_commands(directory: Path) -> list:
    command = compose_command(directory)
    # Build first so a failed image build leaves the currently running services available.
    return [command + ["build", "app"], command + ["stop"],
            command + ["up", "-d", "--wait", "--wait-timeout", "180", "postgres"],
            command + ["run", "--rm", "--no-deps", "bootstrap"],
            command + ["up", "-d", "--wait", "--wait-timeout", "180", "app", "caddy"]]


@contextmanager
def deployment_lock(directory: Path):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(directory / ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    except BlockingIOError as error:
        raise ValueError("another deployment is running") from error
    finally:
        os.close(fd)


def wait_public(origin: str):
    for _ in range(30):
        try:
            with urlopen(origin + "/v1/readyz", timeout=5) as response:
                body = json.load(response)
                if response.status == 200 and body.get("code") == "OK":
                    return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise ValueError("public readiness failed; check DNS, ports 80/443, certificates and compose logs (data was preserved)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=[action.value for action in Action], default=Action.DEPLOY.value)
    parser.add_argument("--origin", help="https://your.domain; http://127.0.0.1:18080 for isolated smoke tests")
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--project", default=None)
    parser.add_argument("--subnet", default=None)
    parser.add_argument("--registry", default=None, help=f"official-image registry path; defaults to {DEFAULT_REGISTRY}")
    parser.add_argument("--apt-mirror", default=None, help=f"Debian mirror base URL; defaults to {DEFAULT_APT_MIRROR}")
    parser.add_argument("--npm-registry", default=None, help=f"npm registry URL; defaults to {DEFAULT_NPM_REGISTRY}")
    parser.add_argument("--goproxy", default=None, help=f"Go module proxy list; defaults to {DEFAULT_GOPROXY}")
    args = parser.parse_args()
    directory = args.directory.absolute()
    try:
        validate_directory(directory)
        with deployment_lock(directory):
            existing = json.loads((directory / "state.json").read_text()) if (directory / "state.json").exists() else {}
            origin = args.origin or existing.get("origin")
            if not origin:
                raise ValueError("first deployment requires --origin https://your.domain")
            state = initialize(directory, origin, args.project or existing.get("project", "clarence-blog"),
                               args.subnet or existing.get("subnet", "172.30.240.0/24"),
                               args.registry or existing.get("registry", DEFAULT_REGISTRY),
                               args.apt_mirror or existing.get("apt_mirror", DEFAULT_APT_MIRROR),
                               args.npm_registry or existing.get("npm_registry", DEFAULT_NPM_REGISTRY),
                               args.goproxy or existing.get("goproxy", DEFAULT_GOPROXY))
            action = Action(args.action)
            print(f"Host application logs: {directory / 'logs' / 'app'}", flush=True)
            if action == Action.INIT:
                print(f"Private deployment files prepared in {directory}; no services started.")
                return
            subprocess.run(["docker", "compose", "version"], check=True, stdout=subprocess.DEVNULL)
            command = compose_command(directory)
            if action in (Action.DEPLOY, Action.REDEPLOY):
                if action == Action.REDEPLOY:
                    labels = ["Building Go + Next.js production image", "Stopping existing production services (volumes preserved)", "Waiting for PostgreSQL", "Applying migrations and initializing administrator if missing", "Starting and checking application + HTTPS proxy"]
                    steps = redeploy_commands(directory)
                else:
                    labels = ["Building Go + Next.js production image", "Waiting for PostgreSQL", "Applying migrations and initializing administrator if missing", "Starting and checking application + HTTPS proxy"]
                    steps = deploy_commands(directory)
                for label, step in zip(labels, steps):
                    print(label, flush=True)
                    subprocess.run(step, check=True)
                wait_public(state["origin"])
                print(f"Ready: {state['origin']}/v1\nAdmin: {state['origin']}/v1/admin/posts\nInitial credentials: {directory / 'config.yaml'} (not printed).")
            elif action == Action.STATUS:
                subprocess.run(command + ["ps"], check=True)
            elif action == Action.LOGS:
                subprocess.run(command + ["logs", "--tail", "100", "app", "caddy"], check=True)
            elif action == Action.BACKUP:
                from datetime import datetime, timezone
                backup = directory / "backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
                backup.mkdir(parents=True, mode=0o700)
                os.chmod(backup.parent, 0o700)
                for name, step in [("database.dump", ["exec", "-T", "postgres", "pg_dump", "-U", "nightlog", "-Fc", "nightlog"]),
                                   ("uploads.tar.gz", ["exec", "-T", "app", "tar", "-czf", "-", "-C", "/app/data", "uploads"])]:
                    fd = os.open(backup / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, "wb") as output:
                        subprocess.run(command + step, check=True, stdout=output)
                print(f"Backup saved to {backup}; copy it and private configuration off this host.")
    except FileNotFoundError as error:
        if error.filename == "docker":
            message = "Docker CLI not found; install Docker Engine and Compose v2 before deploying"
        else:
            message = "required deployment file not found"
        print("Deployment failed: " + message + ". Existing data was preserved.", file=sys.stderr)
        return 1
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # No exception payloads: third-party tools can include connection credentials.
        print("Deployment failed: " + (str(error) if isinstance(error, ValueError) else type(error).__name__) + ". Check private configuration and service status; existing data was preserved.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
