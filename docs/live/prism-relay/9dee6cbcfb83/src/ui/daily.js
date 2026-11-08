import { LEVELS } from "../game/levels.js";

export const DAILY_KEY = "prism-relay.daily.v1";
export const DAILY_VERSION = 1;
const MAX_DAYS = 60;
const MAX_STREAK = 3650;
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / 86400000);
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function blankDaily() {
  return {
    version: DAILY_VERSION,
    days: {},
    streak: { count: 0, last: null, best: 0 },
  };
}

function parseKey(key) {
  if (typeof key !== "string") {
    return null;
  }
  const match = DATE_PATTERN.exec(key);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) {
    return null;
  }
  const stamp = Date.UTC(year, month - 1, date);
  const value = new Date(stamp);
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== date
  ) {
    return null;
  }
  return { year, month, date, dayNumber: Math.floor(stamp / 86400000) };
}

function formatKey(year, monthIndex, date) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function levelIndexForDay(dayNumber) {
  return ((dayNumber - EPOCH_DAY) % LEVELS.length + LEVELS.length) % LEVELS.length;
}

export function dateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "";
  }
  return formatKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function previousDateKey(key) {
  const parsed = parseKey(key);
  if (!parsed) {
    return "";
  }
  const previous = new Date((parsed.dayNumber - 1) * 86400000);
  return formatKey(previous.getUTCFullYear(), previous.getUTCMonth(), previous.getUTCDate());
}

export function dailyLevelIdForKey(key) {
  const parsed = parseKey(key);
  if (!parsed) {
    return LEVELS[0].id;
  }
  return LEVELS[levelIndexForDay(parsed.dayNumber)].id;
}

export function dailyLevelId(date = new Date()) {
  return dailyLevelIdForKey(dateKey(date));
}

export function dailyDateLabelForKey(key) {
  const parsed = parseKey(key);
  if (!parsed) {
    return "TODAY";
  }
  return `${String(parsed.date).padStart(2, "0")} ${MONTHS[parsed.month - 1]}`;
}

export function dailyDateLabel(date = new Date()) {
  return dailyDateLabelForKey(dateKey(date));
}

export function normalizeDaily(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== DAILY_VERSION) {
    return blankDaily();
  }
  const days = {};
  if (raw.days && typeof raw.days === "object") {
    for (const [key, result] of Object.entries(raw.days)) {
      if (
        parseKey(key) &&
        result &&
        Number.isInteger(result.moves) &&
        result.moves >= 0 &&
        Number.isInteger(result.stars) &&
        result.stars >= 1 &&
        result.stars <= 3
      ) {
        days[key] = { moves: result.moves, stars: result.stars };
      }
    }
  }
  const kept = {};
  for (const key of Object.keys(days).sort().slice(-MAX_DAYS)) {
    kept[key] = days[key];
  }
  let count = 0;
  let last = null;
  let best = 0;
  if (
    raw.streak &&
    typeof raw.streak === "object" &&
    Number.isInteger(raw.streak.count) &&
    raw.streak.count > 0 &&
    parseKey(raw.streak.last)
  ) {
    count = Math.min(raw.streak.count, MAX_STREAK);
    last = raw.streak.last;
    best = Math.min(
      Math.max(
        Number.isInteger(raw.streak.best) && raw.streak.best > 0
          ? raw.streak.best
          : count,
        count,
      ),
      MAX_STREAK,
    );
  }
  return {
    version: DAILY_VERSION,
    days: kept,
    streak: { count, last, best },
  };
}

export function loadDaily(storage) {
  if (!storage) {
    return blankDaily();
  }
  try {
    const text = storage.getItem(DAILY_KEY);
    if (!text) {
      return blankDaily();
    }
    return normalizeDaily(JSON.parse(text));
  } catch {
    return blankDaily();
  }
}

export function saveDaily(storage, daily) {
  if (!storage) {
    return false;
  }
  try {
    const existing = storage.getItem(DAILY_KEY);
    if (existing) {
      let previous = null;
      try {
        previous = JSON.parse(existing);
      } catch {
        previous = null;
      }
      if (
        previous &&
        typeof previous === "object" &&
        Number.isInteger(previous.version) &&
        previous.version > DAILY_VERSION
      ) {
        return false;
      }
    }
    storage.setItem(DAILY_KEY, JSON.stringify(normalizeDaily(daily)));
    return true;
  } catch {
    return false;
  }
}

export function dailySummary(daily, date = new Date()) {
  const normalized = normalizeDaily(daily);
  const key = dateKey(date);
  const alive =
    normalized.streak.last === key ||
    normalized.streak.last === previousDateKey(key);
  return {
    date: key,
    levelId: dailyLevelIdForKey(key),
    label: dailyDateLabelForKey(key),
    result: normalized.days[key] ?? null,
    streak: alive ? normalized.streak.count : 0,
    totalDays: Object.keys(normalized.days).length,
  };
}

export function dailyStats(daily) {
  const normalized = normalizeDaily(daily);
  const keys = Object.keys(normalized.days).sort();
  let run = 0;
  let best = 0;
  let previous = null;
  for (const key of keys) {
    run = previous && previousDateKey(key) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return {
    totalDays: keys.length,
    bestStreak: Math.max(best, normalized.streak.best, normalized.streak.count),
  };
}

export function dailyHistory(daily, date = new Date(), length = 7) {
  const normalized = normalizeDaily(daily);
  const today = dateKey(date);
  if (!today) {
    return [];
  }
  const count = Number.isInteger(length) ? Math.min(Math.max(length, 1), 30) : 7;
  const keys = [today];
  while (keys.length < count) {
    const previous = previousDateKey(keys[keys.length - 1]);
    if (!previous) {
      break;
    }
    keys.push(previous);
  }
  return keys.reverse().map((key) => ({
    key,
    label: dailyDateLabelForKey(key),
    played: Boolean(normalized.days[key]),
    today: key === today,
  }));
}

export function recordDailyResult(daily, key, levelId, moves, stars) {
  const normalized = normalizeDaily(daily);
  if (
    !parseKey(key) ||
    dailyLevelIdForKey(key) !== levelId ||
    !Number.isInteger(moves) ||
    moves < 0 ||
    !Number.isInteger(stars) ||
    stars < 1 ||
    stars > 3
  ) {
    return normalized;
  }
  const days = { ...normalized.days };
  const previous = days[key] ?? null;
  if (
    !previous ||
    stars > previous.stars ||
    (stars === previous.stars && moves < previous.moves)
  ) {
    days[key] = { moves, stars };
  }
  let streak = normalized.streak;
  if (!previous) {
    const count =
      normalized.streak.last === previousDateKey(key) && normalized.streak.count > 0
        ? normalized.streak.count + 1
        : 1;
    streak = {
      count,
      last: key,
      best: Math.max(normalized.streak.best, count),
    };
  }
  return normalizeDaily({ version: DAILY_VERSION, days, streak });
}
