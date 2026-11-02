// ── Daily habits ─────────────────────────────────────────────
// `key` is the name stored in Supabase. The physical habit buttons write these
// exact strings and history is keyed on them — don't rename. `label` is display only.
const DAILY_HABITS = [
  { key: 'Out of bed by 7:30am',     label: 'Up by 7:30'   },
  { key: 'Make bed + open window',   label: 'Make bed'     },
  { key: 'Supplements',              label: 'Supplements'  },
  { key: 'Morning mobility',         label: 'Mobility'     },
  { key: 'Posture 1',                label: 'Posture 1'    },
  { key: 'Skincare',                 label: 'Skincare'     },
  { key: 'Minoxidil (AM)',           label: 'Minoxidil 1'  },
  { key: 'Posture 2',                label: 'Posture 2'    },
  { key: 'Minoxidil (PM)',           label: 'Minoxidil 2'  },
  { key: 'Neuropod',                 label: 'Neuropod'     },
  { key: 'Statin, Magnesium, CoQ10', label: 'Statin'       },
  { key: 'In bed by 11:00pm',        label: 'Bed by 23:00' },
];

const ZONE2_GOAL = 240;   // minutes/week — fallback if a Strava file has no goal (GOAL_MIN in scripts/fetch-strava.mjs)
const RESET_HOUR = 3;

// Strava week files written by scripts/fetch-strava.mjs. Relative, so it works on
// GitHub Pages (/Habits/) and on a local server alike.
const STRAVA_DIR = 'data/strava/';

const TABS = ['Habits', 'Push', 'Pull', 'Legs', 'Skills', 'Bike'];

// Weekly done flags live in state.weekly under these keys. The value is the
// dayKey it was marked done (weeks before the redesign stored `true`).
// Skills keeps the old 'Tennis' key so past weeks still read correctly.
const WEEKLY_KEY = { Push: 'Push', Pull: 'Pull', Legs: 'Legs', Skills: 'Tennis' };

// ── Workouts ─────────────────────────────────────────────────
// Order matters: each exercise is stored by index in weekly['<name>_log'] as
// { sets: [{ weight, reps }, …], done }. The set count comes from the target
// ("3×12" → 3). Weeks before per-set logging stored a single { weight, reps }.
const WORKOUTS = {
  Push: { title: 'Push day', exercises: [
    { name: 'Band pull-apart',             target: '2×15'     },
    { name: 'Bodyweight squat',            target: '1×10'     },
    { name: 'Bench press (barbell or DB)', target: '3×5–8'    },
    { name: 'Dips',                        target: '3×8–12'   },
    { name: 'Machine flys',                target: '3×10–12'  },
    { name: 'Tricep pulldowns',            target: '3×10–12'  },
    { name: 'Hanging knee raise',          target: '3×8–10'   },
    { name: 'Pallof press iso hold',       target: '3×10s/side', unit: 'sec' },
  ]},
  Pull: { title: 'Pull day', exercises: [
    { name: 'Dead hang',                   target: '2×30s', unit: 'sec' },
    { name: 'Glute bridge',                target: '2×12'     },
    { name: 'Seated row',                  target: '3×8–12'   },
    { name: 'Neutral-grip lat pulldown',   target: '3×8–12'   },
    { name: 'Preacher curls',              target: '3×10–12'  },
    { name: 'Incline DB curl',             target: '3×10–12'  },
    { name: 'Reverse pec deck',            target: '3×12–15'  },
    { name: 'Cable chop / med ball throw', target: '3×10/side' },
    { name: 'Side plank / suitcase carry', target: '3×8–12/side' },
  ]},
  Legs: { title: 'Leg day', exercises: [
    { name: 'Goblet squat',                target: '3×10–12'  },
    { name: 'Bulgarian split squat',       target: '3×8/side' },
    { name: 'Dumbbell step-up',            target: '3×10/side' },
    { name: 'Sumo deadlift',               target: '3×10–12'  },
    { name: 'Elevated reverse lunge',      target: '3×10/side' },
  ]},
};

// ── Routines ([name, detail] pairs) ──────────────────────────
const SKILLS_SECTIONS = [
  { id: 'warmup', title: 'Warm up', items: [
    ['Glute bridge with hip abduction',       'x10'],
    ['Standing band lateral walk',            'x10'],
    ['Half-kneeling thoracic rotation',       'x8'],
    ['Ankle circles + single-leg calf raise', '30s + x5'],
    ['Easy jog',                              ''],
    ['Lateral shuffles',                      'x4'],
    ['Split step jumps',                      'x10'],
    ['Arm swings',                            'x10'],
    ['Mini tennis',                           '10 mins'],
  ]},
  { id: 'affirm', title: 'Affirmations', items: [
    ['I visualize myself as worthy and successful and give myself permission to win.'],
    ['I see competition as a challenge to rise to, not a threat to back down from.'],
    ['I will concentrate on what I can control and focus on quality “at-bats”.'],
    ['I play to win, not to avoid losing.'],
    ['I am prepared. My body knows what to do.'],
    ['I will get myself to the right emotional state and stress/arousal level.'],
    ['I breathe in energy, I breathe out stress and negativity.'],
    ['If I start to think negative thoughts, I try to think less.'],
    ['I am a champion. I move on fast.'],
    ['I am brave until the last point.'],
  ]},
  { id: 'cooldown', title: 'Cool down', items: [
    ['Easy walk',                            '2–3 lengths'],
    ['Cross-body posterior shoulder stretch', '45s'],
    ['Doorway or wall chest opener',         '30s'],
    ['Wrist flexor & extensor stretch',      '30s'],
    ['Figure-4 against a wall',              '1 min'],
    ['Side lunge',                           '1 min'],
    ['Kneeling hip flexor stretch',          '1 min'],
    ['Passive windshield wiper',             '1 min'],
    ['Standing hamstring stretch',           '1 min'],
    ['Wall ankle dorsiflexion',              '1 min'],
  ]},
];

