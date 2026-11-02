// Minimal .env handling shared by the Strava scripts. No dependencies.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

// KEY=VALUE parser. Returns null if the file doesn't exist.
export function readEnvFile(file) {
  if (!existsSync(file)) return null;
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

// Replace (or append) one key, leaving every other line untouched.
export function writeEnvValue(file, key, value) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const i = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (i > -1) lines[i] = `${key}=${value}`;
  else {
    if (lines.at(-1) === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  writeFileSync(file, lines.join('\n'));
  chmodSync(file, 0o600); // owner-only; writeFileSync's mode only applies to new files
}
