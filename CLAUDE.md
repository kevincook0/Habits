# Habits — CLAUDE.md

Personal habit tracker built as a single-file PWA, designed to live on the iPhone home screen. All state is stored in Supabase via Edge Functions; the HTML file itself is stateless and can be opened from any device.

---

## Stack

| Layer | Technology |
|---|---|
| App shell | Single-file HTML (`habit-tracker.html`) — all CSS and JS inline, no build step |
| Fonts | Inter (UI) + Fraunces (accents) via Google Fonts |
| Charts | Chart.js 4.4.1 from cdnjs |
| Backend | Supabase Edge Functions (Deno) |
| Local cache | `localStorage` — used as offline fallback and write buffer |
| Hosting | Static file served from this folder; add to iPhone home screen via Safari |

---

## Supabase backend

Project URL: `https://qbyuyoiiuoaeinvfiudv.supabase.co`

Three Edge Functions, all invoked via `POST`:

| Function | Purpose |
|---|---|
| `state-read` | Returns `{ daily, weekly, zone2 }` for a given `{ dayKey, weekKey }` |
| `state-write` | Upserts `{ dayKey, weekKey, daily, weekly, zone2, socialPlans }` |
| `state-history` | Returns a map of `{ dayKey → { daily, weekly, zone2 } }` for a date range |

Every request includes `x-habit-secret` in the header as a lightweight auth token (the secret is embedded in the HTML; rotate in both places if compromised).

Writes are **debounced 400 ms** — `saveState()` always writes to `localStorage` immediately, then queues a network write.

---

## State shape

```js
state = {
  dayKey:      "2026-11-01",          // YYYY-MM-DD, local time, resets at 3am
  weekKey:     "2026-10-26",          // Monday of current week
  daily:       { [habitName]: true|null, sym_neck: 1-10, sym_mood: 1-10, ... },
  weekly:      { Push: true, Pull_log: [...], Tennis_serve: true, zone2: 240, ... },
  zone2:       240,                   // cardio Zone 2 minutes this week
  socialPlans: { mon: '', tue: '', ..., sun: '' },
}
```

Day resets at **3:00 am local time** (`RESET_HOUR = 3`). Week rolls over to the Monday-keyed week at the same hour on Monday morning. `ensureFreshKeys()` is called on every load and clears stale keys automatically.

`historyMode` is a boolean that gates all writes — when browsing a past day (`viewOffset > 0`), `saveState()` is a no-op.

---

## Design system — Liquid Glass

Background: `#eef0f7` with two fixed CSS blur blobs (`blob-a` lavender, `blob-b` sky).

Glass token set:
```css
--glass-bg:     rgba(255,255,255,0.44)
--glass-border: rgba(255,255,255,0.68)
--glass-shine:  linear-gradient(135deg, …)   /* ::before pseudo-element on .glass */
--shadow:       inset top highlight + inset bottom shine + outer drop shadow
--accent:       #6366f1   (indigo)
```

The `.glass` utility class applies all three: background, border, and the `::before` shine layer. Every card, drawer, and nav pill uses it.

---

## Architecture decisions

**Single file.** No bundler, no framework, no npm. Adding a dependency means a `<script src="cdnjs…">` tag. This keeps the app trivially portable — the whole thing is one file you can AirDrop.

**Supabase anon key in source.** The key is a Supabase publishable key (safe to expose) + a custom `x-habit-secret` header checked in the Edge Function. The secret prevents random internet access but is not cryptographically sensitive. Fine for a personal app.

**localStorage as the source of truth on load.** The app renders from cache immediately, then fetches from the API and re-renders. This gives instant load with no skeleton state.

**Workout log defaults.** When a new week starts and `weekly` is cleared, `saveWorkoutDefaults()` copies last week's weight/rep anchor values to `localStorage`. `seedWorkoutDefaults()` re-applies them to the new empty weekly object so the gym drawers pre-fill with last week's numbers.

**Chart.js deferred init.** The symptom chart (`renderSymptomChart`) is intentionally not called at page load — Chart.js measures canvas dimensions on creation and gets 0×0 when the panel is `display:none`. It's called lazily on the first Symptoms tab click instead (tracked via `symChartInited` flag).

**Nav hide/show.** The floating bottom nav hides on scroll-down and reappears after a genuine 32 px upward movement. A page-bottom guard (`atBottom` check) prevents iOS momentum-scroll bounce from falsely re-triggering the show. The body has only `24px + safe-area` bottom padding (not 108px) because the nav is hidden by the time you'd reach the bottom of a long list.