const BIKE_SECTIONS = [
  { id: 'warmup', title: 'Warm up', items: [
    ['Glute bridge holds',                'x10'],
    ['Clamshells with band',              'x15'],
    ['Kneeling hip flexor pulse stretch', 'x10'],
    ['Thoracic rotations',                'x5'],
    ['Ankle circles',                     '30s'],
    ['Calf raises',                       '30s'],
  ]},
  { id: 'cooldown', title: 'Cool down', items: [
    ['Standing hip flexor stretch',       '30s'],
    ['Figure-4 stretch',                  '1 min'],
    ['Single-leg hamstring stretch',      '1 min'],
    ["Child's pose with lateral reach",   '1 min'],
    ['Wall ankle dorsiflexion stretch',   '1 min'],
    ['Bolster chest opener',              '3 mins'],
  ]},
];

// ── Supabase ─────────────────────────────────────────────────
const SUPABASE_URL      = 'https://qbyuyoiiuoaeinvfiudv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h9lE4du-71hsCRzxnICHyQ__GG2pE_m';
const APP_SECRET        = '7265d62639a9ec3e37c5c3a2ac7e0e193aba9c00128efd719c59a78aebe2091e';

const apiHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'x-habit-secret': APP_SECRET,
});

async function apiRead(dayKey, weekKey) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/state-read`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ dayKey, weekKey }),
  });
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  return res.json();
}

async function apiWrite(payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/state-write`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`write failed: ${res.status}`);
  return res.json();
}

async function apiHistory(fromDay, toDay) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/state-history`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ fromDay, toDay }),
  });
  if (!res.ok) throw new Error(`history failed: ${res.status}`);
  return res.json();
}

function cacheLocal(s) {
  try { localStorage.setItem('habitState', JSON.stringify(s)); } catch {}
}
function readLocalCache() {
  try { return JSON.parse(localStorage.getItem('habitState') || 'null'); }
  catch { return null; }
}
function cacheHistory(h) {
  try { localStorage.setItem('habitHistory', JSON.stringify(h)); } catch {}
}
function readHistoryCache() {
  try { return JSON.parse(localStorage.getItem('habitHistory') || 'null'); }
  catch { return null; }
}

// ── Workout log defaults (carry last week's weights/reps into the new week) ──
const WORKOUT_NAMES = Object.keys(WORKOUTS);

// True if a log entry (either format) has any weight or reps recorded.
const entryHasData = e => !!e && (e.weight != null || e.reps != null ||
  (e.sets || []).some(s => s && (s.weight != null || s.reps != null)));

function saveWorkoutDefaults(weekly) {
  if (!weekly) return;
  const defaults = {};
  WORKOUT_NAMES.forEach(name => {
    const log = weekly[name + '_log'];
    if (log && log.some(entryHasData)) defaults[name + '_log'] = log;
  });
  if (Object.keys(defaults).length > 0)
    try { localStorage.setItem('workoutDefaults', JSON.stringify(defaults)); } catch {}
}

function readWorkoutDefaults() {
  try { return JSON.parse(localStorage.getItem('workoutDefaults') || 'null'); }
  catch { return null; }
}

// Seed weekly with last week's logs — only for workouts that have no data yet this week
function seedWorkoutDefaults(weekly) {
  const defaults = readWorkoutDefaults();
  if (!defaults) return;
  WORKOUT_NAMES.forEach(name => {
    const key     = name + '_log';
    const hasData = weekly[key] && weekly[key].some(entryHasData);
    // Carry the numbers, not last week's checkmarks
    if (!hasData && defaults[key]) weekly[key] = defaults[key].map(e => e && { ...e, done: false });
  });
}

// ── Saving ───────────────────────────────────────────────────
const EMPTY_SOCIAL = () => ({ mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' });

// socialPlans has no UI any more, but state-write blanks it if omitted — always pass it through.
const livePayload = () => ({
  dayKey:      state.dayKey,
  weekKey:     state.weekKey,
  daily:       state.daily,
  weekly:      state.weekly,
  zone2:       state.zone2,
  socialPlans: state.socialPlans,
});

let saveTimer = null;
function saveState() {
  saveWorkoutDefaults(state.weekly); // keep defaults current for the upcoming week rollover
  cacheLocal(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    apiWrite(livePayload()).catch(err => console.warn('habit save failed', err));
  }, 400);
}

// Send a pending debounced write before the page goes away (iOS rarely fires beforeunload).
function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  fetch(`${SUPABASE_URL}/functions/v1/state-write`, {
    method: 'POST',
    keepalive: true,
    headers: apiHeaders(),
    body: JSON.stringify(livePayload()),
  });
}

// ── Keys & date helpers ──────────────────────────────────────
function localDateStr(d) {
  // Use local date parts — toISOString() always returns UTC and produces
  // wrong day keys for timezones behind UTC (e.g. EDT = UTC-4).
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function getDayKey(d = new Date()) {
  const adj = new Date(d.getTime());
  if (adj.getHours() < RESET_HOUR) adj.setDate(adj.getDate() - 1);
  return localDateStr(adj);
}

function getWeekKey(d = new Date()) {
  const adj = new Date(d.getTime());
  if (adj.getHours() < RESET_HOUR) adj.setDate(adj.getDate() - 1);
  const day = adj.getDay();
  const monday = new Date(adj);
  monday.setDate(adj.getDate() - ((day + 6) % 7));
  return localDateStr(monday);
}

function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // noon avoids DST edge cases
}

function addDays(key, n) {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// "Nov 1" (chip CSS uppercases it); adds the year when it isn't this year: "Nov 1, 2025"
const chipDate  = key => {
  const d = parseDayKey(key);
  const label = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label}, ${d.getFullYear()}`;
};
const tabDate   = key => { const [, m, d] = key.split('-');  return `${d}.${m}`; };               // 01.11
const longDate  = key => { const d = parseDayKey(key); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };

function ensureFreshKeys(s) {
  s = s || {};
  const dayKey  = getDayKey();
  const weekKey = getWeekKey();
  if (s.dayKey  !== dayKey)  { s.dayKey  = dayKey;  s.daily  = {}; }
  if (s.weekKey !== weekKey) {
    saveWorkoutDefaults(s.weekly); // capture last week's logs before clearing
    s.weekKey     = weekKey;
    s.weekly      = {};
    s.zone2       = 0;
    s.socialPlans = EMPTY_SOCIAL();
    seedWorkoutDefaults(s.weekly); // seed new week with last week's anchor values
  }
  s.daily       = s.daily  || {};
  s.weekly      = s.weekly || {};
  s.zone2       = s.zone2  || 0;
  s.socialPlans = { ...EMPTY_SOCIAL(), ...(s.socialPlans || {}) };
  return s;
}

let state        = ensureFreshKeys(readLocalCache());
let habitHistory = readHistoryCache() || {};   // dayKey → daily

// ── Habit completion ─────────────────────────────────────────
function isHabitDone(daily, key) {
  // Posture used to be one counter ('Posture program': 0–2). Days before the
  // split have no 'Posture 1'/'Posture 2' booleans, so fall back to the count.
  if ((key === 'Posture 1' || key === 'Posture 2') && typeof daily[key] !== 'boolean') {
    const count = typeof daily['Posture program'] === 'number' ? daily['Posture program'] : 0;
    return count >= (key === 'Posture 1' ? 1 : 2);
  }
  return !!daily[key];
}

const countDone = daily => DAILY_HABITS.filter(h => isHabitDone(daily, h.key)).length;

// ── View state ───────────────────────────────────────────────
let page          = 'Habits';  // a TABS entry, or 'History'
let viewDay       = null;      // past day open on Habits: { dayKey, weekKey, daily, weekly, zone2, socialPlans, loaded }
let skillsSection = 'warmup';
let bikeSection   = 'warmup';
let historyDays   = 14;        // rows shown on History
let historyFrom   = null;      // earliest dayKey fetched into habitHistory

const $ = id => document.getElementById(id);

const CHECK_SVG = `<svg class="check" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,12.5 9.5,18 20,6.5"/></svg>`;

function go(p) {
  // Leaving a workout with every exercise checked off counts as done for the week
  if (page in WORKOUTS && p !== page && !state.weekly[page] &&
      WORKOUTS[page].exercises.every((_, i) => exerciseEntry(page, i).done)) {
    state.weekly[page] = state.dayKey;
    saveState();
  }
  // Entering the Bike section: pick up anything the hourly workflow committed
  if ((p === 'Bike' || p === 'BikeHistory') && page !== 'Bike' && page !== 'BikeHistory') refreshStrava();
  if (p === 'BikeHistory') loadBikeHistory();
  page = p;
  window.scrollTo(0, 0);
  render();
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Strava week data ─────────────────────────────────────────
let stravaIndexState = 'loading';  // index.json: 'loading' | 'ok' | 'error'
let stravaIndexed    = new Set();  // week keys index.json lists (i.e. a file exists)
let stravaWeek       = null;       // week shown on the Bike page
let bikeHistoryCount = 8;          // rows shown on Bike history
const stravaData     = {};         // weekKey → { status: 'loading' | 'ok' | 'error', data }

// Monday of this week at 00:00 local — the boundary fetch-strava.mjs uses
// (not the app's 3am RESET_HOUR).
function currentStravaWeek() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return localDateStr(d);
}

function readStravaCache() {
  try { return JSON.parse(localStorage.getItem('stravaWeek') || 'null'); }
  catch { return null; }
}

