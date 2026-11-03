"""Private initialization behavior using isolated repositories; no real config is read."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


class SetupTests(unittest.TestCase):
    def run_setup(self, directory):
        scripts = directory / 'scripts'
        scripts.mkdir(exist_ok=True)
        for filename in ['setup.py', 'setup-db.mjs']:
            shutil.copyfile(ROOT / 'scripts' / filename, scripts / filename)
        web = directory / 'web'
        web.mkdir(exist_ok=True)
        if not (web / 'node_modules').exists():
            (web / 'node_modules').symlink_to(ROOT / 'web/node_modules', target_is_directory=True)
        return subprocess.run([sys.executable, str(scripts / 'setup.py')], capture_output=True, text=True)

    def test_fresh_installations_get_distinct_private_database_passwords(self):
        passwords = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                result = self.run_setup(directory)
                self.assertEqual(result.returncode, 0, result.stderr)
                config = directory / 'server/config/config.yaml'
                dsn = json.loads(re.search(r'^  dsn: (.+)$', config.read_text(), re.M).group(1))
                password = urlsplit(dsn).password
                self.assertGreaterEqual(len(password), 48)
                passwords.append(password)
                self.assertNotIn(password, result.stdout + result.stderr)
                private_file = directory / 'deploy/runtime/development/db_password'
                self.assertTrue(private_file.exists(), 'setup must write the Compose password secret')
                self.assertEqual(private_file.read_text(), password)
                self.assertEqual(config.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(*passwords)

    def test_existing_yaml_is_unchanged_and_repeat_never_rotates_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            config = directory / 'server/config/config.yaml'
            config.parent.mkdir(parents=True)
            content = 'database:\n  dsn: "postgres://nightlog:fixture-keep-this-password@127.0.0.1:5432/nightlog"\n'
            config.write_text(content)
            for _ in range(2):
                result = self.run_setup(directory)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(config.read_text(), content)
                secret = directory / 'deploy/runtime/development/db_password'
                self.assertTrue(secret.exists(), 'existing YAML must also prepare the private Compose secret')
                self.assertEqual(secret.read_text(), 'fixture-keep-this-password')
                self.assertNotIn('fixture-keep-this-password', result.stdout + result.stderr)

    def test_legacy_credentials_are_preserved_and_never_printed(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            (directory / '.env').write_text('DATABASE_URL=postgres://nightlog:legacy-fixture-password@127.0.0.1:5432/nightlog\nADMIN_PASSWORD=legacy-fixture-admin\n')
            result = self.run_setup(directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            secret = directory / 'deploy/runtime/development/db_password'
            self.assertTrue(secret.exists())
            self.assertEqual(secret.read_text(), 'legacy-fixture-password')
            config = (directory / 'server/config/config.yaml').read_text()
            self.assertIn('legacy-fixture-admin', config)
            self.assertNotIn('legacy-fixture', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
