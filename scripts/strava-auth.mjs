#!/usr/bin/env node
// One-time Strava OAuth helper. Gets a refresh token with activity:read_all
// and writes it to .env as STRAVA_REFRESH_TOKEN.
//
//   node scripts/strava-auth.mjs            (callback on port 8787)
//   node scripts/strava-auth.mjs --port 9000
//
// Needs STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env, and the Strava app's
// "Authorization Callback Domain" set to `localhost`. No dependencies (Node 18+).
// Never prints secret values.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ENV_PATH      = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const SCOPE         = 'activity:read_all';
const TIMEOUT_MS    = 5 * 60 * 1000;
const portArg       = process.argv.indexOf('--port');
const PORT          = Number(portArg > -1 ? process.argv[portArg + 1] : 8787);
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ── .env read/write (minimal KEY=VALUE parser) ────────────────
function readEnv() {
  if (!existsSync(ENV_PATH)) fail('No .env found. Run `cp .env.example .env` and fill in STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.');
  const env = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

// Replace (or append) one key, leaving every other line untouched.
function writeEnvValue(key, value) {
  const lines = readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  const i = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (i > -1) lines[i] = `${key}=${value}`;
  else {
    if (lines.at(-1) === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  writeFileSync(ENV_PATH, lines.join('\n'));
  chmodSync(ENV_PATH, 0o600); // owner-only; writeFileSync's mode only applies to new files
}

// ── Setup ─────────────────────────────────────────────────────
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail('--port must be a number between 1 and 65535.');

const env = readEnv();
const missing = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'].filter(k => !env[k]);
if (missing.length) fail(`Missing in .env: ${missing.join(', ')}`);

const state = randomBytes(16).toString('hex'); // CSRF check on the callback
const authorizeUrl = 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({
  client_id:       env.STRAVA_CLIENT_ID,
  response_type:   'code',
  redirect_uri:    REDIRECT_URI,
  approval_prompt: 'force',
  scope:           SCOPE,
  state,
});

// ── Callback server ───────────────────────────────────────────
function page(res, status, title, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
    <body style="font:16px system-ui;max-width:560px;margin:60px auto;padding:0 20px">
    <h2>${title}</h2><p>${body}</p><p>You can close this tab.</p>`);
}

let finished = false;
const servers = [];
function shutdown(code) {
  finished = true;
  servers.forEach(s => s.close());
  setTimeout(() => process.exit(code), 100); // let the browser response flush
}

async function handle(req, res) {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
  if (finished) { page(res, 410, 'Already done', 'This helper has already finished.'); return; }

  const error = url.searchParams.get('error');
  if (error) {
    page(res, 400, 'Authorization cancelled', `Strava returned: ${error}.`);
    console.error(`\n✗ Strava returned "${error}" — you probably clicked Cancel. Run the script again and click Authorize.\n`);
    return shutdown(1);
  }
  if (url.searchParams.get('state') !== state) {
    page(res, 400, 'State mismatch', 'This callback did not come from the authorization started by this script.');
    console.error('\n✗ State mismatch on callback — ignored. Use the URL this script printed.\n');
    return; // keep waiting for the real callback
  }

  // Strava reports granted scopes on the callback (comma-separated), not in the token response.
  const granted = (url.searchParams.get('scope') || '').split(',').map(s => s.trim());
  if (!granted.includes(SCOPE)) {
    page(res, 400, 'Missing permission',
      `Strava granted <code>${granted.join(', ') || 'nothing'}</code> but this needs <code>${SCOPE}</code>.`);
    console.error(
      `\n✗ Strava granted scope "${granted.join(',') || '(none)'}", which doesn't include ${SCOPE}.\n` +
      `  On the Strava page, leave the "View data about your private activities" box ticked\n` +
      `  (unticking it drops ${SCOPE}). Run the script again to retry.\n`);
    return shutdown(1);
  }

  const code = url.searchParams.get('code');
  if (!code) { page(res, 400, 'No code', 'Strava did not send an authorization code.'); return shutdown(1); }

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        code,
        grant_type:    'authorization_code',
      }),
    });
    const data = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !data.refresh_token) {
      // Strava's error body has no secrets — just field/code pairs.
      const detail = data.message ? `${data.message} ${JSON.stringify(data.errors || [])}` : `HTTP ${tokenRes.status}`;
      page(res, 502, 'Token exchange failed', 'Check the terminal for details.');
      console.error(`\n✗ Token exchange failed: ${detail}\n  Check STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET in .env.\n`);
      return shutdown(1);
    }

    writeEnvValue('STRAVA_REFRESH_TOKEN', data.refresh_token);
    const who = data.athlete ? ` for ${data.athlete.firstname ?? 'athlete'} (id ${data.athlete.id})` : '';
    page(res, 200, 'Connected to Strava', `Refresh token saved to <code>.env</code>${who}.`);
    console.log(`\n✓ Authorized${who} with scope ${granted.join(',')}.`);
    console.log('✓ STRAVA_REFRESH_TOKEN written to .env (value not shown).\n');
    shutdown(0);
  } catch (err) {
    page(res, 502, 'Token exchange failed', 'Check the terminal for details.');
    console.error(`\n✗ Couldn't reach Strava: ${err.message}\n`);
    shutdown(1);
  }
}

// Listen on both IPv4 and IPv6 loopback — browsers may resolve `localhost` to either.
// Loopback only, so nothing on the local network can reach the callback.
let listening = 0;
for (const host of ['127.0.0.1', '::1']) {
  const server = createServer((req, res) => handle(req, res).catch(() => {}));
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') fail(`Port ${PORT} is in use. Try: node scripts/strava-auth.mjs --port 9000`);
    if (host === '::1') return; // no IPv6 on this machine — IPv4 is enough
    fail(`Couldn't start local server: ${err.message}`);
  });
  server.listen(PORT, host, () => {
    servers.push(server);
    if (++listening === 1) start();
  });
}

function start() {
  console.log(`\nWaiting for Strava on ${REDIRECT_URI}`);
  console.log('Opening your browser. If it doesn\'t open, visit:\n');
  console.log(`  ${authorizeUrl}\n`);
  const opener = process.platform === 'darwin' ? ['open', [authorizeUrl]]
               : process.platform === 'win32'  ? ['cmd', ['/c', 'start', '', authorizeUrl]]
               : ['xdg-open', [authorizeUrl]];
  spawn(...opener, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();

  setTimeout(() => {
    if (finished) return;
    console.error(`\n✗ Timed out after ${TIMEOUT_MS / 60000} minutes with no callback. Run the script again.\n`);
    shutdown(1);
  }, TIMEOUT_MS).unref();
}
