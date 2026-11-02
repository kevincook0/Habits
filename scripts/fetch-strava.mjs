#!/usr/bin/env node
// Fetches Strava rides for the current and previous week and writes
// data/strava/<weekStart>.json plus data/strava/index.json (served by GitHub Pages).
//
//   node scripts/fetch-strava.mjs
//   node scripts/fetch-strava.mjs --since 2026-09-01   (one-off backfill: every week from that date)
//
// Weeks run Monday 00:00 → next Monday 00:00 in America/Toronto. Reads
// STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_REFRESH_TOKEN from the
// environment, falling back to .env locally. If Strava issues a new refresh
// token it's saved back: the repository secret (via `gh` + GH_PAT) in GitHub
// Actions, .env locally. Never prints token values. No dependencies (Node 20+).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEnvFile, writeEnvValue } from './lib/env.mjs';

const TIME_ZONE  = 'America/Toronto';
const RIDE_TYPES = ['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide'];
const GOAL_MIN   = 240;  // weekly moving-time goal — keep in sync with ZONE2_GOAL in js/app.js
const WEEKS_BACK = 1;    // previous weeks refreshed each run, so late Sunday uploads land correctly

const PER_PAGE        = 100;
const MAX_PAGES       = 20;
const MAX_429_RETRIES = 3;

const ROOT       = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH   = path.join(ROOT, '.env');
const OUT_DIR    = path.join(ROOT, 'data', 'strava');
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

function fail(msg) {
  console.error(IN_ACTIONS ? `::error::${msg}` : `\n✗ ${msg}\n`);
  process.exit(1);
}

// Tell the Actions runner to redact a value from all later log output.
function mask(value) {
  if (IN_ACTIONS && value) console.log(`::add-mask::${value}`);
}

// ── Config ────────────────────────────────────────────────────
const KEYS    = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];
const fileEnv = IN_ACTIONS ? {} : (readEnvFile(ENV_PATH) || {});
const cfg     = Object.fromEntries(KEYS.map(k => [k, process.env[k] || fileEnv[k] || '']));
KEYS.forEach(k => mask(cfg[k]));
const missing = KEYS.filter(k => !cfg[k]);
if (missing.length) fail(IN_ACTIONS
  ? `Missing ${missing.join(', ')}. Add them as *repository* secrets: Settings → Secrets and variables → Actions → Secrets tab → Repository secrets (not Variables, Environment, Codespaces or Dependabot secrets).`
  : `Missing ${missing.join(', ')} (set them as environment variables or in .env).`);

// ── Time zone helpers ─────────────────────────────────────────
// Offset (ms) of TIME_ZONE from UTC at a given instant.
function tzOffsetMs(epochMs) {
  const t = epochMs - (epochMs % 1000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
}

// Epoch ms of 00:00 on a calendar date (YYYY-MM-DD) in TIME_ZONE.
function zonedMidnight(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(guess);
  return guess - tzOffsetMs(first); // second pass corrects across a DST change
}

// Today's date (YYYY-MM-DD) in TIME_ZONE.
function todayKey() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mondayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysKey(key, -((dow + 6) % 7));
}

// ISO 8601 in TIME_ZONE with its offset, e.g. 2026-10-26T00:00:00-04:00
function isoZoned(epochMs) {
  const off   = tzOffsetMs(epochMs);
  const local = new Date(epochMs + off).toISOString().slice(0, 19);
  const abs   = Math.abs(off) / 60000;
  const hh    = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm    = String(abs % 60).padStart(2, '0');
  return `${local}${off < 0 ? '-' : '+'}${hh}:${mm}`;
}

// ── Strava API with rate-limit handling ───────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Strava's limits reset on the quarter hour (15-min window) and at midnight UTC (daily).
function msUntilNextQuarterHour() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15 + 15, 0, 0);
  return next - now;
}

