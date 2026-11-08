"use strict";

/* Afterimage — a visual perception gauntlet.
 *
 * The puzzle exists only as pixels. Canvas paints the grid; the DOM carries
 * neutral hit areas labelled "Row N, column M", so the odd tile cannot be
 * recovered from markup, classes, or data attributes. A vision model has to
 * look at the board and click what it sees.
 */

const SCRIPTS = {
  classic: [
    { type: "hue",    n: 3, delta: 30, time: 15 },
    { type: "light",  n: 3, delta: 13, time: 15 },
    { type: "hue",    n: 4, delta: 23, time: 14 },
    { type: "sat",    n: 4, delta: 26, time: 14, surge: true },
    { type: "rotate", n: 4, delta: 30, time: 16 },
    { type: "light",  n: 5, delta: 9,  time: 16 },
    { type: "size",   n: 5, delta: 15, time: 16 },
    { type: "hue",    n: 6, delta: 15, time: 18, surge: true },
    { type: "rotate", n: 6, delta: 15, time: 20 },
    { type: "hue",    n: 7, delta: 13, time: 24 }
  ],
  nightmare: [
    { type: "hue",    n: 8,  delta: 18, time: 22 },
    { type: "light",  n: 8,  delta: 7,  time: 22 },
    { type: "sat",    n: 9,  delta: 15, time: 24 },
    { type: "rotate", n: 9,  delta: 16, time: 26, surge: true },
    { type: "size",   n: 9,  delta: 14, time: 24 },
    { type: "hue",    n: 10, delta: 13, time: 30 },
    { type: "light",  n: 10, delta: 6,  time: 30 },
    { type: "rotate", n: 10, delta: 12, time: 32 }
  ],
  onslaught: [
    { type: "hue",    n: 3, delta: 26, time: 12 },
    { type: "sat",    n: 4, delta: 22, time: 12, surge: true },
    { type: "rotate", n: 5, delta: 22, time: 14 },
    { type: "light",  n: 6, delta: 8,  time: 14 },
    { type: "size",   n: 7, delta: 12, time: 16, surge: true },
    { type: "hue",    n: 8, delta: 12, time: 18 },
    { type: "rotate", n: 8, delta: 13, time: 20, surge: true },
    { type: "light",  n: 9, delta: 6,  time: 22 }
  ]
};

const TYPE_LABEL = {
  hue: "hue",
  light: "lightness",
  sat: "saturation",
  size: "size",
  rotate: "angle"
};

const BOARD_CLASS = {
  "🟩": "ok",
  "🟨": "recovered",
  "🟥": "miss",
  "⬜": "skipped",
  "⬛": "unplayed"
};

const MODES = {
  focus: {
    label: "Focus run",
    short: "Focus",
    timed: true,
    lives: 3,
    script: "classic",
    timeScale: 1,
    minTime: 1,
    multiplier: 1,
    best: true
  },
  blitz: {
    label: "Blitz",
    short: "Blitz",
    timed: true,
    lives: 2,
    script: "classic",
    timeScale: 0.55,
    minTime: 5,
    multiplier: 1.5,
    best: true
  },
  zen: {
    label: "Zen",
    short: "Zen",
    timed: false,
    lives: Infinity,
    script: "classic",
    timeScale: 1,
    minTime: 1,
    multiplier: 1,
    best: false
  },
  nightmare: {
    label: "Nightmare",
    short: "Nightmare",
    timed: true,
    lives: 1,
    script: "nightmare",
    timeScale: 1,
    minTime: 1,
    multiplier: 2,
    best: true
  },
  onslaught: {
    label: "Onslaught",
    short: "Onslaught",
    timed: true,
    lives: 2,
    script: "onslaught",
    timeScale: 0.8,
    minTime: 5,
    multiplier: 1.25,
    best: true
  },
  daily: {
    label: "Daily",
    short: "Daily",
    timed: true,
    lives: 3,
    script: "classic",
    timeScale: 1,
    minTime: 1,
    multiplier: 1,
    best: false,
    daily: true
  }
};

const WIN_TITLES = {
  focus: "Nice eyes.",
  blitz: "Fast eyes.",
  zen: "Zen complete.",
  nightmare: "Nightmare cleared.",
  onslaught: "Onslaught cleared.",
  daily: "Daily cleared."
};

const BESTS_KEY = "afterimage.bests";
const DAILY_KEY = "afterimage.daily";
const PROFILE_KEY = "afterimage.profile";
const SAVE_VERSION = 1;
const blockedKeys = new Set();
const HUES = [198, 214, 246, 268, 292, 330, 12, 38, 154, 174];
const TAU = Math.PI * 2;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (blockedKeys.has(key)) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      /* private mode or a full quota — the game still runs, but nothing landed */
      return false;
    }
  }
};

function isStorageBlocked(key) {
  return blockedKeys.has(key);
}

function parseStoredObject(key) {
  let saved = {};
  try {
    saved = JSON.parse(store.get(key, "{}")) || {};
  } catch {
    return {};
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  if (saved.version !== undefined) {
    const version = Number(saved.version);
    if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) {
      blockedKeys.add(key);
      return {};
    }
  }
  return saved;
}

function loadBests() {
  const saved = parseStoredObject(BESTS_KEY);
  const bests = { focus: 0, blitz: 0, nightmare: 0, onslaught: 0 };
  Object.keys(bests).forEach((mode) => {
    const value = Number(saved[mode]);
    if (Number.isFinite(value) && value > 0) bests[mode] = value;
  });

  const legacy = Number(store.get("afterimage.best", "0")) || 0;
  if (legacy > bests.focus) bests.focus = legacy;
  return bests;
}