**Fixed sticky bar (no layout gap).** The date sticky bar uses `position: fixed` + `transform: translateY(-100%)` when hidden rather than `position: sticky`, so it takes zero layout space when invisible. An `IntersectionObserver` on the hero header drives its visibility.

**Drawer footer pills.** Each routine drawer has a floating footer (`position: absolute` inside `position: fixed` drawer) with action buttons. A `MutationObserver` on the `.open` class resets the `footer-hidden` state when a drawer opens, avoiding the `transitionend` bubble bug that was causing page jumps.

---

## Key constants (top of `<script>`)

```js
const DAILY_HABITS = [
  "Out of bed by 7:30am", "Make bed + open window", "Supplements",
  "Skincare", "Morning mobility", "Minoxidil (AM)", "Minoxidil (PM)",
  "Neuropod", "Statin, Magnesium, CoQ10", "In bed by 11:00pm",
];
const ACTIVITY_HABITS = ['Push', 'Pull', 'Legs', 'Tennis'];
const ZONE2_GOAL    = 240;   // minutes/week — cardio ring fills at this
const ZONE2_STRETCH = 300;   // minutes/week — ring turns bright green at this
const POSTURE_GOAL  = 2;     // sessions/day
const RESET_HOUR    = 3;     // 3am local time
```

`SYMPTOM_KEYS` (just below the constants block) drives both the Symptoms panel and the 14-day chart:
```js
const SYMPTOM_KEYS = [
  { key: 'sym_neck',   label: 'Neck (1 worst, 10 best)' },
  { key: 'sym_mood',   label: 'Mood'   },
  { key: 'sym_energy', label: 'Energy' },
  { key: 'sym_focus',  label: 'Focus'  },
];
```

---

## Tabs

Three panels, driven by the `TABS` array:

| Tab ID | Panel ID | Notes |
|---|---|---|
| `tabHabits` | `panelHabits` | Default active tab |
| `tabSymptoms` | `panelSymptoms` | Badge (orange dot) when any `SYMPTOM_KEYS` entry is unset for today |
| `tabAffirmations` | `panelAffirmations` | Badge clears on first open; stored as `state.daily.affirmViewed` |

---

## Weekly activity cards

Five cards in the horizontal scroll row. Each has a 44×44 glass circle + emoji + label:

| Card | Emoji | State key | Done condition |
|---|---|---|---|
| Push | 🏋️‍♀️ | `weekly.Push` | truthy |
| Pull | 🏋️‍♀️ | `weekly.Pull` | truthy |
| Legs | 🏋️‍♀️ | `weekly.Legs` | truthy |
| Tennis | 🎾 | `weekly.Tennis` | truthy; inner rings show serve/machine sub-tasks |
| Cardio | ❤️ / ❤️‍🔥 | `state.zone2` | ≥ 240 min; SVG ring outside the circle tracks progress |

Cardio emoji switches to ❤️‍🔥 when `weekly.Intervals` is truthy.

---

## Posture program

`POSTURE_PROGRAM` is a plain array of week objects. Each entry has `week` (label) and `sections` (array of `{ title, setup, exercises }`). The drawer always renders the last entry in the array. To add a new week, push a new object to `POSTURE_PROGRAM`.

---

## Open TODOs

- **Symptom chart legend toggle bug**: toggling a series off and then switching away/back to the Symptoms tab resets all series to visible (chart is re-created, not updated). Fix: persist `symVisible` state across re-renders, or diff the existing chart instead of recreating.
- **Posture program multi-week support**: the drawer always shows the last week — there's no UI to step back through previous weeks. Could add prev/next buttons to `POSTURE_PROGRAM`.
- **No error UI for failed API writes**: `saveState()` swallows write errors silently (`console.warn`). A small transient toast on repeated failure would help diagnose connectivity issues.
- **History mode is read-only but looks live**: when `viewOffset > 0`, the UI looks identical to today and checkboxes still respond (the state just isn't saved). A subtle "history" banner or disabled overlay would reduce confusion.
- **Workout log is per-week only**: there's no way to browse previous weeks' logs. `state-history` returns the full weekly blob, so the data is there — it just needs a UI.

---

## File layout

```
Habits/
├── habit-tracker.html   ← the entire app
├── CLAUDE.md            ← this file
└── Check.png            ← apple-touch-icon for home screen
```

---

## Local development

No build step. Open `habit-tracker.html` directly in Safari or Chrome. The app reads/writes from the same Supabase project regardless of where it's opened, so edits in the browser immediately affect the live data.

To test history navigation: tap the `‹` chevron next to the date in the hero header to step back days.