async function loadStravaJson(file) {
  const res = await fetch(STRAVA_DIR + file, { cache: 'no-cache' }); // revalidate; Pages caches ~10 min
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

async function loadStravaWeek(key, force = false) {
  const entry = stravaData[key];
  if (entry && entry.status !== 'error' && !force) return;
  if (stravaIndexState !== 'ok') return; // can't tell an empty week from a missing file yet
  if (!stravaIndexed.has(key)) {
    stravaData[key] = { status: 'ok', data: null }; // no file yet (e.g. Monday before the first run) — empty week
    render();
    return;
  }
  if (!entry || entry.status === 'error') { stravaData[key] = { status: 'loading' }; render(); }
  try {
    const data = await loadStravaJson(`${key}.json`);
    stravaData[key] = { status: 'ok', data };
    if (key === currentStravaWeek())
      try { localStorage.setItem('stravaWeek', JSON.stringify({ key, data })); } catch {}
  } catch (e) {
    console.warn('strava week load failed', e);
    if (stravaData[key]?.status !== 'ok') stravaData[key] = { status: 'error' }; // keep stale data over an error
  }
  render();
}

async function refreshStrava() {
  const current = currentStravaWeek();
  if (!stravaWeek) stravaWeek = current;
  try {
    const index = await loadStravaJson('index.json');
    stravaIndexed    = new Set(index.weeks || []);
    stravaIndexState = 'ok';
  } catch (e) {
    console.warn('strava index load failed', e);
    if (stravaIndexState !== 'ok') { // never loaded — nothing to fall back on
      stravaIndexState = 'error';
      [current, stravaWeek].forEach(k => { if (stravaData[k]?.status !== 'ok') stravaData[k] = { status: 'error' }; });
      render();
      return;
    }
  }
  render();
  await Promise.all([...new Set([current, stravaWeek])].map(k => loadStravaWeek(k, true)));
  if (page === 'BikeHistory') loadBikeHistory();
}

// Every week from this one back to the oldest file, newest first. Weeks in
// between with no file had no rides.
function bikeHistoryWeeks() {
  const current = currentStravaWeek();
  const oldest  = [...stravaIndexed].sort()[0] || current;
  const weeks   = [];
  for (let k = current; k >= oldest; k = addDays(k, -7)) weeks.push(k);
  return weeks;
}

function loadBikeHistory() {
  bikeHistoryWeeks().slice(0, bikeHistoryCount).forEach(k => loadStravaWeek(k));
}

function openStravaWeek(key) {
  stravaWeek = key;
  loadStravaWeek(key);
  go('Bike');
}

// ── Render ───────────────────────────────────────────────────
function render() {
  state = ensureFreshKeys(state);
  if (viewDay && viewDay.dayKey === state.dayKey) viewDay = null;

  const pageId = page === 'History' ? 'pageHistory'
               : page in WORKOUTS   ? 'pageWorkout'
               : 'page' + page;
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== pageId; });

  renderNav();
  if (page === 'Habits')       renderHabits();
  else if (page === 'History') renderHistory();
  else if (page in WORKOUTS)   renderWorkout(page);
  else if (page === 'Skills')  renderSections('skills', SKILLS_SECTIONS, skillsSection);
  else if (page === 'Bike')    renderBike();
  else if (page === 'BikeHistory') renderBikeHistory();
  renderFooter();
}

const progressBar = (pct, cls = '') =>
  `<span class="nav-bar ${cls}"><span class="nav-bar-fill" style="width:${Math.round(pct * 100)}%"></span></span>`;

// Weekly Zone 2 progress from a Strava week file (null = no rides yet).
// Capped at the goal: no over-goal display (the Time stat shows the real total).
function stravaGoal(data) {
  const goalMin = data?.goal?.goalMin || ZONE2_GOAL;
  const doneMin = Math.min(Math.floor((data?.totals?.movingTimeSec || 0) / 60), goalMin);
  return { goalMin, doneMin, pct: doneMin / goalMin, complete: doneMin >= goalMin };
}

function renderNav() {
  $('topNav').innerHTML = TABS.map(tab => {
    const active = page === tab || (tab === 'Habits' && page === 'History') || (tab === 'Bike' && page === 'BikeHistory');
    let foot, done = false;
    if (tab === 'Habits') {
      foot = progressBar(countDone(state.daily) / DAILY_HABITS.length);
    } else if (tab === 'Bike') {
      const g = stravaGoal(stravaData[currentStravaWeek()]?.data);
      foot = progressBar(g.pct, `goal${g.complete ? ' complete' : ''}`);
    } else {
      const v = state.weekly[WEEKLY_KEY[tab]];
      done = !!v;
      foot = `<span class="nav-date">${typeof v === 'string' ? tabDate(v) : ''}</span><span class="nav-dot"></span>`;
    }
    return `<button class="nav-tab${active ? ' active' : ''}${done ? ' done' : ''}" data-tab="${tab}">
      <span class="nav-label">${tab}</span><span class="nav-foot">${foot}</span>
    </button>`;
  }).join('');
}

