import { LEVELS, TOTAL_LEVELS, TOTAL_STARS } from "../game/levels.js";

export const PROGRESS_KEY = "prism-relay.progress.v1";
export const PROGRESS_VERSION = 1;
export const SIGILS = Object.freeze(["prism", "orbit", "pulse", "helix"]);
export const DEFAULT_CALLSIGN = "OPERATOR";
const MAX_CALLSIGN = 18;

function defaultProfile() {
  return { callsign: DEFAULT_CALLSIGN, sigil: "prism" };
}

function blankProgress() {
  return {
    version: PROGRESS_VERSION,
    sound: true,
    music: true,
    profile: defaultProfile(),
    unlocked: ["first-light"],
    best: {},
  };
}

export function normalizeCallsign(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_CALLSIGN);
  return text || DEFAULT_CALLSIGN;
}

export function normalizeSigil(value) {
  return SIGILS.includes(value) ? value : "prism";
}

export function normalizeProgress(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== PROGRESS_VERSION) {
    return blankProgress();
  }
  const known = new Set(LEVELS.map((level) => level.id));
  const best = {};
  if (raw.best && typeof raw.best === "object") {
    for (const [levelId, result] of Object.entries(raw.best)) {
      if (
        known.has(levelId) &&
        result &&
        Number.isInteger(result.moves) &&
        result.moves >= 0 &&
        Number.isInteger(result.stars) &&
        result.stars >= 1 &&
        result.stars <= 3
      ) {
        best[levelId] = { moves: result.moves, stars: result.stars };
      }
    }
  }
  const unlocked = new Set(
    Array.isArray(raw.unlocked)
      ? raw.unlocked.filter((id) => typeof id === "string" && known.has(id))
      : [],
  );
  unlocked.add("first-light");
  for (let index = 1; index < LEVELS.length; index += 1) {
    if (best[LEVELS[index - 1].id]) {
      unlocked.add(LEVELS[index].id);
    }
  }
  const profile = raw.profile && typeof raw.profile === "object" ? raw.profile : {};
  return {
    version: PROGRESS_VERSION,
    sound: raw.sound !== false,
    music: raw.music !== false,
    profile: {
      callsign: normalizeCallsign(profile.callsign),
      sigil: normalizeSigil(profile.sigil),
    },
    unlocked: [...unlocked],
    best,
  };
}

export function loadProgress(storage) {
  if (!storage) {
    return blankProgress();
  }
  try {
    const text = storage.getItem(PROGRESS_KEY);
    if (!text) {
      return blankProgress();
    }
    return normalizeProgress(JSON.parse(text));
  } catch {
    return blankProgress();
  }
}

export function saveProgress(storage, progress) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

function betterResult(previous, moves, stars) {
  if (!previous) {
    return true;
  }
  if (stars !== previous.stars) {
    return stars > previous.stars;
  }
  return moves < previous.moves;
}

export function recordResult(progress, levelId, moves, stars, nextLevelId = null) {
  const next = normalizeProgress(progress);
  if (betterResult(next.best[levelId], moves, stars)) {
    next.best[levelId] = { moves, stars };
  }
  if (nextLevelId && !next.unlocked.includes(nextLevelId)) {
    next.unlocked.push(nextLevelId);
  }
  return normalizeProgress(next);
}

export function setSound(progress, enabled) {
  const next = normalizeProgress(progress);
  next.sound = Boolean(enabled);
  return next;
}

export function setMusic(progress, enabled) {
  const next = normalizeProgress(progress);
  next.music = Boolean(enabled);
  return next;
}

export function updateProfile(progress, patch = {}) {
  const next = normalizeProgress(progress);
  next.profile = {
    callsign: normalizeCallsign(patch.callsign ?? next.profile.callsign),
    sigil: normalizeSigil(patch.sigil ?? next.profile.sigil),
  };
  return next;
}

export function totalStars(progress) {
  return Object.values(normalizeProgress(progress).best).reduce(
    (total, result) => total + result.stars,
    0,
  );
}

export function statsFor(progress) {
  const normalized = normalizeProgress(progress);
  const results = Object.values(normalized.best);
  return {
    completed: results.length,
    perfect: results.filter((result) => result.stars === 3).length,
    stars: results.reduce((total, result) => total + result.stars, 0),
    moves: results.reduce((total, result) => total + result.moves, 0),
    totalLevels: TOTAL_LEVELS,
    totalStars: TOTAL_STARS,
  };
}

export function rankFor(stars) {
  const value = Number.isFinite(stars) ? Math.max(0, Math.floor(stars)) : 0;
  if (value >= TOTAL_STARS) {
    return "Relay Master";
  }
  if (value >= 32) {
    return "Lumen";
  }
  if (value >= 23) {
    return "Architect";
  }
  if (value >= 14) {
    return "Weaver";
  }
  if (value >= 6) {
    return "Operator";
  }
  return "Cadet";
}

export function isUnlocked(progress, levelId) {
  return normalizeProgress(progress).unlocked.includes(levelId);
}
