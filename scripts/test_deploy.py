import importlib.util
import contextlib
import io
import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("blog_deploy", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTests(unittest.TestCase):
    def test_private_configuration_cannot_be_generated_in_public_source_directories(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(deploy,"ROOT",Path(tmp)):
            directory=Path(tmp)/"docs"
            with self.assertRaises(ValueError):
                deploy.initialize(directory,"https://blog.example.com")
            self.assertFalse(directory.exists())

    def test_first_initialization_generates_private_strong_credentials_and_no_public_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / "production"
            deploy.initialize(directory, "https://blog.example.com")
            password = (directory / "db_password").read_text().strip()
            self.assertGreaterEqual(len(password), 48)
            self.assertRegex(password, r"[A-Z]")
            self.assertRegex(password, r"[a-z]")
            self.assertRegex(password, r"[0-9]")
            self.assertRegex(password, r"[-_]")
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
            for name in ["db_password", "config.yaml", "state.json", "compose.yaml"]:
                self.assertEqual(stat.S_IMODE((directory / name).stat().st_mode), 0o600)
            config = json.loads((directory / "config.yaml").read_text())
            self.assertIn(password, config["database"]["dsn"])
            self.assertTrue(config["security"]["cookie_secure"])
            self.assertNotEqual(config["admin"]["password"], password)
            compose = json.loads((directory / "compose.yaml").read_text())
            self.assertNotIn(password, json.dumps(compose))
            self.assertNotIn("ports", compose["services"]["postgres"])
            self.assertNotIn("ports", compose["services"]["app"])
            self.assertEqual(compose["services"]["postgres"]["environment"]["POSTGRES_PASSWORD_FILE"], "/run/pg-private/root-password")
            self.assertEqual(compose["services"]["postgres"]["environment"]["POSTGRES_USER"], "postgres")
            self.assertNotEqual(password, (directory / "db_root_password").read_text().strip())
            self.assertIn("NOSUPERUSER NOCREATEDB NOCREATEROLE", (directory / "app-init.sql").read_text())
            self.assertEqual(config["server"]["trusted_proxies"], ["172.30.240.2"])
            self.assertEqual(config["server"]["web_port"], 3100)

    def test_repeat_keeps_password_configuration_and_project_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            deploy.initialize(path, "https://blog.example.com", "my-blog")
            before = {name: (path / name).read_bytes() for name in ["db_password", "config.yaml", "state.json"]}
            deploy.initialize(path, "https://blog.example.com", "my-blog")
            self.assertEqual(before, {name: (path / name).read_bytes() for name in before})
            with self.assertRaises(ValueError):
                deploy.initialize(path, "https://other.example.com", "my-blog")
            with self.assertRaises(ValueError):
                deploy.initialize(path, "https://blog.example.com", "another-blog")

    def test_repeat_refreshes_generated_routes_without_rotating_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            deploy.initialize(path,"https://blog.example.com")
            secret=(path/"config.yaml").read_bytes()
            (path/"Caddyfile").write_text("stale generated routing")
            deploy.initialize(path,"https://blog.example.com")
            self.assertIn("handle @blog",(path/"Caddyfile").read_text())
            self.assertEqual(secret,(path/"config.yaml").read_bytes())

    def test_rejects_invalid_or_unsafe_configuration_without_writing(self):
        for origin in ["http://blog.example.com", "https://user:pass@blog.example.com", "https://example.com/path", "https://example.com?secret=x", "https://bad.example.com\n}", "https://example.com:444", "https://127.0.0.1"]:
            with self.subTest(origin=origin), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "production"
                with self.assertRaises(ValueError):
                    deploy.initialize(path, origin)
                self.assertFalse(path.exists())

    def test_partial_state_fails_closed_instead_of_regenerating_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / "db_password").write_text("existing-password")
            with self.assertRaises(ValueError):
                deploy.initialize(path, "https://blog.example.com")
            self.assertEqual((path / "db_password").read_text(), "existing-password")

    def test_origin_local_smoke_and_safe_subnet(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            deploy.initialize(path, "http://127.0.0.1:18080", subnet="172.30.241.0/24")
            compose = json.loads((path / "compose.yaml").read_text())
            self.assertEqual(compose["services"]["caddy"]["ports"], ["127.0.0.1:18080:80"])
            self.assertFalse(json.loads((path / "config.yaml").read_text())["security"]["cookie_secure"])
        for subnet in ["0.0.0.0/0", "203.0.113.0/24", "172.30.240.0/31"]:
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                deploy.initialize(Path(tmp), "https://blog.example.com", subnet=subnet)

    def test_deploy_builds_and_checks_database_before_bootstrap_then_waits_for_application(self):
        steps = deploy.deploy_commands(Path("/tmp/blog production"))
        self.assertEqual([step[-1] for step in steps[:3]], ["app", "postgres", "bootstrap"])
        self.assertIn("--wait", steps[1])
        self.assertIn("--wait", steps[3])
        self.assertTrue(all(step[:2] == ["docker", "compose"] for step in steps))
        self.assertTrue(all("down" not in step and "-v" not in step for step in steps))

    def test_orchestrator_stops_after_failed_build_without_logging_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            calls=[]
            def execute(command, **kwargs):
                calls.append(command)
                if "build" in command:
                    raise subprocess.CalledProcessError(1,command)
            stderr=io.StringIO()
            with patch.object(sys,"argv",["deploy.py","--origin","https://blog.example.com","--directory",tmp]), patch.object(deploy.subprocess,"run",side_effect=execute),contextlib.redirect_stderr(stderr),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(deploy.main(),1)
            self.assertFalse(any("up" in command or "run" in command for command in calls))
            password=(directory/"db_password").read_text().strip()
            self.assertNotIn(password,stderr.getvalue())

    def test_orchestrator_checks_public_readiness_after_all_four_steps(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls=[]
            with patch.object(sys,"argv",["deploy.py","--origin","https://blog.example.com","--directory",tmp]),patch.object(deploy.subprocess,"run",side_effect=lambda command,**kwargs:calls.append(command)),patch.object(deploy,"wait_public") as readiness,contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(deploy.main(),0)
            self.assertEqual(calls[1:],deploy.deploy_commands(Path(tmp)))
            readiness.assert_called_once_with("https://blog.example.com")


if __name__ == "__main__":
    unittest.main()
