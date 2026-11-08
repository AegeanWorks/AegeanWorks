import { parseLevel, traceBeams } from "./engine.js";

function popcount(value) {
  let count = 0;
  let bits = value;
  while (bits > 0) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
}

export function solveLevel(level) {
  const board = parseLevel(level);
  const rotatableCount = board.rotatables.length;
  if (rotatableCount > 20) {
    throw new Error("Levels with more than 20 rotatable pieces need a different solver.");
  }
  const initialMask = board.rotatables.reduce(
    (mask, piece, index) => mask | (piece.orientation << index),
    0,
  );
  const total = 1 << rotatableCount;
  let best = null;
  let examined = 0;

  for (let mask = 0; mask < total; mask += 1) {
    for (let index = 0; index < rotatableCount; index += 1) {
      board.rotatables[index].orientation = (mask >> index) & 1;
    }
    examined += 1;
    const trace = traceBeams(board);
    if (!trace.complete) {
      continue;
    }
    const moves = popcount(mask ^ initialMask);
    if (best === null || moves < best.moves) {
      best = {
        moves,
        orientations: board.rotatables.map((piece) => piece.orientation),
        sameAsInitial: moves === 0,
      };
    }
  }

  for (let index = 0; index < rotatableCount; index += 1) {
    board.rotatables[index].orientation = (initialMask >> index) & 1;
  }

  return best === null ? null : { ...best, examined };
}

export function applySolution(level, orientations) {
  const board = parseLevel(level);
  if (orientations.length !== board.rotatables.length) {
    throw new Error("The solution does not cover every rotatable piece.");
  }
  board.rotatables.forEach((piece, index) => {
    piece.orientation = orientations[index];
  });
  return traceBeams(board);
}