// Logs usage and returns true if a daily limit is used up.
function checkRateLimit(res) {
  let dailyExhausted = false;
  for (const prefix of ['x-ratelimit', 'x-readratelimit']) {
    const limit = res.headers.get(`${prefix}-limit`);
    const usage = res.headers.get(`${prefix}-usage`);
    if (!limit || !usage) continue;
    const [l15, lDay] = limit.split(',').map(Number);
    const [u15, uDay] = usage.split(',').map(Number);
    console.log(`  ${prefix === 'x-ratelimit' ? 'Rate limit' : 'Read limit'}: ${u15}/${l15} (15 min), ${uDay}/${lDay} (day)`);
    if (uDay >= lDay) dailyExhausted = true;
  }
  return dailyExhausted;
}

async function stravaFetch(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const dailyExhausted = checkRateLimit(res);
    if (res.status !== 429) return res;
    if (dailyExhausted) throw new Error('Strava daily rate limit reached — it resets at midnight UTC.');
    if (attempt >= MAX_429_RETRIES) throw new Error(`Strava rate limit: still 429 after ${MAX_429_RETRIES} waits.`);
    const wait = msUntilNextQuarterHour() + 5000;
    console.log(`  429 rate limited — waiting ${Math.ceil(wait / 1000)}s for the 15-minute window to reset…`);
    await sleep(wait);
  }
}

// ── Refresh token rotation ────────────────────────────────────
function saveRefreshToken(token) {
  if (IN_ACTIONS) {
    if (!process.env.GH_PAT) throw new Error('GH_PAT is not set, so the new refresh token could not be saved.');
    if (!process.env.GITHUB_REPOSITORY) throw new Error('GITHUB_REPOSITORY is not set.');
    // Value goes in on stdin, never on the command line.
    const r = spawnSync('gh', ['secret', 'set', 'STRAVA_REFRESH_TOKEN', '--repo', process.env.GITHUB_REPOSITORY], {
      input: token,
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: process.env.GH_PAT },
    });
    if (r.status !== 0) throw new Error(`gh secret set failed: ${(r.stderr || r.error?.message || '').trim()}`);
    console.log('Strava issued a new refresh token — STRAVA_REFRESH_TOKEN repository secret updated.');
  } else {
    if (!existsSync(ENV_PATH)) throw new Error('No .env to save the new refresh token to.');
    writeEnvValue(ENV_PATH, 'STRAVA_REFRESH_TOKEN', token);
    console.log('Strava issued a new refresh token — saved to .env (value not shown).');
    console.log('  ⚠ The STRAVA_REFRESH_TOKEN GitHub secret is now out of date. Update it from .env:');
    console.log('    GitHub → Settings → Secrets and variables → Actions → STRAVA_REFRESH_TOKEN');
  }
}

// ── Output ────────────────────────────────────────────────────
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

function buildWeek(week, activities, generatedAt) {
  const rides = activities
    .filter(a => RIDE_TYPES.includes(a.sport_type))
    .filter(a => { const t = Date.parse(a.start_date); return t >= week.startMs && t < week.endMs; })
    .sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date));

  const movingTimeSec = rides.reduce((s, a) => s + (a.moving_time || 0), 0);
  const distanceM     = rides.reduce((s, a) => s + (a.distance || 0), 0);
  const elevationM    = rides.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const doneMin       = Math.floor(movingTimeSec / 60);

  return {
    generatedAt,
    weekStart: isoZoned(week.startMs),
    weekEnd:   isoZoned(week.endMs),
    totals: {
      movingTimeSec,
      distanceKm: round(distanceM / 1000, 2),
      elevationM: round(elevationM, 1),
      rideCount:  rides.length,
    },
    goal: { goalMin: GOAL_MIN, doneMin, complete: doneMin >= GOAL_MIN },
    rides: rides.map(a => ({
      id:            a.id,
      name:          a.name,
      startDate:     a.start_date,
      movingTimeSec: a.moving_time || 0,
      distanceKm:    round((a.distance || 0) / 1000, 2),
      elevationM:    round(a.total_elevation_gain || 0, 1),
    })),
  };
}

