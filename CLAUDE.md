# Habits — CLAUDE.md

Personal habit tracker built as a static PWA (plain HTML + CSS + JS, no build step), designed to live on the iPhone home screen. Hosted on GitHub Pages and bookmarked in Safari. All state is stored in Supabase via Edge Functions; the page itself is stateless and can be opened from any device.

---

## Stack

| Layer | Technology |
|---|---|
| App shell | `habit-tracker.html` (markup) + `css/styles.css` + `js/app.js` — no build step |
| Fonts | Inter (UI) + Roboto Mono (chips, dates, buttons) via Google Fonts |
| Backend | Supabase Edge Functions (Deno) |
| Local cache | `localStorage` — instant render on load, offline fallback |
| Hosting | GitHub Pages; bookmarked in Safari on iPhone |

---

## Supabase backend

Project URL: `https://qbyuyoiiuoaeinvfiudv.supabase.co`

Three Edge Functions, all invoked via `POST`:

| Function | Purpose |
|---|---|
| `state-read` | Returns `{ daily, weekly, zone2, socialPlans }` for a given `{ dayKey, weekKey }` |
| `state-write` | Upserts `{ dayKey, weekKey, daily, weekly, zone2, socialPlans }` |
| `state-history` | Returns `{ rows: [{ day_key, daily }] }` for a `{ fromDay, toDay }` range |

Every request includes `x-habit-secret` in the header as a lightweight auth token (the secret is embedded in the JS; rotate in both places if compromised).

**`state-write` overwrites the whole week row.** Any field you omit is blanked — e.g. missing `socialPlans` wipes them. Always send the full payload (`livePayload()` does this for today).

Writes for today are **debounced 400 ms** — `saveState()` writes to `localStorage` immediately, then queues a network write. `flushSave()` sends a pending write on `pagehide` / `visibilitychange`.

The physical habit buttons in `habit-button/` also write to `state-write`, keyed by the exact habit name.

---

## State shape

```js
state = {
  dayKey:      "2026-11-01",          // YYYY-MM-DD, local time, resets at 3am
  weekKey:     "2026-10-26",          // Monday of current week
  daily:       { [habitKey]: true|false, ... },
  weekly:      { Push: "2026-11-01", Pull_log: [{ weight, reps }, ...], Tennis: "2026-11-03", ... },
  zone2:       45,                    // Zone 2 bike minutes this week
  socialPlans: { mon: '', ..., sun: '' }, // no UI any more, but must be passed through on writes
}
```

- **Weekly done flags** (`weekly.Push/Pull/Legs/Tennis`) hold the dayKey they were marked done, shown as `DD.MM` in the top nav. Weeks before the redesign stored `true` — treat any truthy value as done.
- **Skills is stored as `Tennis`.** The tab was renamed; the key wasn't, so past weeks still read.
- **Workout logs** (`weekly['<name>_log']`) are arrays indexed by exercise position in `WORKOUTS`. Reordering exercises scrambles past logs.
- **Posture 1 / Posture 2** are booleans. Days before the split only have `'Posture program'` (a 0–2 counter); `isHabitDone()` falls back to it.
- Old keys (`sym_*`, `daily_grateful`, `Work remote`, `Intervals`, …) may still be in stored data from the previous design. They're carried along untouched.

Day resets at **3:00 am local time** (`RESET_HOUR = 3`). Week rolls over on Monday at the same hour. `ensureFreshKeys()` runs on every render and clears stale keys.

---

## Navigation

Top nav with six tabs (`TABS`), rendered by `renderNav()`:

| Tab | Page | Nav tab footer |
|---|---|---|
| Habits | Daily checklist (default) | Progress bar: done / total |
| Push, Pull, Legs | Workout log + Mark as done/incomplete | Date done + dot (green when done); label struck through |
| Skills | Warm up / Affirmations / Cool down + Mark as done/incomplete | Same as workouts |
| Bike | "Cycling": Strava week (stats, weekly volume bar, rides) + Warm up / Cool down | Progress bar: this week's Strava minutes / goal — dark, green when complete |

- **History**: tapping the date chip on Habits opens History (a list of days with counts; "Load more" adds 14 days). Tapping a day opens it on the Habits page, editable. The "Habits" chip on History goes back. Tapping the Habits tab always returns to today.
- **Past-day edits** (`viewDay`) write straight to the API with no debounce. They're blocked until `state-read` for that day has returned (`viewDay.loaded`), so a past day is never written from partial data. If that day is in the current week, the write sends the live `state.weekly` so it can't roll back this week's workouts.
- **Bike** shows Strava data read from `data/strava/` (relative path, so it works on Pages and a local server). Defaults to the current week (Monday 00:00 local, matching `fetch-strava.mjs`). The week chip opens **Bike history** (`page = 'BikeHistory'`): one row per week from this week back to the oldest file in `index.json` (weeks in between with no file = no rides), 8 at a time with Load more; tapping a row opens that week; the "Cycling" chip goes back. Tapping the Bike tab always returns to this week. "Weekly volume" is total moving time on the bike, not just Zone 2. The progress bar and its label are capped at the goal (no over-goal display); the Minutes stat and the history rows show the real total. The current week is cached in `localStorage` (`stravaWeek`) so the nav bar renders before the fetch. `state.zone2` (the old manual counter) has no UI any more but is still passed through on writes.

---

## Design

Flat, white, bordered lists. Design tokens are CSS custom properties on `:root` at the top of `css/styles.css` — change those for design experiments.