/* ------------------------------------------------------------ daily calendar */

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateKey(key) {
  if (typeof key !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function previousDateKey(key) {
  if (!isValidDateKey(key)) throw new TypeError(`invalid date key: ${String(key)}`);
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

function dailyNumber(key) {
  if (!isValidDateKey(key)) throw new TypeError(`invalid date key: ${String(key)}`);
  const [year, month, day] = key.split("-").map(Number);
  const start = Date.UTC(2026, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.max(1, Math.floor((current - start) / 86400000) + 1);
}

function dailyDateLabel(key) {
  if (!isValidDateKey(key)) throw new TypeError(`invalid date key: ${String(key)}`);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sanitizeDailyResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isValidDateKey(value.date)) {
    return null;
  }
  const score = Number(value.score);
  if (!Number.isFinite(score) || score < 0) return null;

  const totalRaw = Number(value.total);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.floor(totalRaw) : 10;
  const clearedRaw = Number(value.cleared);
  const cleared = Number.isFinite(clearedRaw) && clearedRaw > 0 ? Math.min(total, Math.floor(clearedRaw)) : 0;
  const accuracyRaw = Number(value.accuracy);
  const accuracy = Number.isFinite(accuracyRaw) && accuracyRaw > 0 ? Math.min(100, Math.round(accuracyRaw)) : 0;
  const rating = typeof value.rating === "string" && value.rating.trim() ? value.rating.trim() : "WARMING UP";
  return {
    date: value.date,
    score: Math.round(score),
    cleared,
    total,
    accuracy,
    rating,
    won: Boolean(value.won)
  };
}

function loadDaily() {
  const saved = parseStoredObject(DAILY_KEY);
  return {
    last: isValidDateKey(saved.last) ? saved.last : "",
    streak: Number(saved.streak) > 0 ? Math.floor(Number(saved.streak)) : 0,
    result: sanitizeDailyResult(saved.result)
  };
}

function saveDaily(snapshot) {
  const wrote = store.set(DAILY_KEY, JSON.stringify({ ...state.daily, version: SAVE_VERSION }));
  if (!wrote && snapshot) state.daily = snapshot;
  return wrote;
}

function loadProfile() {
  const saved = parseStoredObject(PROFILE_KEY);
  const num = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);
  const wins = {};
  for (const mode of ["focus", "blitz", "zen", "nightmare", "daily", "onslaught"]) {
    wins[mode] = num(saved.wins && saved.wins[mode]);
  }
  return {
    runs: num(saved.runs),
    clears: num(saved.clears),
    bestStreak: num(saved.bestStreak),
    hintsUsed: num(saved.hintsUsed),
    freezes: Math.min(1, num(saved.freezes)),
    wins
  };
}

function saveProfile(snapshot) {
  const wrote = store.set(PROFILE_KEY, JSON.stringify({ ...state.profile, version: SAVE_VERSION }));
  if (!wrote && snapshot) state.profile = snapshot;
  return wrote;
}

function eyeLevel(clears) {
  return Math.floor(clears / 10) + 1;
}

function abandonedTotals(runs, clears, bestStreak, runClears, runBestStreak) {
  const num = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);
  return {
    runs: num(runs) + 1,
    clears: num(clears) + num(runClears),
    bestStreak: Math.max(num(bestStreak), num(runBestStreak))
  };
}

function profileLine(clears, runs) {
  const safeClears = Number.isFinite(Number(clears)) && Number(clears) > 0 ? Math.floor(Number(clears)) : 0;
  const safeRuns = Number.isFinite(Number(runs)) && Number(runs) > 0 ? Math.floor(Number(runs)) : 0;
  return `EYE LV ${eyeLevel(safeClears)} · ${safeClears} ${safeClears === 1 ? "clear" : "clears"} · ${safeRuns} ${safeRuns === 1 ? "run" : "runs"}`;
}

function freezeRepair(last, day) {
  if (typeof last !== "string" || !last || typeof day !== "string" || !day) return false;
  if (last === day) return false;
  const yesterday = previousDateKey(day);
  if (last === yesterday) return false;
  return last === previousDateKey(yesterday);
}

function dailyStreakAfter(last, streak, freezes, day, won) {
  const current = Number.isFinite(Number(streak)) && Number(streak) > 0 ? Math.floor(Number(streak)) : 0;
  const held = Number.isFinite(Number(freezes)) && Number(freezes) > 0 ? Math.floor(Number(freezes)) : 0;
  if (!won || !isValidDateKey(day) || last === day) {
    return { last, streak: current, freezes: held };
  }
  if (last === previousDateKey(day)) {
    return { last: day, streak: current + 1, freezes: held };
  }
  if (held > 0 && freezeRepair(last, day)) {
    return { last: day, streak: current + 1, freezes: held - 1 };
  }
  return { last: day, streak: 1, freezes: held };
}

function currentStreak() {
  const today = localDateKey();
  const yesterday = previousDateKey(today);
  if (state.daily.last === today || state.daily.last === yesterday) {
    return state.daily.streak;
  }
  if (state.profile.freezes > 0 && freezeRepair(state.daily.last, today)) {
    return state.daily.streak;
  }
  return 0;
}

const ui = {
  shell: document.querySelector(".shell"),
  stage: document.getElementById("stage"),
  canvas: document.getElementById("board"),
  surge: document.getElementById("surgeBadge"),
  final: document.getElementById("finalBadge"),
  cells: document.getElementById("cells"),
  timer: document.getElementById("timer"),
  timerFill: document.getElementById("timerFill"),
  status: document.getElementById("status"),
  hud: document.getElementById("hud"),
  modeName: document.getElementById("modeName"),
  level: document.getElementById("levelNum"),
  levelTotal: document.getElementById("levelTotal"),
  score: document.getElementById("scoreNum"),
  lives: document.getElementById("livesNum"),
  lifeCount: document.getElementById("lifeCount"),
  streak: document.getElementById("streakNum"),
  sound: document.getElementById("soundBtn"),
  veil: document.getElementById("veil"),
  menu: document.getElementById("menu"),
  over: document.getElementById("over"),
  dailyBtn: document.getElementById("dailyBtn"),
  dailyKicker: document.getElementById("dailyKicker"),
  dailySub: document.getElementById("dailySub"),
  dailyAction: document.getElementById("dailyAction"),
  metaStreak: document.getElementById("metaStreak"),
  boardStrip: document.getElementById("boardStrip"),
  copyResult: document.getElementById("copyResult"),
  copyFallback: document.getElementById("copyFallback"),
  copyText: document.getElementById("copyText"),
  copyClose: document.getElementById("copyClose"),
  skip: document.getElementById("skipBtn"),
  quit: document.getElementById("quitBtn"),
  hint: document.getElementById("hintBtn"),
  streakItem: document.getElementById("streakItem"),
  metaLevel: document.getElementById("metaLevel"),
  resultKicker: document.getElementById("resultKicker"),
  resultTitle: document.getElementById("resultTitle"),
  resultScore: document.getElementById("resultScore"),
  resultRating: document.getElementById("resultRating"),
  resultBlurb: document.getElementById("resultBlurb"),
  resultMode: document.getElementById("resultMode"),
  statCleared: document.getElementById("statCleared"),
  statAccuracy: document.getElementById("statAccuracy"),
  statStreak: document.getElementById("statStreak"),
  newBest: document.getElementById("newBest"),
  playAgain: document.getElementById("playAgain"),
  saveCard: document.getElementById("saveCard"),
  saveStatus: document.getElementById("saveStatus"),
  changeMode: document.getElementById("changeMode")
};

const ctx = ui.canvas.getContext("2d");

const state = {
  mode: "focus",
  timed: true,
  phase: "menu",
  runId: 0,
  levels: SCRIPTS.classic,
  level: 0,
  cleared: 0,
  skipped: 0,
  score: 0,
  lives: 3,
  maxLives: 3,
  multiplier: 1,
  streak: 0,
  bestStreak: 0,
  attempts: 0,
  hits: 0,
  levelMistakes: 0,
  boards: [],
  timeLimit: 1,
  remaining: 0,
  n: 3,
  odd: -1,
  data: null,
  rects: [],
  hover: -1,
  wrongFlash: -1,
  reveal: false,
  hintActive: 0,
  pendingOutcome: "",
  enterAt: 0,
  lastTickSec: 0,
  typeMisses: {},
  hints: 1,
  hintsUsedRun: 0,
  hiddenAt: null,
  pendingHidden: 0,
  slump: 0,
  paceCalled: false,
  perfectBoards: 0,
  surgeBoards: 0,
  particles: [],
  pops: [],
  lastFrame: 0,
  muted: store.get("afterimage.muted", "0") === "1",
  bests: loadBests(),
  daily: loadDaily(),
  profile: loadProfile(),
  rng: null,
  dailyKey: "",
  dailyNumber: 0,
  dailyDateLabel: "",
  result: null
};

let raf = 0;
let audio = null;
let saveStatusTimer = 0;
let timerText = "";

/* ------------------------------------------------------------------ audio */

function ensureAudio() {
  if (!audio) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor) {
      try {
        audio = new Ctor();
      } catch {
        audio = null;
      }
    }
  }
  if (audio && audio.state === "suspended") {
    try {
      audio.resume();
    } catch {
      /* silent devices stay silent */
    }
  }
}

function tone(freq, duration, type, gain, delay = 0) {
  if (state.muted || !audio) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function soundCorrect() {
  const lift = Math.min(6, state.streak) * 45;
  tone(620 + lift, 0.09, "sine", 0.045);
  tone(930 + lift * 1.4, 0.16, "sine", 0.038, 0.07);
  const tier = comboTier(state.streak).name;
  if (tier === "FEVER" || tier === "BLAZE") tone(1240 + lift, 0.2, "sine", 0.03, 0.14);
}

function soundWrong() {
  tone(146, 0.2, "triangle", 0.05);
}

function soundTimeout() {
  tone(392, 0.14, "triangle", 0.04);
  tone(294, 0.16, "triangle", 0.038, 0.12);
  tone(196, 0.22, "triangle", 0.035, 0.26);
}

function soundWin() {
  tone(523.25, 0.14, "sine", 0.042);
  tone(659.25, 0.14, "sine", 0.04, 0.08);
  tone(783.99, 0.16, "sine", 0.038, 0.16);
  tone(1046.5, 0.28, "sine", 0.036, 0.28);
}

function soundLose() {
  tone(220, 0.18, "triangle", 0.04);
  tone(164.81, 0.3, "triangle", 0.036, 0.16);
}

function soundHint() {
  tone(520, 0.12, "sine", 0.04);
  tone(780, 0.18, "sine", 0.035, 0.1);
}

function soundSurge() {
  tone(440, 0.1, "square", 0.022);
  tone(660, 0.14, "square", 0.02, 0.09);
}

/* --------------------------------------------------------------- round art */

function random() {
  return state.rng ? state.rng() : Math.random();
}

function makeRound(def, ease = 1) {
  const n = def.n;
  const odd = Math.floor(random() * n * n);
  const hue = HUES[Math.floor(random() * HUES.length)];
  const delta = easedDelta(def, ease);
  const round = {
    def,
    n,
    odd,
    base: "",
    oddColor: "",
    oddAngle: 0,
    oddScale: 1
  };

  switch (def.type) {
    case "hue": {
      const direction = random() < 0.5 ? -1 : 1;
      round.base = `hsl(${hue} 68% 58%)`;
      round.oddColor = `hsl(${hue + direction * delta} 68% 58%)`;
      break;
    }
    case "light": {
      const direction = random() < 0.5 ? -1 : 1;
      round.base = `hsl(${hue} 62% 54%)`;
      round.oddColor = `hsl(${hue} 62% ${54 + direction * delta}%)`;
      break;
    }
    case "sat": {
      round.base = `hsl(${hue} 72% 60%)`;
      round.oddColor = `hsl(${hue} ${72 - delta}% 60%)`;
      break;
    }
    case "size": {
      round.base = `hsl(${hue} 74% 62%)`;
      round.oddColor = round.base;
      const direction = random() < 0.5 ? -1 : 1;
      round.oddScale = 1 + (direction * delta) / 100;
      break;
    }
    case "rotate": {
      round.base = `hsl(${hue} 72% 62%)`;
      round.oddColor = round.base;
      const direction = random() < 0.5 ? -1 : 1;
      round.oddAngle = (direction * delta * Math.PI) / 180;
      break;
    }
    default:
      round.base = `hsl(${hue} 68% 58%)`;
      round.oddColor = `hsl(${hue + 24} 68% 58%)`;
  }

  return round;
}

/* --------------------------------------------------------------- geometry */

function computeLayout() {
  if (!state.data) return;

  const size = Math.max(160, Math.round(ui.stage.clientWidth));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixels = Math.round(size * dpr);

  if (ui.canvas.width !== pixels || ui.canvas.height !== pixels) {
    ui.canvas.width = pixels;
    ui.canvas.height = pixels;
  }

  const n = state.n;
  const pad = size * 0.058;
  const gap = size * 0.017;
  const cell = (size - pad * 2 - gap * (n - 1)) / n;

  const rects = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      rects.push({
        x: pad + col * (cell + gap),
        y: pad + row * (cell + gap),
        w: cell,
        h: cell
      });
    }
  }
  state.rects = rects;

  // Rebuilding the grid destroys the focused button; remember it so keyboard
  // play survives the layout pass that runs right after a board starts.
  const active = document.activeElement;
  const keepFocus = focusedCellIndex(
    active && active.classList && active.classList.contains("cell") ? active.dataset.i : null,
    rects.length
  );

  ui.cells.textContent = "";
  rects.forEach((tile, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.i = String(index);
    button.style.left = `${tile.x}px`;
    button.style.top = `${tile.y}px`;
    button.style.width = `${tile.w}px`;
    button.style.height = `${tile.h}px`;
    button.setAttribute(
      "aria-label",
      `Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}`
    );
    button.tabIndex = index === 0 || index === keepFocus ? 0 : -1;
    button.addEventListener("click", () => pick(index));
    button.addEventListener("mouseenter", () => {
      state.hover = index;
    });
    button.addEventListener("mouseleave", () => {
      if (state.hover === index) state.hover = -1;
    });
    button.addEventListener("focus", () => {
      state.hover = index;
    });
    button.addEventListener("blur", () => {
      if (state.hover === index) state.hover = -1;
    });
    ui.cells.appendChild(button);
  });

  if (keepFocus !== null) {
    try {
      ui.cells.children[keepFocus].focus({ preventScroll: true });
    } catch {
      /* non-DOM harnesses ignore focus */
    }
  }
}