// Write only when something other than generatedAt changed, so hourly runs
// with no new rides leave the file (and git) untouched.
function writeIfChanged(file, data) {
  let prev = null;
  try { prev = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  const withoutStamp = o => JSON.stringify({ ...o, generatedAt: undefined });
  if (prev && withoutStamp(prev) === withoutStamp(data)) return false;
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return true;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // Weeks to refresh, newest first: WEEKS_BACK by default, or back to --since.
  const thisMonday = mondayOf(todayKey());
  let weekCount = WEEKS_BACK + 1;
  const sinceArg = process.argv.indexOf('--since');
  if (sinceArg > -1) {
    const since = process.argv[sinceArg + 1] || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || since > todayKey()) fail('--since needs a past date like 2026-09-01.');
    weekCount = Math.max(weekCount, Math.round((Date.parse(thisMonday) - Date.parse(mondayOf(since))) / (7 * 864e5)) + 1);
    if (weekCount > 104) fail('--since can go back at most 2 years.');
    console.log(`Backfilling ${weekCount} weeks from ${mondayOf(since)}.`);
  }
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const key = addDaysKey(thisMonday, -7 * i);
    return { key, startMs: zonedMidnight(key), endMs: zonedMidnight(addDaysKey(key, 7)) };
  });

  console.log('Refreshing Strava access token…');
  const tokenRes = await stravaFetch('https://www.strava.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     cfg.STRAVA_CLIENT_ID,
      client_secret: cfg.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: cfg.STRAVA_REFRESH_TOKEN,
    }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  mask(tok.access_token);
  mask(tok.refresh_token);
  if (!tokenRes.ok || !tok.access_token) {
    const detail = tok.message ? `${tok.message} ${JSON.stringify(tok.errors || [])}` : `HTTP ${tokenRes.status}`;
    fail(`Token refresh failed: ${detail}. If the refresh token was revoked, run \`node scripts/strava-auth.mjs\` and update the secret.`);
  }

  // A failed save doesn't stop this run (the access token works), but the run fails at the end.
  let rotationError = null;
  if (tok.refresh_token && tok.refresh_token !== cfg.STRAVA_REFRESH_TOKEN) {
    try { saveRefreshToken(tok.refresh_token); }
    catch (err) { rotationError = err; }
  }

  // One request range covering every week, split into weeks locally.
  const after  = Math.floor(weeks.at(-1).startMs / 1000) - 1; // `after` is exclusive
  const before = Math.ceil(weeks[0].endMs / 1000);
  const activities = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    console.log(`Fetching activities page ${page}…`);
    const url = 'https://www.strava.com/api/v3/athlete/activities?' +
      new URLSearchParams({ after, before, per_page: PER_PAGE, page });
    const res = await stravaFetch(url, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Activities request failed: HTTP ${res.status} ${body.message || ''} ${JSON.stringify(body.errors || [])}`);
    }
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  const byType = {};
  activities.forEach(a => { byType[a.sport_type] = (byType[a.sport_type] || 0) + 1; });
  console.log(`${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} in range` +
    (activities.length ? ` (${Object.entries(byType).map(([t, n]) => `${t} ×${n}`).join(', ')})` : ''));

  mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  for (const week of weeks) {
    const data    = buildWeek(week, activities, generatedAt);
    const changed = writeIfChanged(path.join(OUT_DIR, `${week.key}.json`), data);
    console.log(`${week.key}: ${data.totals.rideCount} ride(s), ${data.goal.doneMin}/${GOAL_MIN} min` +
      `${data.goal.complete ? ' ✓' : ''} — ${changed ? 'updated' : 'unchanged'}`);
  }

  const available = readdirSync(OUT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.slice(0, 10))
    .sort()
    .reverse();
  const indexChanged = writeIfChanged(path.join(OUT_DIR, 'index.json'), { generatedAt, weeks: available });
  console.log(`index.json: ${available.length} week(s) — ${indexChanged ? 'updated' : 'unchanged'}`);

  if (rotationError) fail(`Data written, but the new refresh token was NOT saved: ${rotationError.message}`);
}

main().catch(err => fail(err.message));