Key tokens: `--surface` (#f1f1f1, done rows / stepper cells / active tab), `--line` (borders), `--muted` (row labels), `--green` (checks, progress), `--ink` (primary button + chip), `--red` (Mark as incomplete).

---

## Architecture decisions

**Plain static files.** No bundler, no framework, no npm. Adding a dependency means a `<script src="cdnjs…">` tag. Tailwind was considered and rejected: it needs a build step, and the design is already driven by the `:root` tokens.

**Don't rename `habit-tracker.html`.** It's the GitHub Pages URL the iPhone bookmark points to.

**Don't rename habit keys.** `DAILY_HABITS` entries are `{ key, label }`. `key` is what's stored in Supabase — the physical buttons and all history depend on it. Change `label` freely.

**Cache-busting.** The `<link>`/`<script>` tags in `habit-tracker.html` carry a `?v=N` query string. Bump `N` on the file(s) you changed so iOS Safari doesn't serve a stale copy.

**localStorage as the source of truth on load.** The app renders from cache immediately, then fetches from the API and re-renders.

**Workout log defaults.** When a new week starts and `weekly` is cleared, `saveWorkoutDefaults()` copies last week's weight/rep values to `localStorage`. `seedWorkoutDefaults()` re-applies them so the workout pages pre-fill with last week's numbers.

---

## Key constants (top of `js/app.js`)

- `DAILY_HABITS` — the 12 daily habits, in display order, as `{ key, label }`
- `ZONE2_GOAL = 240` (minutes/week), `ZONE2_STEP = 15`, `RESET_HOUR = 3`
- `WEEKLY_KEY` — tab name → `state.weekly` key
- `WORKOUTS` — Push/Pull/Legs titles and exercises (`{ name, target, unit? }`)
- `SKILLS_SECTIONS`, `BIKE_SECTIONS` — sub-nav sections, items as `[name, detail]`

---

## Open TODOs

- **No error UI for failed API writes**: writes fail silently (`console.warn`). A small toast on failure would help diagnose connectivity issues.
- **Past day that fails to load stays read-only** with no message — it just looks dimmed.
- **Workout log is per-week only**: no way to browse previous weeks' logs. `state-read` with an old `weekKey` returns them.

---

## File layout

```
Habits/
├── habit-tracker.html     ← markup + <link>/<script> tags (the URL the bookmark uses)
├── css/
│   └── styles.css         ← all styling; design tokens on :root at the top
├── js/
│   └── app.js             ← constants, state, Supabase sync, rendering, events
├── supabase/functions/    ← Edge Functions: state-read, state-write, state-history
├── scripts/
│   ├── strava-auth.mjs    ← one-time local Strava OAuth; writes STRAVA_REFRESH_TOKEN to .env
│   ├── fetch-strava.mjs   ← fetches weekly rides → data/strava/*.json
│   └── lib/env.mjs        ← shared .env read/write
├── data/strava/           ← generated weekly JSON + index.json (committed by the workflow)
├── .github/workflows/
│   └── strava.yml         ← hourly fetch + commit
├── .env.example           ← Strava credential names (real values go in gitignored .env)
├── habit-button/          ← ESP8266 physical habit buttons (Arduino sketches + build guide)
├── weekly-prototype.html  ← older standalone weekly-view prototype
├── CLAUDE.md              ← this file
└── Check.png              ← apple-touch-icon for home screen
```

---

## Strava integration

A scheduled GitHub Action fetches Strava rides and commits JSON files that the Bike tab reads. There is no server.

- GitHub Pages serves the **root of `main`**, so every committed file is public — including ride names and times in `data/strava/`. Strava secrets live only in `.env` locally (gitignored) and in GitHub Actions secrets (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `GH_PAT`). Never commit them and never print them.
- `node scripts/strava-auth.mjs` — one-time OAuth flow (scope `activity:read_all`); writes the refresh token into `.env`. The Strava app's Authorization Callback Domain must be `localhost`.
- `node scripts/fetch-strava.mjs` — refreshes the access token, fetches the current + previous week (Mon 00:00 → Mon 00:00, America/Toronto), writes `data/strava/<weekStart>.json` and `data/strava/index.json`. Edit `RIDE_TYPES`, `GOAL_MIN`, `WEEKS_BACK` at the top.
  - Files are only rewritten when something besides `generatedAt` changed, so `generatedAt` means "last changed", and no-op runs don't commit.
  - If Strava rotates the refresh token: in Actions it updates the repo secret via `gh secret set` (needs `GH_PAT` with Secrets read/write); locally it updates `.env` and warns that the GitHub secret is now stale.
- `.github/workflows/strava.yml` — hourly at :23 + manual trigger; commits as `github-actions[bot]` with "Update Strava data". Pull before pushing locally, since the bot commits to `main`.
- Weeks here start Monday 00:00 Toronto time; the app's own week rolls over Monday 3:00 device time. Week keys (the Monday date) match.

---

## Local development

No build step, but serve it over HTTP — browsers block `fetch` of the Strava JSON from a `file://` page:

```
python3 -m http.server 8000      # from the repo root
open http://localhost:8000/habit-tracker.html
```

The app reads/writes the same Supabase project regardless of where it's opened, so **edits in the browser immediately affect live data**.

To preview without touching live data, load the page with `fetch` stubbed out (and block the Supabase host, e.g. Chrome's `--host-resolver-rules="MAP qbyuyoiiuoaeinvfiudv.supabase.co 127.0.0.1"`).
