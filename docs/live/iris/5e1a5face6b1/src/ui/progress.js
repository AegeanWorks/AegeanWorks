/**
 * Iris's versioned local progress.
 *
 * The module takes a storage object, so the same rules run against
 * localStorage in the browser and a small fake in the tests. A missing,
 * corrupt or future-versioned record resets to a safe default instead of
 * throwing, and older records keep whatever fields still make sense.
 */

export const STORAGE_KEY = "iris.progress.v1";
export const PROGRESS_VERSION = 1;

export function defaultProgress() {
  return {
    version: PROGRESS_VERSION,
    solved: {},
    settings: { sound: true },
    lastLevel: null,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStars(value) {
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : 1;
}

function normalizeEntry(entry) {
  if (!isRecord(entry)) {
    return null;
  }
  const bestMoves =
    Number.isInteger(entry.bestMoves) && entry.bestMoves >= 0
      ? entry.bestMoves
      : null;
  if (bestMoves === null) {
    return null;
  }
  return {
    bestMoves,
    stars: normalizeStars(entry.stars),
    hints: Number.isInteger(entry.hints) && entry.hints >= 0 ? entry.hints : 0,
    at: typeof entry.at === "string" && entry.at.length > 0 ? entry.at : null,
  };
}

export function normalizeProgress(value) {
  const base = defaultProgress();
  if (!isRecord(value) || value.version !== PROGRESS_VERSION) {
    return base;
  }

  const solved = {};
  if (isRecord(value.solved)) {
    for (const [levelId, entry] of Object.entries(value.solved)) {
      if (typeof levelId !== "string" || levelId.length === 0) {
        continue;
      }
      const normalized = normalizeEntry(entry);
      if (normalized) {
        solved[levelId] = normalized;
      }
    }
  }

  const settings = { sound: true };
  if (isRecord(value.settings) && typeof value.settings.sound === "boolean") {
    settings.sound = value.settings.sound;
  }

  return {
    version: PROGRESS_VERSION,
    solved,
    settings,
    lastLevel:
      typeof value.lastLevel === "string" && value.lastLevel.length > 0
        ? value.lastLevel
        : null,
  };
}

export function loadProgress(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultProgress();
    }
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    store?.setItem(STORAGE_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a finished chamber. A better run (more stars, or equal stars in fewer
 * moves) replaces the stored best; a worse run never erases it.
 */
export function recordSolve(progress, levelId, result) {
  const current = normalizeProgress(progress);
  if (typeof levelId !== "string" || levelId.length === 0) {
    return current;
  }
  if (!Number.isInteger(result?.moves) || result.moves < 0) {
    return current;
  }
  const entry = normalizeEntry({
    bestMoves: result.moves,
    stars: result?.stars,
    hints: Number.isInteger(result?.hints) ? result.hints : 0,
    at: typeof result?.at === "string" ? result.at : new Date().toISOString(),
  });
  if (!entry) {
    return current;
  }
  const previous = current.solved[levelId];
  const solved = { ...current.solved };
  const better =
    !previous ||
    entry.stars > previous.stars ||
    (entry.stars === previous.stars && entry.bestMoves < previous.bestMoves);
  if (better) {
    solved[levelId] = entry;
  }
  return {
    ...current,
    solved,
    lastLevel: levelId,
  };
}

export function isUnlocked(progress, levels, levelId) {
  const index = levels.findIndex((level) => level.id === levelId);
  if (index < 0) {
    return false;
  }
  if (index === 0) {
    return true;
  }
  const current = normalizeProgress(progress);
  return Boolean(current.solved[levelId] ?? current.solved[levels[index - 1].id]);
}

export function solvedCount(progress) {
  return Object.keys(normalizeProgress(progress).solved).length;
}

export function starCount(progress) {
  return Object.values(normalizeProgress(progress).solved).reduce(
    (total, entry) => total + entry.stars,
    0,
  );
}

export function bestFor(progress, levelId) {
  return normalizeProgress(progress).solved[levelId] ?? null;
}

export function nextUnsolved(progress, levels) {
  const current = normalizeProgress(progress);
  return levels.find((level) => !current.solved[level.id]) ?? null;
}

export function ratingFor(moves, par) {
  if (!Number.isInteger(moves) || !Number.isInteger(par) || par < 0) {
    return 1;
  }
  if (moves <= par) {
    return 3;
  }
  if (moves <= par + 2) {
    return 2;
  }
  return 1;
}

export function rankFor(stars, totalStars) {
  if (!Number.isFinite(stars) || !Number.isFinite(totalStars) || stars < 0 || totalStars < 0) {
    return "Novice";
  }
  const ratio = totalStars > 0 ? stars / totalStars : 0;
  const ranks = [
    [1, "Spectroscopist"],
    [0.85, "Luminist"],
    [0.65, "Colorist"],
    [0.45, "Mixer"],
    [0.2, "Apprentice"],
    [0, "Novice"],
  ];
  return ranks.find(([threshold]) => ratio >= threshold)[1];
}
