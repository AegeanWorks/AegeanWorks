import {
  createGame,
  mirrorKey,
  mirrorTiles,
  orientationAt,
  rotateMirror,
  traceGame,
  validateLevel,
} from "./engine.js";

export function mirrorsOf(level) {
  return mirrorTiles(level);
}

export function solutionStates(level) {
  return Object.freeze({ ...level.solution });
}

export function solutionMoves(level) {
  const prepared = validateLevel(level);
  let moves = 0;
  for (const mirror of mirrorTiles(prepared)) {
    if (prepared.solution[mirrorKey(mirror.x, mirror.y)] !== mirror.orientation) {
      moves += 1;
    }
  }
  return moves;
}

export function solveLevel(level, options = {}) {
  const opts = options ?? {};
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new RangeError(`Search limit must be a whole number of at least 1, not '${opts.limit}'.`);
  }
  const prepared = validateLevel(level);
  const mirrors = mirrorTiles(prepared);
  const limit = Number.isInteger(opts.limit) ? opts.limit : 2 ** mirrors.length;
  const total = Math.min(limit, 2 ** mirrors.length);
  let best = null;
  for (let mask = 0; mask < total; mask += 1) {
    let game = createGame(prepared);
    const states = {};
    let moves = 0;
    for (let index = 0; index < mirrors.length; index += 1) {
      const mirror = mirrors[index];
      const key = mirrorKey(mirror.x, mirror.y);
      const wanted = (mask >> index) & 1 ? "\\" : "/";
      states[key] = wanted;
      if (orientationAt(game, mirror.x, mirror.y) !== wanted) {
        game = rotateMirror(game, mirror.x, mirror.y);
        moves += 1;
      }
    }
    if (best && moves >= best.par) {
      continue;
    }
    if (traceGame(game).solved) {
      best = { par: moves, states: Object.freeze(states) };
    }
  }
  return Object.freeze({
    par: best ? best.par : null,
    states: best ? best.states : null,
    mirrors: mirrors.length,
    searched: total,
    truncated: total < 2 ** mirrors.length,
  });
}

export function solutionIsOptimal(level) {
  const solved = solveLevel(level);
  return solved.par !== null && solved.par === solutionMoves(level);
}