/* --------------------------------------------------------------- painting */

function traceRoundRect(g, x, y, w, h, r) {
  if (typeof g.roundRect === "function") {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

function paintTile(tile, color) {
  const gradient = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
  gradient.addColorStop(0, "rgba(255,255,255,0.10)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = color;
  traceRoundRect(ctx, tile.x, tile.y, tile.w, tile.h, tile.w * 0.22);
  ctx.fill();
  ctx.fillStyle = gradient;
  traceRoundRect(ctx, tile.x, tile.y, tile.w, tile.h, tile.w * 0.22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function paintDot(tile, color, scale) {
  const cx = tile.x + tile.w / 2;
  const cy = tile.y + tile.h / 2;
  const radius = tile.w * 0.3 * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.beginPath();
  ctx.arc(cx - radius * 0.26, cy - radius * 0.3, radius * 0.36, 0, TAU);
  ctx.fill();
}

function paintPill(tile, color, angle) {
  const width = tile.w * 0.64;
  const height = tile.w * 0.235;
  ctx.save();
  ctx.translate(tile.x + tile.w / 2, tile.y + tile.h / 2);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  traceRoundRect(ctx, -width / 2, -height / 2, width, height, height / 2);
  ctx.fill();
  ctx.restore();
}

function paintHover(tile) {
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  traceRoundRect(ctx, tile.x + 1.5, tile.y + 1.5, tile.w - 3, tile.h - 3, tile.w * 0.2);
  ctx.stroke();
}

function paintWrong(tile) {
  ctx.fillStyle = "rgba(255,92,116,0.34)";
  traceRoundRect(ctx, tile.x, tile.y, tile.w, tile.h, tile.w * 0.22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,92,116,0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function paintParticles() {
  if (!state.particles.length) return;
  ctx.save();
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function paintPops() {
  if (!state.pops.length) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.max(20, Math.round(ui.stage.clientWidth * 0.055))}px "Segoe UI", system-ui, sans-serif`;
  for (const pop of state.pops) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pop.life * 1.5));
    ctx.fillStyle = "rgba(5,5,9,0.62)";
    ctx.fillText(pop.text, pop.x + 2, pop.y + 2);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x, pop.y);
  }
  ctx.restore();
}

function paint() {
  if (!state.data || !state.rects.length) return;

  const size = ui.stage.clientWidth;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const round = state.data;
  const now = performance.now();
  const enterT = REDUCED ? 1 : Math.min(1, Math.max(0, (now - state.enterAt) / 140));

  ctx.save();
  ctx.globalAlpha = enterT;
  state.rects.forEach((tile, index) => {
    const isOdd = index === round.odd;
    const color = isOdd ? round.oddColor : round.base;

    if (round.def.type === "rotate") {
      paintPill(tile, color, isOdd ? round.oddAngle : 0);
    } else if (round.def.type === "size") {
      paintDot(tile, color, isOdd ? round.oddScale : 1);
    } else {
      paintTile(tile, color);
    }

    if (state.hover === index && state.phase === "play") paintHover(tile);
    if (state.wrongFlash === index) paintWrong(tile);
  });
  ctx.restore();

  if (state.reveal) {
    ctx.fillStyle = "rgba(5,5,9,0.62)";
    ctx.fillRect(0, 0, size, size);
    const tile = state.rects[round.odd];
    const pulse = 0.62 + Math.sin(now / 170) * 0.26;
    ctx.strokeStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
    ctx.lineWidth = Math.max(2, size * 0.004);
    traceRoundRect(ctx, tile.x + 2, tile.y + 2, tile.w - 4, tile.h - 4, tile.w * 0.2);
    ctx.stroke();
  }

  if (state.hintActive > 0 && state.phase === "play") {
    const tile = state.rects[round.odd];
    if (tile) {
      const pulse = 0.55 + Math.sin(now / 150) * 0.35;
      ctx.strokeStyle = `rgba(79,209,197,${pulse.toFixed(3)})`;
      ctx.lineWidth = Math.max(3, size * 0.006);
      traceRoundRect(ctx, tile.x - 2, tile.y - 2, tile.w + 4, tile.h + 4, tile.w * 0.24);
      ctx.stroke();
      ctx.fillStyle = `rgba(79,209,197,${(pulse * 0.18).toFixed(3)})`;
      traceRoundRect(ctx, tile.x - 2, tile.y - 2, tile.w + 4, tile.h + 4, tile.w * 0.24);
      ctx.fill();
    }
  }

  paintParticles();
  paintPops();
}

/* ------------------------------------------------------------------- hud */

function say(message) {
  ui.status.textContent = message;
}

function renderHud() {
  ui.modeName.textContent = MODES[state.mode].short;
  ui.level.textContent = String(Math.min(state.level + 1, state.levels.length)).padStart(2, "0");
  ui.levelTotal.textContent = `/${state.levels.length}`;
  ui.score.textContent = state.score.toLocaleString("en-US");
  const tier = comboTier(state.streak);
  ui.streak.textContent = tier.name ? `${state.streak} ${tier.name}` : String(state.streak);
  if (ui.streakItem) ui.streakItem.classList.toggle("hot", state.streak >= 3);
  ui.lives.textContent = "";
  if (ui.lifeCount) ui.lifeCount.textContent = "";

  if (ui.hint) {
    ui.hint.hidden = false;
    ui.hint.disabled = state.hints <= 0 || state.phase !== "play";
    ui.hint.textContent = state.hints > 0 ? `Hint (${state.hints}) [H]` : "No hints";
  }

  if (!state.timed) {
    ui.lives.setAttribute("aria-label", livesLabel(false, state.lives, state.maxLives));
    return;
  }
  ui.lives.setAttribute("aria-label", livesLabel(true, state.lives, state.maxLives));
  if (ui.lifeCount) ui.lifeCount.textContent = String(Math.max(0, state.lives));
  for (let i = 0; i < state.maxLives; i += 1) {
    const dot = document.createElement("i");
    dot.className = i < state.lives ? "life" : "life off";
    ui.lives.appendChild(dot);
  }
}

function updateTimer() {
  if (!state.timed) {
    ui.timerFill.style.transform = "scaleX(0)";
    if (timerText !== "") {
      timerText = "";
      if (ui.timer) {
        ui.timer.setAttribute("data-time", "");
        ui.timer.setAttribute("aria-label", "Time remaining");
      }
    }
    return;
  }
  const label = timerLabel(state.remaining);
  if (label !== timerText) {
    timerText = label;
    if (ui.timer) {
      const seconds = Number(label.slice(0, -1));
      ui.timer.setAttribute("data-time", label);
      ui.timer.setAttribute("aria-label", `Time remaining: ${seconds} ${seconds === 1 ? "second" : "seconds"}`);
    }
  }
  const ratio = Math.max(0, Math.min(1, state.remaining / state.timeLimit));
  ui.timerFill.style.transform = `scaleX(${ratio})`;
  ui.timer.classList.toggle("low", ratio < 0.25);
}

function renderBests() {
  document.querySelectorAll("[data-best]").forEach((node) => {
    const value = state.bests[node.dataset.best] || 0;
    const cleared = (state.profile.wins && state.profile.wins[node.dataset.best]) || 0;
    node.textContent = bestLine(value, cleared);
    node.hidden = value <= 0 && cleared <= 0;
  });
}

function renderDaily() {
  const today = localDateKey();
  const number = dailyNumber(today);
  const label = dailyDateLabel(today);
  ui.dailyKicker.textContent = `DAILY #${number} · ${label}`;

  const result = state.daily.result && state.daily.result.date === today ? state.daily.result : null;
  if (result) {
    ui.dailySub.textContent = `Played today · ${result.score.toLocaleString("en-US")} · ${result.rating}`;
    ui.dailyAction.textContent = "REPLAY →";
  } else {
    ui.dailySub.textContent = "A fresh seeded set · 10 boards · 3 lives";
    ui.dailyAction.textContent = "PLAY →";
  }

  const streak = currentStreak();
  const atRisk = result && result.won === false && streak > 0;
  const freezeArmed = state.profile.freezes > 0 && streak > 0 ? " · freeze armed" : "";
  const risk = atRisk ? " · at risk" : "";
  ui.metaStreak.textContent =
    streak >= 7 ? `${streak}-day streak · UNSTOPPABLE${freezeArmed}${risk}`
    : streak >= 3 ? `${streak}-day streak · ROLLING${freezeArmed}${risk}`
    : streak > 0 ? `${streak}-day streak${freezeArmed}${risk}`
    : "Day one";
  if (ui.metaLevel) {
    ui.metaLevel.textContent = profileLine(state.profile.clears, state.profile.runs);
  }
}

function renderBoardStrip(icons) {
  ui.boardStrip.textContent = "";
  icons.forEach((icon) => {
    const dot = document.createElement("span");
    dot.className = BOARD_CLASS[icon] || "unplayed";
    ui.boardStrip.appendChild(dot);
  });
}

function renderSound() {
  ui.sound.textContent = state.muted ? "SOUND OFF" : "SOUND ON";
  ui.sound.setAttribute("aria-pressed", String(!state.muted));
}

/* ------------------------------------------------------------------ flow */

function setShellInert(value) {
  if (!ui.shell) return;
  if (value) {
    ui.shell.setAttribute("inert", "");
    ui.shell.setAttribute("aria-hidden", "true");
  } else {
    ui.shell.removeAttribute("inert");
    ui.shell.removeAttribute("aria-hidden");
  }
}

function startRun(mode) {
  const config = MODES[mode];
  if (!config) return;

  state.runId += 1;
  state.mode = mode;
  state.timed = config.timed;
  state.levels = SCRIPTS[config.script];

  const daily = Boolean(config.daily);
  state.dailyKey = daily ? localDateKey() : "";
  state.dailyNumber = daily ? dailyNumber(state.dailyKey) : 0;
  state.dailyDateLabel = daily ? dailyDateLabel(state.dailyKey) : "";
  state.rng = daily ? mulberry32(hashString(`afterimage-daily-${state.dailyKey}`)) : null;
  state.level = 0;
  state.cleared = 0;
  state.skipped = 0;
  state.score = 0;
  state.lives = config.lives;
  state.maxLives = config.lives;
  state.multiplier = config.multiplier;
  state.streak = 0;
  state.bestStreak = 0;
  state.attempts = 0;
  state.hits = 0;
  state.levelMistakes = 0;
  state.boards = [];
  state.data = null;
  state.odd = -1;
  state.remaining = 0;
  state.phase = "play";
  state.reveal = false;
  state.hintActive = 0;
  state.hints = mode === "zen" ? 3 : 1 + (daily ? bonusHints(currentStreak()) : 0);
  state.hintsUsedRun = 0;
  state.hiddenAt = null;
  state.pendingHidden = 0;
  state.pendingOutcome = "";
  state.paceCalled = false;
  state.slump = 0;
  state.perfectBoards = 0;
  state.surgeBoards = 0;
  state.typeMisses = {};
  state.wrongFlash = -1;
  state.hover = -1;
  state.particles = [];
  state.pops = [];
  state.result = null;

  document.body.classList.add("playing");
  document.body.classList.toggle("zen", mode === "zen");
  ui.veil.hidden = true;
  ui.hud.hidden = false;
  ui.menu.hidden = true;
  ui.over.hidden = true;
  ui.skip.hidden = mode !== "zen";
  ui.quit.hidden = false;
  if (ui.surge) ui.surge.hidden = true;
  if (ui.final) ui.final.hidden = true;
  if (ui.stage) ui.stage.classList.remove("finale");
  ui.cells.classList.remove("off");
  setShellInert(false);

  ensureAudio();
  nextLevel();
}

function nextLevel() {
  if (state.level >= state.levels.length) {
    finish(true);
    return;
  }

  const def = state.levels[state.level];
  const config = MODES[state.mode];
  const seconds = Math.max(config.minTime, Math.round(def.time * config.timeScale));
  const ease = assistEase(state.slump);

  state.n = def.n;
  state.data = makeRound(def, ease);
  state.odd = state.data.odd;
  state.timeLimit = seconds * 1000;
  state.remaining = state.timeLimit;
  if (state.pendingHidden > 0) {
    state.remaining = hiddenPenalty(state.remaining, state.pendingHidden);
    state.pendingHidden = 0;
  }
  state.phase = "play";
  state.hover = -1;
  state.wrongFlash = -1;
  state.reveal = false;
  state.hintActive = 0;
  state.pendingOutcome = "";
  state.levelMistakes = 0;
  state.lastTickSec = 0;
  state.particles = [];
  state.pops = [];
  state.enterAt = performance.now();

  computeLayout();
  renderHud();
  updateTimer();
  paint();
  ui.cells.classList.remove("off");
  const surge = Boolean(def.surge);
  if (ui.surge) ui.surge.hidden = !surge;
  const final = isFinalBoard(state.level, state.levels.length);
  if (ui.stage) ui.stage.classList.toggle("finale", final);
  if (ui.final) ui.final.hidden = !final;
  const assisted = ease > 1 ? " · assisted" : "";
  const tip = firstRunTip(state.profile.runs, state.level, state.hints);
  const beat = progressBeat(state.level, state.levels.length);
  if (surge) soundSurge();
  say(`Level ${state.level + 1} · ${TYPE_LABEL[def.type]}${surge ? " · SURGE 1.5×" : ""}${assisted}${tip}${beat} — find the one that differs.`);

  state.lastFrame = performance.now();
  ensureLoop();
  // Keyboard users lose focus when the grid rebuilds; restore to the first
  // cell unless focus already moved inside the new grid.
  try {
    const active = document.activeElement;
    if (!active || active === document.body || !ui.cells.contains(active)) {
      const first = ui.cells.querySelector("button.cell");
      if (first) first.focus({ preventScroll: true });
    }
  } catch {
    /* non-DOM harnesses ignore focus restore */
  }
}

function pick(index) {
  if (state.phase !== "play" || !state.data) return;
  const runId = state.runId;

  if (index === state.odd) {
    state.attempts += 1;
    state.hits += 1;
    state.cleared += 1;
    const perfect = state.levelMistakes === 0 && state.hintActive <= 0;
    const surge = Boolean(state.data.def.surge);
    state.boards.push(perfect ? "🟩" : "🟨");
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.slump = 0;
    if (perfect) state.perfectBoards += 1;
    if (surge) state.surgeBoards += 1;

    const gain = scoreFor(state.remaining, state.streak, perfect, surge);
    state.score += gain;
    state.phase = "pause";
    state.pendingOutcome = state.level + 1 >= state.levels.length ? "win" : "";
    ui.cells.classList.add("off");

    const tile = state.rects[index];
    const tier = comboTier(state.streak).name;
    const centerX = tile.x + tile.w / 2;
    const centerY = tile.y + tile.h / 2;
    burst(centerX, centerY, sparkColor(state.data.def, state.data.oddColor));
    if (state.streak >= 3) burst(centerX, centerY, "#ffffff");
    scorePop(centerX, centerY, gain);
    soundCorrect();
    const tail = state.streak > 1 ? ` · ${state.streak} in a row` : "";
    const flavor = tier ? ` · ${tier}` : "";
    const bonus = `${perfect ? " · perfect +50" : ""}${surge ? " · SURGE 1.5×" : ""}`;
    let pace = "";
    if (state.timed && !state.paceCalled) {
      const config = MODES[state.mode];
      const target = config.daily
        ? (state.daily.result && state.daily.result.date === state.dailyKey ? state.daily.result.score : 0)
        : (state.bests[state.mode] || 0);
      if (onBestPace(state.score, state.level + 1, state.levels.length, target)) {
        state.paceCalled = true;
        pace = " · best pace!";
      }
    }
    say(`Correct · +${gain}${tail}${flavor}${bonus}${pace}`);
    renderHud();

    window.setTimeout(() => {
      if (runId !== state.runId) return;
      advance();
    }, REDUCED ? 380 : 680);
    return;
  }

  state.attempts += 1;
  state.streak = 0;
  state.levelMistakes += 1;
  state.slump += 1;
  state.wrongFlash = index;
  state.phase = "pause";
  const missType = state.data.def.type;
  state.typeMisses[missType] = (state.typeMisses[missType] || 0) + 1;
  ui.cells.classList.add("off");
  shake();
  soundWrong();

  const near = isAdjacent(state.n, index, state.odd);
  if (state.timed) {
    state.lives = Math.max(0, state.lives - 1);
    if (state.lives <= 0) {
      say("Out of focus");
    } else if (near) {
      say(`So close — it was next door · ${state.lives} focus left`);
    } else {
      say(`Not that one · ${state.lives} focus left`);
    }
  } else if (near) {
    say("So close — right next to it. Scan again");
  } else {
    say("Not that one — scan again");
  }
  const fatal = shouldRevealMiss(state.timed, state.lives);
  if (fatal) {
    state.reveal = true;
    state.pendingOutcome = "loss";
    say("Out of focus — it was there");
  }
  renderHud();
  paint();

  window.setTimeout(() => {
    if (runId !== state.runId) return;
    state.wrongFlash = -1;
    if (fatal) {
      state.boards.push("🟥");
      finish(false);
      return;
    }
    state.phase = "play";
    ui.cells.classList.remove("off");
    const cell = ui.cells.children[index];
    if (cell) {
      Array.from(ui.cells.children).forEach((item) => {
        item.tabIndex = -1;
      });
      cell.tabIndex = 0;
      try {
        cell.focus({ preventScroll: true });
      } catch {
        /* non-DOM harnesses ignore focus */
      }
    }
    state.lastFrame = performance.now();
    ensureLoop();
  }, fatal ? 1150 : (REDUCED ? 400 : 640));
}

function timeout() {
  if (state.phase !== "play") return;
  const runId = state.runId;

  state.phase = "reveal";
  state.attempts += 1;
  state.streak = 0;
  state.slump += 1;
  state.boards.push("🟥");
  const missType = state.data.def.type;
  state.typeMisses[missType] = (state.typeMisses[missType] || 0) + 1;
  state.reveal = true;
  state.hover = -1;
  ui.cells.classList.add("off");
  soundTimeout();

  if (state.timed) {
    state.lives = Math.max(0, state.lives - 1);
    // Only a timeout that spends the last life ends the run; a life left means
    // the board is still live, so quitting it stays an abandoned run.
    state.pendingOutcome = timeoutOutcome(state.timed, state.lives);
    say(state.lives > 0 ? "Time — here it was" : "Time — out of focus");
  }
  renderHud();
  paint();

  window.setTimeout(() => {
    if (runId !== state.runId) return;
    if (state.timed && state.lives <= 0) {
      finish(false);
      return;
    }
    advance();
  }, 1150);
}

function advance() {
  state.level += 1;
  if (state.level >= state.levels.length) {
    // Passing the last board is only a win when it was actually cleared; a
    // timeout on the final board advances the level with a red board.
    finish(runWon(state.cleared, state.levels.length));
    return;
  }
  nextLevel();
}

function comboTier(streak) {
  if (streak >= 6) return { name: "BLAZE", mult: 1.5 };
  if (streak >= 4) return { name: "FEVER", mult: 1.25 };
  if (streak >= 2) return { name: "COMBO", mult: 1.1 };
  return { name: "", mult: 1 };
}

function assistEase(slump) {
  return slump >= 2 ? 1.3 : 1;
}

function shouldRevealMiss(timed, lives) {
  return Boolean(timed) && Number(lives) <= 0;
}

function sparkColor(def, oddColor) {
  const type = def && def.type;
  return type === "size" || type === "rotate" ? "#4fd1c5" : oddColor;
}

function scorePopText(gain) {
  const value = Number(gain);
  const safe = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return `+${safe.toLocaleString("en-US")}`;
}

function isAdjacent(n, a, b) {
  if (a === b) return false;
  const ar = Math.floor(a / n);
  const ac = a % n;
  const br = Math.floor(b / n);
  const bc = b % n;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

function firstRunTip(runs, level, hints) {
  if (runs === 0 && level === 0 && hints > 0) return " · press H for a hint";
  return "";
}

function isFinalBoard(level, total) {
  const index = Number(level);
  const count = Number(total);
  return Number.isInteger(index) && Number.isInteger(count) && count > 0 && index === count - 1;
}

function progressBeat(level, total) {
  if (level === total - 1) return " · final board";
  if (level === total - 2) return " · two left";
  if (level === Math.floor(total / 2)) return " · halfway";
  return "";
}

function weakestType(misses) {
  let weak = "";
  let best = 0;
  for (const [type, count] of Object.entries(misses || {})) {
    if (count > best) {
      best = count;
      weak = type;
    }
  }
  return weak;
}

function bonusHints(dailyStreak) {
  return dailyStreak >= 3 ? 1 : 0;
}

function bestLine(best, wins) {
  const parts = [];
  const score = Number(best);
  if (score > 0) parts.push(`BEST ${score.toLocaleString("en-US")}`);
  if (wins > 0) parts.push("CLEARED");
  return parts.join(" · ");
}

function onBestPace(score, boardsDone, total, best) {
  if (!(best > 0) || !(score > 0)) return false;
  if (!(total > 0) || !(boardsDone >= 0) || boardsDone > total) return false;
  return score >= best * (boardsDone / total);
}

function livesLabel(timed, lives, maxLives) {
  if (!timed) return "No focus limit";
  const current = Number.isFinite(Number(lives)) && Number(lives) > 0 ? Math.floor(Number(lives)) : 0;
  const max = Number.isFinite(Number(maxLives)) && Number(maxLives) > 0 ? Math.floor(Number(maxLives)) : current;
  return `${current} of ${max} focus remaining`;
}

function timerLabel(remaining) {
  const value = Number(remaining);
  const seconds = Number.isFinite(value) && value > 0 ? Math.ceil(value / 1000) : 0;
  return `${seconds}s`;
}

function hiddenPenalty(remaining, hiddenMs) {
  if (!(hiddenMs > 0)) return remaining;
  return Math.max(0, remaining - hiddenMs);
}

function tracksHiddenTime(timed, phase) {
  return Boolean(timed) && (phase === "play" || phase === "pause" || phase === "reveal");
}

function decidedOutcome(phase, pending) {
  if (pending !== "win" && pending !== "loss") return "";
  if (phase !== "pause" && phase !== "reveal") return "";
  return pending;
}

function runWon(cleared, total) {
  const done = Number(cleared);
  const count = Number(total);
  if (!Number.isInteger(done) || !Number.isInteger(count) || count <= 0) return false;
  return done === count;
}

// Zen has no fail state, so an unfinished untimed run must not read as a loss.
function lostRun(won, timed) {
  return !won && Boolean(timed);
}

function timeoutOutcome(timed, lives) {
  if (!timed) return "";
  const left = Number(lives);
  if (!Number.isFinite(left)) return "";
  return left <= 0 ? "loss" : "";
}

function focusedCellIndex(rawIndex, cellCount) {
  const index = Number(rawIndex);
  const count = Number(cellCount);
  if (rawIndex === null || rawIndex === undefined || rawIndex === "") return null;
  if (!Number.isInteger(index) || !Number.isInteger(count) || count <= 0) return null;
  if (index < 0 || index >= count) return null;
  return index;
}

function hiddenReturn(remaining, hiddenMs, timed, phase) {
  const current = Number(remaining);
  const safe = Number.isFinite(current) && current > 0 ? current : 0;
  const hidden = Number(hiddenMs);
  if (!tracksHiddenTime(timed, phase) || !(hidden > 0)) {
    return { remaining: safe, pending: 0 };
  }
  if (phase === "play") {
    return { remaining: hiddenPenalty(safe, hidden), pending: 0 };
  }
  return { remaining: safe, pending: hidden };
}

function easedDelta(def, ease) {
  if (!ease || ease <= 1) return def.delta;
  const caps = { hue: 40, light: 18, sat: 35, size: 25, rotate: 40 };
  const cap = caps[def.type] || 40;
  return Math.min(cap, Math.round(def.delta * ease * 10) / 10);
}

function scoreFor(remaining, streak, perfect = false, surge = false) {
  const speed = state.timed ? Math.round(Math.max(0, remaining) / 1000) * 8 : 40;
  const streakBonus = Math.min(120, Math.max(0, streak - 1) * 30);
  let base = 100 + speed + streakBonus;
  if (perfect) base += 50;
  const tier = comboTier(streak);
  let total = base * state.multiplier * tier.mult;
  if (surge) total *= 1.5;
  return Math.round(total / 10) * 10;
}

function rateRun(won, cleared, total, accuracy, mode) {
  const perfect = won && cleared === total && accuracy >= 85;
  const near = won && cleared >= total - 1;

  if (perfect && mode === "nightmare") {
    return {
      rating: "NIGHT VISION",
      blurb: "Eight brutal boards, one life, and you never blinked."
    };
  }
  if (perfect && mode === "blitz") {
    return {
      rating: "QUICK EYE",
      blurb: "Half the clock and you still caught every board. Show-off."
    };
  }
  if (perfect) {
    return {
      rating: "EAGLE EYE",
      blurb: "Nearly every difference at first glance. That is a rare eye."
    };
  }
  if (near) {
    return {
      rating: "SHARP SIGHT",
      blurb: "A strong run. Most eyes lose the thread on the last two boards."
    };
  }
  if (cleared >= total * 0.7) {
    return {
      rating: "CLEAR VISION",
      blurb: "Strong perception. The high boards reward a slower, wider scan."
    };
  }
  if (cleared >= total * 0.4) {
    return {
      rating: "STEADY GAZE",
      blurb: "You catch the big shifts. The subtle ones still have somewhere to hide."
    };
  }
  return {
    rating: "WARMING UP",
    blurb: "Every miss is a calibration. Start with the bright, big boards and work down."
  };
}

function bestEligible(won, timed, best) {
  return Boolean(won) && Boolean(timed) && Boolean(best);
}

function saveBest(mode, score) {
  if (!MODES[mode] || !MODES[mode].best) return false;
  if (isStorageBlocked(BESTS_KEY)) return false;
  if (score <= (state.bests[mode] || 0)) return false;
  const previous = state.bests[mode];
  state.bests[mode] = score;
  if (!store.set(BESTS_KEY, JSON.stringify({ ...state.bests, version: SAVE_VERSION }))) {
    state.bests[mode] = previous;
    return false;
  }
  return true;
}

function dailyResultBeats(prior, score, won) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0) return false;
  if (!prior) return true;
  const priorWon = Boolean(prior.won);
  if (Boolean(won) !== priorWon) return Boolean(won);
  return value > (Number(prior.score) || 0);
}

function recordDaily(won, accuracy, rating) {
  if (isStorageBlocked(DAILY_KEY)) {
    return { isBest: false, streak: state.daily.streak };
  }
  const day = state.dailyKey || localDateKey();
  const snapshot = { ...state.daily };
  const next = dailyStreakAfter(state.daily.last, state.daily.streak, state.profile.freezes, day, won);
  if (next.freezes < state.profile.freezes) {
    const profileSnapshot = { ...state.profile, wins: { ...state.profile.wins } };
    state.profile.freezes = next.freezes;
    saveProfile(profileSnapshot);
  }
  state.daily.last = next.last;
  state.daily.streak = next.streak;

  const prior = state.daily.result && state.daily.result.date === day ? state.daily.result : null;
  const isBest = dailyResultBeats(prior, state.score, won);
  if (isBest) {
    state.daily.result = {
      date: day,
      score: state.score,
      cleared: state.cleared,
      total: state.levels.length,
      accuracy,
      rating,
      won
    };
  }

  if (!saveDaily(snapshot)) return { isBest: false, streak: snapshot.streak };
  return { isBest, streak: state.daily.streak };
}

function earnFreeze(won, accuracy) {
  if (isStorageBlocked(PROFILE_KEY)) return false;
  if (!won || accuracy < 100 || state.profile.freezes > 0) return false;
  const snapshot = { ...state.profile, wins: { ...state.profile.wins } };
  state.profile.freezes = 1;
  return saveProfile(snapshot);
}

function useHint() {
  if (state.phase !== "play" || !state.data || state.hints <= 0) return;
  const runId = state.runId;
  state.hints -= 1;
  state.hintsUsedRun += 1;
  state.attempts += 1;
  state.hintActive = 1;
  state.levelMistakes += 1;
  state.streak = 0;
  if (!isStorageBlocked(PROFILE_KEY)) {
    const snapshot = { ...state.profile, wins: { ...state.profile.wins } };
    state.profile.hintsUsed += 1;
    saveProfile(snapshot);
  }
  soundHint();
  say("Hint — follow the pulse. Streak reset, but the board is still scorable.");
  renderHud();
  paint();
  window.setTimeout(() => {
    if (runId !== state.runId || state.phase !== "play") return;
    state.hintActive = 0;
    paint();
  }, 2200);
}

function finish(won) {
  state.runId += 1;
  state.phase = "over";
  state.hiddenAt = null;
  state.pendingHidden = 0;
  document.body.classList.remove("playing");
  ui.cells.classList.add("off");
  ui.hud.hidden = true;
  ui.skip.hidden = true;
  ui.quit.hidden = true;
  if (ui.hint) ui.hint.hidden = true;
  if (ui.surge) ui.surge.hidden = true;
  if (ui.final) ui.final.hidden = true;
  if (ui.stage) ui.stage.classList.remove("finale");

  let firstClear = false;
  if (!isStorageBlocked(PROFILE_KEY)) {
    const snapshot = { ...state.profile, wins: { ...state.profile.wins } };
    state.profile.runs += 1;
    state.profile.clears += state.cleared;
    state.profile.bestStreak = Math.max(state.profile.bestStreak, state.bestStreak);
    if (won && state.cleared > 0) {
      state.profile.wins[state.mode] = (state.profile.wins[state.mode] || 0) + 1;
      firstClear = state.profile.wins[state.mode] === 1;
    }
    // A failed write drops the lifetime claim along with the attempt.
    firstClear = saveProfile(snapshot) && firstClear;
  }

  const total = state.levels.length;
  const attempts = Math.max(1, state.attempts);
  const accuracy = Math.round((state.hits / attempts) * 100);
  const boardIcons = state.boards.slice(0, total);
  while (boardIcons.length < total) boardIcons.push("⬛");
  const assisted = state.hintsUsedRun > 0;
  const ratingAccuracy = assisted ? Math.min(accuracy, 84) : accuracy;
  const info = rateRun(won, state.cleared, total, ratingAccuracy, state.mode);
  const clean = state.skipped === 0 && state.cleared === total;
  const config = MODES[state.mode];
  const isDaily = Boolean(config.daily);
  let isBest = false;

  if (isDaily) {
    const record = recordDaily(won, accuracy, info.rating);
    isBest = won && record.isBest && state.score > 0;
  } else {
    isBest = bestEligible(won, state.timed, config.best) && saveBest(state.mode, state.score);
  }
  const freezeEarned = isDaily && state.hintsUsedRun === 0 && earnFreeze(won, accuracy);

  state.result = {
    mode: state.mode,
    won,
    score: state.score,
    cleared: state.cleared,
    total,
    accuracy,
    hintsUsed: state.hintsUsedRun,
    bestStreak: state.bestStreak,
    bestTier: comboTier(state.bestStreak).name,
    perfectBoards: state.perfectBoards,
    surgeBoards: state.surgeBoards,
    boards: boardIcons,
    isBest,
    rating: info.rating,
    daily: isDaily,
    dailyNumber: isDaily ? state.dailyNumber : 0,
    dailyLabel: isDaily ? state.dailyDateLabel : "",
    board: state.data
      ? { base: state.data.base, oddColor: state.data.oddColor, n: state.data.n, odd: state.data.odd }
      : null
  };

  const lost = lostRun(won, state.timed);
  ui.resultKicker.textContent = isDaily
    ? `DAILY #${state.dailyNumber} · ${won ? "COMPLETE" : "RUN OVER"}`
    : (won ? "RUN COMPLETE" : (lost ? "FOCUS LOST" : "RUN ENDED"));
  ui.resultTitle.textContent = won
    ? (clean ? WIN_TITLES[state.mode] : "Run finished.")
    : (lost ? "So close." : "Run finished.");
  ui.resultScore.textContent = state.score.toLocaleString("en-US");
  ui.resultRating.textContent = info.rating;
  let blurb = state.perfectBoards >= 5
    ? `${info.blurb} ${state.perfectBoards} perfect boards — locked in.`
    : info.blurb;
  const weak = weakestType(state.typeMisses);
  if (weak && state.cleared < total) {
    const label = TYPE_LABEL[weak] || weak;
    blurb += ` ${label[0].toUpperCase()}${label.slice(1)} boards cost you most — Zen is a good place to study them.`;
  }
  if (freezeEarned) {
    blurb += " Streak freeze earned — one missed day forgiven.";
  }
  if (firstClear) {
    blurb += ` First ${MODES[state.mode].label} clear!`;
  }
  if (isDaily && !won && state.daily.streak > 0) {
    blurb += ` Your ${state.daily.streak}-day streak is at risk — clear today's board to keep it.`;
  }
  ui.resultBlurb.textContent = blurb;
  ui.resultMode.textContent = isDaily
    ? `Daily #${state.dailyNumber} · ${state.dailyDateLabel} · ${total} boards · ${state.maxLives} lives`
    : config.timed
      ? `${config.label} · ${total} boards · ${state.maxLives} ${state.maxLives === 1 ? "life" : "lives"}`
      : `${config.label} · ${total} boards · no clock`;
  ui.statCleared.textContent = `${state.cleared}/${total}`;
  ui.statAccuracy.textContent = `${accuracy}%`;
  const bestTierName = comboTier(state.bestStreak).name;
  ui.statStreak.textContent = bestTierName ? `${state.bestStreak} ${bestTierName}` : String(state.bestStreak);
  ui.newBest.textContent = isDaily ? "New daily best" : "New best";
  ui.newBest.hidden = !isBest;
  ui.saveCard.disabled = false;
  ui.saveCard.textContent = "Save card";
  showSaveStatus("");
  hideCopyFallback();
  ui.copyResult.textContent = "Copy result";
  ui.copyResult.disabled = false;

  renderBoardStrip(boardIcons);
  renderBests();
  renderDaily();
  ui.menu.hidden = true;
  ui.over.hidden = false;
  ui.veil.hidden = false;
  ui.veil.setAttribute("aria-labelledby", "resultTitle");
  try {
    ui.over.focus({ preventScroll: true });
  } catch {
    /* non-DOM harnesses ignore focus */
  }
  setShellInert(true);
  if (won && state.cleared > 0) soundWin();
  else if (lost) soundLose();
}

function quitRun() {
  const decided = decidedOutcome(state.phase, state.pendingOutcome);
  if (decided) {
    // A fatal miss records its red board only after the reveal beat; quitting
    // inside that beat must not drop it from the result strip.
    if (decided === "loss" && state.phase === "pause") state.boards.push("🟥");
    finish(decided === "win");
    return;
  }
  if (!isStorageBlocked(PROFILE_KEY) && (state.phase === "play" || state.phase === "pause" || state.phase === "reveal")) {
    const snapshot = { ...state.profile, wins: { ...state.profile.wins } };
    const totals = abandonedTotals(
      state.profile.runs,
      state.profile.clears,
      state.profile.bestStreak,
      state.cleared,
      state.bestStreak
    );
    state.profile.runs = totals.runs;
    state.profile.clears = totals.clears;
    state.profile.bestStreak = totals.bestStreak;
    saveProfile(snapshot);
  }
  showMenu();
}

function showMenu() {
  state.runId += 1;
  state.phase = "menu";
  state.data = null;
  state.result = null;
  state.hiddenAt = null;
  state.pendingHidden = 0;
  document.body.classList.remove("playing", "zen");
  ui.cells.classList.add("off");
  ui.veil.hidden = false;
  ui.veil.setAttribute("aria-labelledby", "title");
  ui.menu.hidden = false;
  ui.over.hidden = true;
  ui.hud.hidden = true;
  ui.skip.hidden = true;
  ui.quit.hidden = true;
  if (ui.hint) ui.hint.hidden = true;
  if (ui.surge) ui.surge.hidden = true;
  if (ui.final) ui.final.hidden = true;
  if (ui.stage) ui.stage.classList.remove("finale");
  showSaveStatus("");
  hideCopyFallback();
  renderBests();
  renderDaily();
  try {
    ui.dailyBtn.focus({ preventScroll: true });
  } catch {
    /* non-DOM harnesses ignore focus */
  }
  setShellInert(true);
}

function shake() {
  ui.stage.classList.remove("shake");
  void ui.stage.offsetWidth;
  ui.stage.classList.add("shake");
}

/* -------------------------------------------------------------- particles */

function burst(x, y, color) {
  if (REDUCED) return;
  for (let i = 0; i < 26; i += 1) {
    const angle = Math.random() * TAU;
    const speed = 40 + Math.random() * 230;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 1.5 + Math.random() * 2.5,
      color
    });
  }
}

function scorePop(x, y, gain) {
  if (REDUCED) return;
  state.pops.push({
    x,
    y: y - 12,
    text: scorePopText(gain),
    color: "#ffe28a",
    life: 1,
    vy: -55
  });
}

function updatePops(dt) {
  for (let i = state.pops.length - 1; i >= 0; i -= 1) {
    const pop = state.pops[i];
    pop.life -= dt * 1.4;
    if (pop.life <= 0) {
      state.pops.splice(i, 1);
      continue;
    }
    pop.y += pop.vy * dt;
    pop.vy += 80 * dt;
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.life -= dt * 1.6;
    if (particle.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    particle.vy += 520 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
  }
}

/* --------------------------------------------------------------- score card */

function trackedWidth(g, text, spacing) {
  let width = 0;
  for (const character of text) width += g.measureText(character).width + spacing;
  return Math.max(0, width - spacing);
}

function drawTracked(g, text, x, y, spacing) {
  let cursor = x;
  for (const character of text) {
    g.fillText(character, cursor, y);
    cursor += g.measureText(character).width + spacing;
  }
}

function drawTrackedCentered(g, text, cx, y, spacing) {
  drawTracked(g, text, cx - trackedWidth(g, text, spacing) / 2, y, spacing);
}

function drawCardBoard(g, x, y, board) {
  const n = 5;
  const cell = 62;
  const gap = 12;
  const span = n * cell + (n - 1) * gap;
  const base = (board && board.base) || "#6a59dd";
  const oddColor = (board && board.oddColor) || "#4fd1c5";
  const oddRow = board && board.n ? Math.min(n - 1, Math.floor(Math.floor(board.odd / board.n) * n / board.n)) : 1;
  const oddCol = board && board.n ? Math.min(n - 1, Math.floor((board.odd % board.n) * n / board.n)) : 3;

  const glow = g.createRadialGradient(
    x + span / 2, y + span / 2, 20,
    x + span / 2, y + span / 2, span * 0.75
  );
  glow.addColorStop(0, "rgba(139,124,255,0.20)");
  glow.addColorStop(1, "rgba(139,124,255,0)");
  g.fillStyle = glow;
  g.fillRect(x - 90, y - 90, span + 180, span + 180);

  g.fillStyle = "rgba(255,255,255,0.025)";
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.lineWidth = 1.5;
  traceRoundRect(g, x - 22, y - 22, span + 44, span + 44, 30);
  g.fill();
  g.stroke();

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const tx = x + col * (cell + gap);
      const ty = y + row * (cell + gap);
      const odd = row === oddRow && col === oddCol;
      g.fillStyle = odd ? oddColor : base;
      traceRoundRect(g, tx, ty, cell, cell, 16);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.07)";
      g.lineWidth = 1;
      g.stroke();
    }
  }

  g.fillStyle = "#6f6f88";
  g.font = '700 11px "Segoe UI", system-ui, sans-serif';
  drawTrackedCentered(g, "CAN YOU SEE IT?", x + span / 2, y + span + 58, 2.4);
}

function renderScoreCard(result) {
  const width = 1200;
  const height = 630;
  const card = document.createElement("canvas");
  card.width = width;
  card.height = height;
  const g = card.getContext("2d");
  if (!g) return "";
  const mode = MODES[result.mode] || MODES.focus;

  const background = g.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0c0c18");
  background.addColorStop(0.55, "#08080f");
  background.addColorStop(1, "#0d0a16");
  g.fillStyle = background;
  g.fillRect(0, 0, width, height);

  let glow = g.createRadialGradient(950, 90, 0, 950, 90, 520);
  glow.addColorStop(0, "rgba(139,124,255,0.34)");
  glow.addColorStop(1, "rgba(139,124,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);

  glow = g.createRadialGradient(160, 640, 0, 160, 640, 460);
  glow.addColorStop(0, "rgba(79,209,197,0.16)");
  glow.addColorStop(1, "rgba(79,209,197,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);

  g.strokeStyle = "rgba(255,255,255,0.10)";
  g.lineWidth = 2;
  traceRoundRect(g, 24, 24, width - 48, height - 48, 36);
  g.stroke();

  g.textBaseline = "alphabetic";
  g.textAlign = "left";

  const dot = g.createLinearGradient(70, 84, 92, 106);
  dot.addColorStop(0, "#8b7cff");
  dot.addColorStop(1, "#4fd1c5");
  g.fillStyle = dot;
  g.beginPath();
  g.arc(78, 92, 7, 0, TAU);
  g.fill();

  g.fillStyle = "#ececf5";
  g.font = '800 19px "Segoe UI", system-ui, sans-serif';
  drawTracked(g, "AFTERIMAGE", 96, 99, 5);

  const kicker = result.daily
    ? `DAILY #${result.dailyNumber} · ${result.won ? "COMPLETE" : "RUN OVER"}`
    : `${mode.label.toUpperCase()} · ${result.won ? "COMPLETE" : "RUN OVER"}`;
  g.fillStyle = "#4fd1c5";
  g.font = '700 15px "Segoe UI", system-ui, sans-serif';
  drawTracked(g, kicker, 72, 146, 2.5);

  g.fillStyle = "#ffffff";
  g.font = '800 132px "Segoe UI", system-ui, sans-serif';
  g.fillText(result.score.toLocaleString("en-US"), 66, 286);

  g.fillStyle = "#5d5d78";
  g.font = '700 14px "Segoe UI", system-ui, sans-serif';
  drawTracked(g, "POINTS", 72, 318, 3);

  g.font = '700 15px "Segoe UI", system-ui, sans-serif';
  const pillWidth = g.measureText(result.rating).width + 44;
  g.fillStyle = "rgba(139,124,255,0.14)";
  g.strokeStyle = "rgba(139,124,255,0.5)";
  g.lineWidth = 1.5;
  traceRoundRect(g, 72, 352, pillWidth, 42, 21);
  g.fill();
  g.stroke();
  g.fillStyle = "#cfc8ff";
  g.fillText(result.rating, 94, 379);

  const stats = [
    ["CLEARED", `${result.cleared}/${result.total}`],
    ["ACCURACY", `${result.accuracy}%`],
    ["BEST STREAK", String(result.bestStreak)]
  ];
  stats.forEach(([label, value], index) => {
    const x = 72 + index * 186;
    g.fillStyle = "#5d5d78";
    g.font = '700 11px "Segoe UI", system-ui, sans-serif';
    drawTracked(g, label, x, 462, 2.2);
    g.fillStyle = "#ececf5";
    g.font = '700 30px "Segoe UI", system-ui, sans-serif';
    g.fillText(value, x, 500);
  });

  if (result.isBest) {
    g.fillStyle = "#ffd479";
    g.font = '700 12px "Segoe UI", system-ui, sans-serif';
    drawTracked(g, result.daily ? "NEW DAILY BEST" : "NEW PERSONAL BEST", 72, 552, 2.6);
  }

  const cardProof = [
    result.bestTier ? `${result.bestTier} ×${result.bestStreak}` : "",
    Number(result.perfectBoards) > 0 ? `${result.perfectBoards} PERFECT` : "",
    Number(result.surgeBoards) > 0 ? `${result.surgeBoards} SURGE` : ""
  ].filter(Boolean).join(" · ");
  const hintCount = Number(result.hintsUsed) || 0;
  const hintSegment = hintCount > 0 ? ` · ${hintCount} HINT${hintCount === 1 ? "" : "S"}` : "";
  const footerBase = result.daily
    ? `${result.dailyLabel} · ${result.total} BOARDS · ONE DIFFERENCE${hintSegment}`
    : (hintCount > 0
      ? `${result.total} BOARDS · ONE DIFFERENCE${hintSegment}`
      : `${result.total} BOARDS · ONE DIFFERENCE · NO HINTS`);
  const footer = cardProof ? `${footerBase} · ${cardProof}` : footerBase;
  g.fillStyle = "#6f6f88";
  g.font = '600 12px "Segoe UI", system-ui, sans-serif';
  drawTracked(g, footer, 72, 592, 2);

  drawCardBoard(g, 780, 126, result.board);
  return card.toDataURL("image/png");
}

function saveCardFeedback(url) {
  return url
    ? { ok: true, message: "Download requested — check your downloads." }
    : { ok: false, message: "Card unavailable — Copy result still works." };
}

function showSaveStatus(message, error = false) {
  if (!ui.saveStatus) return;
  window.clearTimeout(saveStatusTimer);
  ui.saveStatus.textContent = message;
  ui.saveStatus.classList.toggle("error", Boolean(error));
  ui.saveStatus.hidden = !message;
  if (message) {
    saveStatusTimer = window.setTimeout(() => {
      ui.saveStatus.hidden = true;
    }, 5000);
  }
}

function saveScoreCard() {
  if (!state.result) return;

  let url = "";
  try {
    url = renderScoreCard(state.result);
  } catch {
    url = "";
  }
  const feedback = saveCardFeedback(url);
  showSaveStatus(feedback.message, !feedback.ok);
  if (!feedback.ok) {
    ui.saveCard.textContent = "Save card";
    ui.saveCard.disabled = false;
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = `afterimage-${state.result.mode}-${state.result.score}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  ui.saveCard.textContent = "Saved";
  ui.saveCard.disabled = true;
  window.setTimeout(() => {
    ui.saveCard.textContent = "Save card";
    ui.saveCard.disabled = false;
  }, 1600);
}

function buildShareText(result) {
  const mode = MODES[result.mode] || MODES.focus;
  const title = result.daily
    ? `Afterimage Daily #${result.dailyNumber}`
    : `Afterimage · ${mode.label}`;
  const proof = [];
  if (result.bestTier) proof.push(`${result.bestTier} ×${result.bestStreak}`);
  if (Number(result.perfectBoards) > 0) {
    proof.push(`${result.perfectBoards} perfect${result.perfectBoards === 1 ? "" : "s"}`);
  }
  if (Number(result.surgeBoards) > 0) {
    proof.push(`${result.surgeBoards} surge${result.surgeBoards === 1 ? "" : "s"}`);
  }
  if (Number(result.hintsUsed) > 0) {
    proof.push(`${result.hintsUsed} hint${result.hintsUsed === 1 ? "" : "s"}`);
  }
  const proofLine = proof.length ? ` · ${proof.join(" · ")}` : "";
  return [
    `${title} · ${result.rating}`,
    `${result.score.toLocaleString("en-US")} · ${result.cleared}/${result.total} · ${result.accuracy}%${proofLine}`,
    (result.boards || []).join(""),
    "Find the tile that doesn't belong."
  ].join("\n");
}

function copyFeedback(copied) {
  return copied
    ? { label: "Copied", fallback: false }
    : { label: "Copy blocked", fallback: true };
}

function showCopyFallback(text) {
  if (!ui.copyFallback || !ui.copyText) return;
  ui.copyText.value = text;
  ui.copyFallback.hidden = false;
  try {
    ui.copyText.focus({ preventScroll: true });
    ui.copyText.select();
  } catch {
    /* text selection is best-effort */
  }
}

function hideCopyFallback(restoreFocus = false) {
  if (!ui.copyFallback) return;
  ui.copyFallback.hidden = true;
  if (ui.copyText) ui.copyText.value = "";
  if (restoreFocus && ui.copyResult) {
    try {
      ui.copyResult.focus({ preventScroll: true });
    } catch {
      /* non-DOM harnesses ignore focus */
    }
  }
}

async function copyResult() {
  if (!state.result) return;
  const text = buildShareText(state.result);
  let copied = false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    if (ui.copyResult) {
      try {
        ui.copyResult.focus({ preventScroll: true });
      } catch {
        /* focus restoration is best-effort */
      }
    }
  }

  const feedback = copyFeedback(copied);
  if (feedback.fallback) {
    showCopyFallback(text);
  } else {
    hideCopyFallback();
  }
  ui.copyResult.textContent = feedback.label;
  ui.copyResult.disabled = false;
  window.setTimeout(() => {
    ui.copyResult.textContent = "Copy result";
  }, 1600);
}

/* ------------------------------------------------------------------ loop */

function ensureLoop() {
  if (raf) return;
  state.lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  if (state.phase !== "play" && state.phase !== "pause" && state.phase !== "reveal") return;

  const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;

  if (state.phase === "play" && state.timed) {
    state.remaining -= dt * 1000;
    if (state.remaining <= 0) {
      state.remaining = 0;
      updateTimer();
      timeout();
    } else {
      const whole = Math.ceil(state.remaining / 1000);
      if (whole <= 3 && whole >= 1 && whole !== state.lastTickSec) {
        state.lastTickSec = whole;
        tone(880, 0.05, "square", 0.018);
      }
    }
  }

  updateParticles(dt);
  updatePops(dt);
  paint();
  updateTimer();

  if (state.phase === "play" || state.phase === "pause" || state.phase === "reveal") {
    raf = requestAnimationFrame(frame);
  }
}

/* ----------------------------------------------------------------- input */

ui.cells.addEventListener("keydown", (event) => {
  const moves = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1]
  };
  const move = moves[event.key];
  if (!move) return;

  const active = document.activeElement;
  if (!active || !active.classList.contains("cell")) return;

  event.preventDefault();
  const n = state.n;
  const index = Number(active.dataset.i);
  const row = (Math.floor(index / n) + move[0] + n) % n;
  const col = ((index % n) + move[1] + n) % n;
  const next = ui.cells.children[row * n + col];
  if (!next) return;

  Array.from(ui.cells.children).forEach((cell) => {
    cell.tabIndex = -1;
  });
  next.tabIndex = 0;
  next.focus();
});

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => startRun(button.dataset.mode));
});