function renderHabits() {
  const day   = viewDay || state;
  const done  = countDone(day.daily);
  $('habitsCount').textContent = `${done}/${DAILY_HABITS.length}`;
  $('dateChip').textContent    = chipDate(day.dayKey);
  const list = $('habitList');
  list.classList.toggle('loading', !!viewDay && !viewDay.loaded);
  list.classList.toggle('all-done', done === DAILY_HABITS.length);
  list.innerHTML = DAILY_HABITS.map(({ key, label }, i) => {
    const isDone = isHabitDone(day.daily, key);
    return `<div class="row habit-row${isDone ? ' done' : ''}" role="button" data-i="${i}">
      <span class="row-label">${label}</span>${isDone ? CHECK_SVG : ''}
    </div>`;
  }).join('');
}

function renderHistory() {
  let html = '';
  let key  = state.dayKey;
  for (let i = 0; i < historyDays; i++) {
    const daily = key === state.dayKey ? state.daily : (habitHistory[key] || {});
    const done  = countDone(daily);
    html += `<div class="row history-row" role="button" data-day="${key}">
      <span class="row-label">${longDate(key)}</span>
      <span class="history-right">
        <span class="history-count">${done}/${DAILY_HABITS.length}</span>
        <span class="dot${done === DAILY_HABITS.length ? ' on' : ''}"></span>
      </span>
    </div>`;
    key = addDays(key, -1);
  }
  $('historyList').innerHTML = html;
}

// ── Workout log ──────────────────────────────────────────────
const activeExercise = {};   // workout name → index of the expanded exercise (null = none)

const setCount = ex => parseInt(ex.target, 10) || 3;

// One exercise's log, normalized to { sets: [n × { weight, reps }], done }.
function exerciseEntry(name, i) {
  const raw    = state.weekly[name + '_log']?.[i] || {};
  const legacy = { weight: raw.weight ?? null, reps: raw.reps ?? null }; // pre-per-set: same numbers every set
  const sets   = Array.from({ length: setCount(WORKOUTS[name].exercises[i]) }, (_, s) => {
    const src = raw.sets ? (raw.sets[s] || {}) : legacy;
    return { weight: src.weight ?? null, reps: src.reps ?? null };
  });
  return { sets, done: !!raw.done };
}

function updateExercise(name, i, fn) {
  const key = name + '_log';
  const log = state.weekly[key] = state.weekly[key] || [];
  for (let j = 0; j < i; j++) log[j] = log[j] ?? null;
  const entry = exerciseEntry(name, i);
  fn(entry);
  log[i] = entry;
  saveState();
}

// The expanded exercise: the one last opened, else the first not yet done.
function currentExercise(name) {
  if (name in activeExercise) return activeExercise[name];
  const i = WORKOUTS[name].exercises.findIndex((_, j) => !exerciseEntry(name, j).done);
  return i === -1 ? null : i;
}

// Next not-done exercise after i, wrapping around; null if all done.
function nextOpenExercise(name, i) {
  const n = WORKOUTS[name].exercises.length;
  for (let k = 1; k < n; k++) {
    const j = (i + k) % n;
    if (!exerciseEntry(name, j).done) return j;
  }
  return null;
}

const PENCIL_SVG = `<svg class="pencil" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/></svg>`;

function setCell(i, s, field, v, unit) {
  const val = v == null ? '' : String(v);
  return `<label class="set-cell">
    <input class="set-input" type="text" inputmode="${field === 'weight' ? 'decimal' : 'numeric'}"
      ${field === 'weight' ? '' : 'pattern="[0-9]*"'} autocomplete="off" placeholder="—"
      data-ex="${i}" data-set="${s}" data-field="${field}" value="${val}"
      style="width:${Math.max(val.length, 1)}ch" aria-label="Set ${s + 1} ${field}">
    <span class="set-unit">${unit}</span>${PENCIL_SVG}
  </label>`;
}

function renderWorkout(name) {
  const doneForWeek = !!state.weekly[WEEKLY_KEY[name]];
  $('workoutTitle').textContent    = WORKOUTS[name].title;
  $('workoutDoneChip').textContent = doneForWeek ? 'Undo' : 'Done';

  // Don't rebuild under the keyboard (the minute timer and Strava fetches also render)
  if ($('workoutList').contains(document.activeElement)) return;

  const active = currentExercise(name);
  $('workoutList').innerHTML = WORKOUTS[name].exercises.map((ex, i) => {
    const entry = exerciseEntry(name, i);
    if (entry.done) {
      return `<div class="row ex-row done" role="button" data-ex-row="${i}">
        <span class="row-label">${ex.name}</span>${CHECK_SVG}
      </div>`;
    }
    const head = `<div class="row ex-row" role="button" data-ex-row="${i}">
      <span class="row-label">${ex.name}</span><span class="row-meta">${ex.target}</span>
    </div>`;
    if (i !== active) return head;
    return head + entry.sets.map((set, s) => `<div class="set-row">
      ${setCell(i, s, 'weight', set.weight, 'lbs')}
      ${setCell(i, s, 'reps', set.reps, ex.unit || 'reps')}
    </div>`).join('');
  }).join('');
}

// Warm-up / cool-down checkmarks live in state.daily (they reset at 3am, so
// each session starts fresh) as { [itemName]: true } under e.g. 'skills_warmup'.
// Affirmations are read-only.
const routineKey  = (prefix, sectionId) => `${prefix}_${sectionId}`;
const isCheckable = sectionId => sectionId !== 'affirm';

