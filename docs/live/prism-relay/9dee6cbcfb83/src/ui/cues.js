import { cellNear } from "../game/engine.js";

export function portalTransitKey(board, paths = []) {
  const keys = new Set();
  for (const path of paths) {
    const end = path?.points?.[path.points.length - 1];
    if (!end) {
      continue;
    }
    const cell = cellNear(board, end);
    if (cell?.kind === "portal") {
      keys.add(`${cell.x},${cell.y}`);
    }
  }
  return [...keys].sort().join("|");
}

export function livePortalPairs(board, paths = []) {
  const pairs = new Set();
  for (const key of portalTransitKey(board, paths).split("|")) {
    if (!key) {
      continue;
    }
    const [x, y] = key.split(",").map(Number);
    const cell = board?.cells?.[y]?.[x];
    if (cell?.kind === "portal") {
      pairs.add(cell.pair);
    }
  }
  return [...pairs].sort();
}

export function newlyLitKeys(before = new Set(), after = new Set()) {
  return [...after].filter((key) => !before.has(key));
}

export function feedbackFor(before = {}, after = {}) {
  return {
    charge: (after?.lit ?? 0) > (before?.lit ?? 0),
    portal: (after?.portalKey ?? "") !== (before?.portalKey ?? ""),
  };
}
