"""Keep private runtime configuration out of Git without hiding source files."""
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class GitIgnoreTests(unittest.TestCase):
    def ignored(self, path):
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "-q", path],
            cwd=ROOT, capture_output=True, check=False,
        )
        self.assertIn(result.returncode, (0, 1))
        return result.returncode == 0

    def test_private_configuration_keys_and_runtime_are_ignored(self):
        for path in (
            "server/config/config.yaml", "server/config/config.production.yaml",
            "server/config/config.backup.yml", "server/config/config.yaml.bak",
            "deploy/runtime/development/db_password",
            "deploy/runtime/production/config.yaml",
            "deploy/runtime/production/db_root_password",
            ".env", ".env.legacy", "web/.env.local", "web/.env.local.legacy",
            "deploy/tls/private.key", "deploy/tls/private.pem",
            "deploy/tls/identity.p12", "deploy/tls/identity.pfx",
            "server/storage/backups/database.dump",
        ):
            with self.subTest(path=path):
                self.assertTrue(self.ignored(path), path)

    def test_public_templates_code_and_lockfiles_remain_visible(self):
        for path in (
            "server/config/config.example.yaml", "deploy/build-config.yaml",
            "deploy/compose.yaml", "deploy/Dockerfile", "scripts/setup.py",
            ".env.example", "web/package-lock.json", "server/go.sum",
            "server/src/infrastructure/db/migrations/001_init.sql",
            "harness/changes/example.md",
        ):
            with self.subTest(path=path):
                self.assertFalse(self.ignored(path), path)


if __name__ == "__main__":
    unittest.main()
