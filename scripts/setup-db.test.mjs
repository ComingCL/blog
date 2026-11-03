import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareDatabaseSecret } from './setup-db.mjs';

function fixture(t, dsn = 'postgres://nightlog:fixture%40password@127.0.0.1:5432/nightlog?sslmode=disable') {
  const root = mkdtempSync(path.join(tmpdir(), 'blog-db-secret-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.yaml');
  writeFileSync(config, `database:\n  dsn: ${JSON.stringify(dsn)}\n`);
  return { root, config, directory: path.join(root, 'runtime', 'development') };
}

test('exports the configured password privately without changing YAML and preserves it on repeat', (t) => {
  const f = fixture(t);
  const before = readFileSync(f.config);
  prepareDatabaseSecret(f.config, f.directory);
  const password = path.join(f.directory, 'db_password');
  assert.ok(existsSync(password), 'setup must generate the private password file');
  assert.equal(readFileSync(password, 'utf8'), 'fixture@password');
  assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  assert.equal(statSync(password).mode & 0o777, 0o600);
  const time = statSync(password).mtimeMs;
  prepareDatabaseSecret(f.config, f.directory);
  assert.deepEqual(readFileSync(f.config), before);
  assert.equal(statSync(password).mtimeMs, time);
});

test('refuses a changed password instead of silently rotating an existing database secret', (t) => {
  const f = fixture(t);
  mkdirSync(f.directory, { recursive: true });
  writeFileSync(path.join(f.directory, 'db_password'), 'existing-fixture');
  assert.throws(() => prepareDatabaseSecret(f.config, f.directory), /does not match/);
  assert.equal(readFileSync(path.join(f.directory, 'db_password'), 'utf8'), 'existing-fixture');
});

test('invalid YAML and URL errors do not echo private input', (t) => {
  const f = fixture(t);
  for (const text of ['database:\n  dsn: "PRIVATE-fixture-password"', 'database: [PRIVATE-fixture-password']) {
    writeFileSync(f.config, text);
    assert.throws(() => prepareDatabaseSecret(f.config, f.directory), (error) => {
      assert.ok(!String(error).includes('PRIVATE-fixture-password'));
      return true;
    });
  }
  assert.ok(!existsSync(f.directory));
});

test('rejects DSNs that do not describe the fixed local development service', (t) => {
  for (const dsn of ['postgres://different:fixture@127.0.0.1:5432/nightlog', 'postgres://nightlog:fixture@example.com:5432/nightlog', 'postgres://nightlog:fixture@127.0.0.1:5433/nightlog', 'postgres://nightlog:fixture@127.0.0.1:5432/other']) {
    const f = fixture(t, dsn);
    assert.throws(() => prepareDatabaseSecret(f.config, f.directory), /local development/);
    assert.ok(!existsSync(f.directory));
  }
});

test('refuses symlink password files without altering their targets', (t) => {
  const f = fixture(t);
  mkdirSync(f.directory, { recursive: true });
  const target = path.join(f.root, 'outside');
  writeFileSync(target, 'untouched');
  symlinkSync(target, path.join(f.directory, 'db_password'));
  assert.throws(() => prepareDatabaseSecret(f.config, f.directory));
  assert.equal(readFileSync(target, 'utf8'), 'untouched');
});

test('development Compose reads a private file and keeps the original database volume identity', async () => {
  const { default: YAML } = await import('../web/node_modules/yaml/dist/index.js');
  const compose = YAML.parse(readFileSync(new URL('../deploy/compose.yaml', import.meta.url), 'utf8'));
  const pg = compose.services.postgres;
  assert.ok(!('POSTGRES_PASSWORD' in pg.environment), 'a tracked Compose file must not contain the database password');
  assert.equal(pg.environment.POSTGRES_PASSWORD_FILE, '/run/pg-private/password');
  assert.equal(compose.secrets.db_password.file, './runtime/development/db_password');
  assert.ok(pg.secrets.includes('db_password'));
  assert.ok(pg.volumes.includes('postgres_data:/var/lib/postgresql/data'));
  assert.deepEqual(pg.ports, ['127.0.0.1:5432:5432']);
});