function renderSections(prefix, sections, activeId) {
  $(prefix + 'Subnav').innerHTML = sections.map(s =>
    `<button class="subnav-btn${s.id === activeId ? ' active' : ''}" data-section="${s.id}">${s.title}</button>`
  ).join('');
  const section = sections.find(s => s.id === activeId);
  const checks  = state.daily[routineKey(prefix, section.id)] || {};
  $(prefix + 'List').innerHTML = section.items.map(([name, detail], i) => {
    if (!isCheckable(section.id))
      return `<div class="row"><span class="row-label">${name}</span>${detail ? `<span class="row-meta">${detail}</span>` : ''}</div>`;
    return checks[name]
      ? `<div class="row ex-row done" role="button" data-item="${i}"><span class="row-label">${name}</span>${CHECK_SVG}</div>`
      : `<div class="row ex-row" role="button" data-item="${i}"><span class="row-label">${name}</span>${detail ? `<span class="row-meta">${detail}</span>` : ''}</div>`;
  }).join('');
}

function toggleRoutineItem(prefix, sections, sectionId, i) {
  const name   = sections.find(s => s.id === sectionId).items[i][0];
  const key    = routineKey(prefix, sectionId);
  const checks = state.daily[key] = { ...(state.daily[key] || {}) };
  if (checks[name]) delete checks[name]; else checks[name] = true;
  saveState();
  render();
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// "Oct 12–18", "Sep 28–Oct 4"; adds the year when it isn't this year.
function weekRange(key) {
  const start = parseDayKey(key);
  const end   = parseDayKey(addDays(key, 6));
  const sm    = SHORT_MONTHS[start.getMonth()];
  const em    = SHORT_MONTHS[end.getMonth()];
  const range = sm === em ? `${sm} ${start.getDate()}–${end.getDate()}` : `${sm} ${start.getDate()}–${em} ${end.getDate()}`;
  return end.getFullYear() !== new Date().getFullYear() ? `${range}, ${end.getFullYear()}` : range;
}

function formatUpdated(iso) {
  const d    = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return localDateStr(d) === localDateStr(new Date()) ? time : `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
}

// "Today", "Yesterday", otherwise the weekday ("Monday") — the week is already in the chip.
function rideDay(iso) {
  const key = localDateStr(new Date(iso));
  const today = localDateStr(new Date());
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

const hmm  = sec =>`${Math.floor(sec / 3600)}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}`;
const km   = n => `${(n || 0).toFixed(1)} km`;
const metres = n => `${Math.round(n || 0).toLocaleString('en-US')} m`;

function renderBike() {
  const key   = stravaWeek || currentStravaWeek();
  const entry = stravaData[key] || { status: 'loading' };
  const data  = entry.data;

  $('weekChip').textContent = weekRange(key);

  const body = $('weekBody');
  if (entry.status === 'loading') {
    body.innerHTML = `<div class="list section-gap"><div class="row state-row"><span class="row-label">Loading rides…</span></div></div>`;
  } else if (entry.status === 'error') {
    body.innerHTML = `<div class="list section-gap"><div class="row state-row">
      <span class="row-label">Couldn't load ride data</span>
      <button class="text-btn" id="stravaRetry">Try again</button>
    </div></div>`;
  } else {
    const totals = data?.totals || { movingTimeSec: 0, distanceKm: 0, elevationM: 0 };
    const rides  = data?.rides  || [];
    const g      = stravaGoal(data);
    body.innerHTML = `
      <div class="list gap-sm stats">
        <div class="stat"><span class="row-label">Time</span><span class="stat-value">${hmm(totals.movingTimeSec)}</span></div>
        <div class="stat"><span class="row-label">Distance</span><span class="stat-value">${km(totals.distanceKm)}</span></div>
        <div class="stat"><span class="row-label">Elevation</span><span class="stat-value">${metres(totals.elevationM)}</span></div>
      </div>
      <div class="list section-gap">
        <div class="ex">
          <div class="ex-head"><span class="row-label">Weekly volume</span><span class="row-meta">${g.doneMin} / ${g.goalMin} min</span></div>
          <div class="goal-bar${g.complete ? ' complete' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${g.goalMin}" aria-valuenow="${g.doneMin}">
            <span class="goal-bar-fill" style="width:${Math.round(g.pct * 100)}%"></span>
          </div>
        </div>
      </div>
      <h2 class="section-title">Rides</h2>
      <div class="list">
        ${rides.map(r => {
          // Whole row links to the activity (Strava's guidelines ask for a link back)
          const day = rideDay(r.startDate), dist = km(r.distanceKm), min = `${Math.floor(r.movingTimeSec / 60)} min`;
          return `<a class="row ride-row" href="https://www.strava.com/activities/${Number(r.id)}" target="_blank" rel="noopener"
              aria-label="View on Strava: ${esc(day)}, ${dist}, ${min}">
            <span class="row-label">${day} · ${dist}</span>
            <span class="row-meta">${min}</span>
          </a>`;
        }).join('') || `<div class="row state-row"><span class="row-label">No rides this week</span></div>`}
      </div>
      <div class="updated-note">${data?.generatedAt ? `Updated ${formatUpdated(data.generatedAt)}` : ''}</div>`;
  }

  renderSections('bike', BIKE_SECTIONS, bikeSection);
}

function renderBikeHistory() {
  const list  = $('bikeHistoryList');
  const weeks = bikeHistoryWeeks();
  $('bikeHistoryMore').hidden = stravaIndexState !== 'ok' || bikeHistoryCount >= weeks.length;

  if (stravaIndexState === 'loading') {
    list.innerHTML = `<div class="row state-row"><span class="row-label">Loading rides…</span></div>`;
    return;
  }
  if (stravaIndexState === 'error') {
    list.innerHTML = `<div class="row state-row">
      <span class="row-label">Couldn't load ride data</span>
      <button class="text-btn" id="bikeHistoryRetry">Try again</button>
    </div>`;
    return;
  }

  list.innerHTML = weeks.slice(0, bikeHistoryCount).map(key => {
    const entry = stravaData[key];
    let vals = ['—', '—', '—'], complete = false;
    if (entry?.status === 'ok') {
      // Real minutes here, not capped like the progress bar
      const min  = Math.floor((entry.data?.totals?.movingTimeSec || 0) / 60);
      const goal = entry.data?.goal?.goalMin || ZONE2_GOAL;
      vals = [metres(entry.data?.totals?.elevationM), km(entry.data?.totals?.distanceKm), `${min}/${goal}`];
      complete = min >= goal;
    }
    return `<div class="row history-row" role="button" data-week="${key}">
      <span class="row-label">${weekRange(key)}</span>
      <span class="history-right">
        <span class="history-count week-vals">${vals.map(v => `<span>${v}</span>`).join('')}</span>
        <span class="dot${complete ? ' on' : ''}"></span>
      </span>
    </div>`;
  }).join('');
}

function renderFooter() {
  const btn = $('footerBtn');
  let label = null, danger = false;
  if (page === 'Skills') {   // workouts use the Done chip instead
    danger = !!state.weekly[WEEKLY_KEY[page]];
    label  = danger ? 'Mark as incomplete' : 'Mark as done';
  }
  $('footer').hidden = label === null;
  document.body.classList.toggle('has-footer', label !== null);
  if (label === null) return;
  btn.textContent = label;
  btn.classList.toggle('danger', danger);
}

// ── Actions ──────────────────────────────────────────────────
function toggleHabit(key) {
  if (viewDay) {
    if (!viewDay.loaded) return; // never write a past day we haven't read in full
    viewDay.daily[key] = !isHabitDone(viewDay.daily, key);
    saveViewDay();
  } else {
    state.daily[key] = !isHabitDone(state.daily, key);
    saveState();
  }
  render();
}

// Writes go straight out (no debounce) so switching days can't drop a pending write.
function saveViewDay() {
  const v = viewDay;
  habitHistory[v.dayKey] = v.daily;
  cacheHistory(habitHistory);
  // Same week as today: send the live weekly data so this write can't roll it back.
  const live = v.weekKey === state.weekKey ? state : v;
  apiWrite({
    dayKey:      v.dayKey,
    weekKey:     v.weekKey,
    daily:       v.daily,
    weekly:      live.weekly,
    zone2:       live.zone2,
    socialPlans: live.socialPlans,
  }).catch(err => console.warn('past day save failed', err));
}

async function openDay(dayKey) {
  if (dayKey === state.dayKey) { viewDay = null; go('Habits'); return; }
  const weekKey = getWeekKey(parseDayKey(dayKey));
  const v = viewDay = { dayKey, weekKey, daily: { ...(habitHistory[dayKey] || {}) }, loaded: false };
  go('Habits');
  try {
    const remote = await apiRead(dayKey, weekKey);
    if (viewDay !== v) return; // user moved on
    Object.assign(v, {
      daily:       remote.daily  || {},
      weekly:      remote.weekly || {},
      zone2:       remote.zone2  || 0,
      socialPlans: remote.socialPlans || EMPTY_SOCIAL(),
      loaded:      true,
    });
  } catch (e) {
    console.warn('day fetch failed', e); // stays read-only (loaded: false)
  }
  render();
}

async function loadMoreHistory() {
  historyDays += 14;
  render();
  const oldest = addDays(state.dayKey, -(historyDays - 1));
  if (historyFrom && oldest >= historyFrom) return;
  const to = historyFrom ? addDays(historyFrom, -1) : state.dayKey;
  try {
    const { rows } = await apiHistory(oldest, to);
    (rows || []).forEach(r => { habitHistory[r.day_key] = r.daily || {}; });
    historyFrom = oldest;
    cacheHistory(habitHistory);
    if (page === 'History') render();
  } catch (e) {
    console.warn('history fetch failed', e);
  }
}

// Tapping an exercise row: the open one → complete it and open the next;
// a done one → reopen it; any other → jump to it.
function tapExercise(name, i) {
  if ($('workoutList').contains(document.activeElement)) document.activeElement.blur(); // close the keyboard so the list can redraw
  const entry = exerciseEntry(name, i);
  if (entry.done) {
    updateExercise(name, i, e => { e.done = false; });
    activeExercise[name] = i;
  } else if (currentExercise(name) === i) {
    updateExercise(name, i, e => { e.done = true; });
    activeExercise[name] = nextOpenExercise(name, i);
  } else {
    activeExercise[name] = i;
  }
  render();
}

function setValue(input) {
  const field = input.dataset.field;
  const raw   = input.value.replace(',', '.').replace(field === 'weight' ? /[^0-9.]/g : /[^0-9]/g, '');
  const num   = raw === '' || raw === '.' ? null : Number(raw);
  updateExercise(page, Number(input.dataset.ex), e => {
    e.sets[Number(input.dataset.set)][field] = Number.isFinite(num) ? num : null;
  });
  input.style.width = `${Math.max(input.value.length, 1)}ch`;
}

function toggleWeeklyDone() {
  const key = WEEKLY_KEY[page];
  state.weekly[key] = state.weekly[key] ? false : state.dayKey;
  saveState();
  render();
}

// ── Boot ─────────────────────────────────────────────────────
// Last-seen Strava week from cache so the Bike bar is right before the fetch lands.
{
  const cached = readStravaCache();
  if (cached?.key === currentStravaWeek()) stravaData[cached.key] = { status: 'ok', data: cached.data };
}
render();
refreshStrava();

// Hydrate from API + load 60 days of history for the History page
(async () => {
  const today   = getDayKey();
  const fromDay = addDays(today, -60);

  const [stateResult, historyResult] = await Promise.allSettled([
    apiRead(today, getWeekKey()),
    apiHistory(fromDay, today),
  ]);

  if (stateResult.status === 'fulfilled') {
    const remote = stateResult.value;
    state = ensureFreshKeys({
      dayKey:      remote.dayKey,
      weekKey:     remote.weekKey,
      daily:       remote.daily,
      weekly:      remote.weekly,
      zone2:       remote.zone2,
      socialPlans: remote.socialPlans,
    });
    seedWorkoutDefaults(state.weekly); // re-apply if API returned an empty new week
    cacheLocal(state);
  } else {
    console.warn('initial habit fetch failed', stateResult.reason);
  }

  if (historyResult.status === 'fulfilled') {
    habitHistory = {};
    (historyResult.value.rows || []).forEach(r => { habitHistory[r.day_key] = r.daily || {}; });
    historyFrom = fromDay;
    cacheHistory(habitHistory);
  } else {
    console.warn('history fetch failed', historyResult.reason);
  }

  render();
})();

// ── Event listeners ──────────────────────────────────────────
$('topNav').addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (!tab) return;
  if (tab === 'Habits') viewDay = null;                  // the Habits tab always means today…
  if (tab === 'Bike') stravaWeek = currentStravaWeek();  // …and Bike always means this week
  go(tab);
});

$('habitList').addEventListener('click', e => {
  const row = e.target.closest('[data-i]');
  if (row) toggleHabit(DAILY_HABITS[row.dataset.i].key);
});

$('dateChip').addEventListener('click', () => go('History'));
$('historyBackChip').addEventListener('click', () => go('Habits'));
$('historyMore').addEventListener('click', loadMoreHistory);
$('historyList').addEventListener('click', e => {
  const row = e.target.closest('[data-day]');
  if (row) openDay(row.dataset.day);
});

$('workoutList').addEventListener('click', e => {
  const row = e.target.closest('[data-ex-row]');
  if (row) tapExercise(page, Number(row.dataset.exRow));
});
$('workoutList').addEventListener('input', e => {
  if (e.target.matches('.set-input')) setValue(e.target);
});
// Select the value on focus so typing replaces it
$('workoutList').addEventListener('focusin', e => {
  if (e.target.matches('.set-input')) e.target.select();
});
$('workoutDoneChip').addEventListener('click', toggleWeeklyDone);

$('skillsSubnav').addEventListener('click', e => {
  const id = e.target.closest('[data-section]')?.dataset.section;
  if (id) { skillsSection = id; render(); }
});
$('bikeSubnav').addEventListener('click', e => {
  const id = e.target.closest('[data-section]')?.dataset.section;
  if (id) { bikeSection = id; render(); }
});
$('skillsList').addEventListener('click', e => {
  const row = e.target.closest('[data-item]');
  if (row) toggleRoutineItem('skills', SKILLS_SECTIONS, skillsSection, Number(row.dataset.item));
});
$('bikeList').addEventListener('click', e => {
  const row = e.target.closest('[data-item]');
  if (row) toggleRoutineItem('bike', BIKE_SECTIONS, bikeSection, Number(row.dataset.item));
});

$('weekChip').addEventListener('click', () => go('BikeHistory'));
$('bikeHistoryBackChip').addEventListener('click', () => go('Bike'));
$('bikeHistoryMore').addEventListener('click', () => {
  bikeHistoryCount += 8;
  loadBikeHistory();
  render();
});
$('bikeHistoryList').addEventListener('click', e => {
  if (e.target.closest('#bikeHistoryRetry')) { refreshStrava(); return; }
  const row = e.target.closest('[data-week]');
  if (row) openStravaWeek(row.dataset.week);
});
$('weekBody').addEventListener('click', e => {
  if (e.target.closest('#stravaRetry')) refreshStrava();
});

$('footerBtn').addEventListener('click', toggleWeeklyDone);

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// Re-render each minute so the 3am rollover happens without a reload
setInterval(render, 60000);
