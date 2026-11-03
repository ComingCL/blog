import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from '../web/node_modules/yaml/dist/index.js';

// This helper exports only the local Compose password. The application still reads YAML.
export function prepareDatabaseSecret(configPath, directory) {
  let url;
  let password;
  try {
    if (fs.statSync(configPath).size > 65536) throw new Error();
    const config = YAML.parse(fs.readFileSync(configPath, 'utf8'), { logLevel: 'silent' });
    if (typeof config?.database?.dsn !== 'string') throw new Error();
    url = new URL(config.database.dsn);
    password = decodeURIComponent(url.password);
    if (!password || /[\r\n\0]/.test(password)) throw new Error();
  } catch {
    throw new Error('Cannot read a valid database DSN from private YAML.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || (url.port && url.port !== '5432')
      || url.username !== 'nightlog' || url.pathname !== '/nightlog') {
    throw new Error('The local development Compose service requires loopback port 5432 and user/database nightlog.');
  }
  for (const folder of [path.dirname(directory), directory]) {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    if (!fs.lstatSync(folder).isDirectory()) throw new Error('Private credential directory must not be a symlink.');
    fs.chmodSync(folder, 0o700);
  }
  const target = path.join(directory, 'db_password');
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!fs.lstatSync(target).isFile()) throw new Error('Private password must be a regular file, not a symlink.');
    if (fs.readFileSync(target, 'utf8') !== password) {
      throw new Error('Existing database password file does not match YAML; reconcile credentials explicitly, never rotate automatically.');
    }
    fs.chmodSync(target, 0o600);
    return;
  }
  try {
    fs.writeFileSync(fd, password, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepareDatabaseSecret(path.join(root, 'server/config/config.yaml'), path.join(root, 'deploy/runtime/development'));
    console.log('Private development database credential prepared; no database password was changed.');
  } catch {
    console.error('Cannot prepare private database credential. Check local YAML, file permissions and any existing secret mismatch; no database was changed.');
    process.exitCode = 1;
  }
}