ui.dailyBtn.addEventListener("click", () => startRun("daily"));
ui.playAgain.addEventListener("click", () => startRun(state.mode));
ui.saveCard.addEventListener("click", saveScoreCard);
ui.copyResult.addEventListener("click", copyResult);
if (ui.copyClose) ui.copyClose.addEventListener("click", () => hideCopyFallback(true));
ui.changeMode.addEventListener("click", showMenu);
ui.quit.addEventListener("click", quitRun);
if (ui.hint) ui.hint.addEventListener("click", () => {
  ensureAudio();
  useHint();
});

function trapDialogFocus(event) {
  if (event.key !== "Tab" || ui.veil.hidden) return;
  const container = ui.over.hidden ? ui.menu : ui.over;
  if (!container) return;
  const focusables = Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (active === container || !container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", trapDialogFocus);

document.addEventListener("keydown", (event) => {
  if ((event.key === "h" || event.key === "H") && !event.metaKey && !event.ctrlKey) {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!ui.veil.hidden) return;
    if (state.phase === "play") {
      ensureAudio();
      useHint();
    }
  }
});

ui.skip.addEventListener("click", () => {
  if (state.mode !== "zen" || state.phase !== "play") return;
  state.skipped += 1;
  state.slump += 1;
  state.streak = 0;
  state.boards.push("⬜");
  renderHud();
  advance();
});

ui.sound.addEventListener("click", () => {
  state.muted = !state.muted;
  store.set("afterimage.muted", state.muted ? "1" : "0");
  renderSound();
  if (!state.muted) {
    ensureAudio();
    tone(720, 0.06, "sine", 0.03);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (tracksHiddenTime(state.timed, state.phase)) state.hiddenAt = performance.now();
  } else {
    if (state.hiddenAt != null) {
      const hiddenMs = performance.now() - state.hiddenAt;
      state.hiddenAt = null;
      const charged = hiddenReturn(state.remaining, hiddenMs, state.timed, state.phase);
      state.pendingHidden += charged.pending;
      state.remaining = charged.remaining;
      if (state.timed && state.phase === "play" && state.remaining <= 0) {
        state.remaining = 0;
        updateTimer();
        timeout();
      }
    }
    state.lastFrame = performance.now();
    renderDaily();
  }
});

let resizeTimer = 0;
const observer = new ResizeObserver(() => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!state.data) return;
    computeLayout();
    paint();
  }, 60);
});
observer.observe(ui.stage);

/* ------------------------------------------------------------------ boot */

renderBests();
renderDaily();
renderSound();
updateTimer();
ui.menu.hidden = false;
ui.over.hidden = true;
ui.veil.hidden = false;
ui.hud.hidden = true;
if (ui.hint) ui.hint.hidden = true;
if (ui.surge) ui.surge.hidden = true;
if (ui.final) ui.final.hidden = true;
if (ui.stage) ui.stage.classList.remove("finale");
try {
  ui.dailyBtn.focus({ preventScroll: true });
} catch {
  /* non-DOM harnesses ignore focus */
}
setShellInert(true);

const requestedMode = new URLSearchParams(window.location.search).get("mode");
if (requestedMode && Object.prototype.hasOwnProperty.call(MODES, requestedMode)) {
  startRun(requestedMode);
}
