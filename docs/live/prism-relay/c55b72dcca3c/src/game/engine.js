export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

export const DELTAS = Object.freeze([
  Object.freeze([0, -1]),
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([-1, 0]),
]);

const EMITTER_DIRECTIONS = Object.freeze({
  "^": NORTH,
  ">": EAST,
  v: SOUTH,
  "<": WEST,
});

export function parseLevel(level) {
  if (!level || !Array.isArray(level.rows) || level.rows.length === 0) {
    throw new Error("A level needs at least one row.");
  }
  const height = level.rows.length;
  const width = level.rows[0].length;
  if (width === 0) {
    throw new Error("A level needs at least one column.");
  }
  if (level.rows.some((row) => typeof row !== "string" || row.length !== width)) {
    throw new Error(`Level ${level.id ?? "(unnamed)"} must be rectangular.`);
  }

  const cells = [];
  const mirrors = [];
  const splitters = [];
  const emitters = [];
  const receivers = [];
  const prisms = [];
  const portals = [];
  const walls = [];
  const rotatables = [];

  for (let y = 0; y < height; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      const glyph = level.rows[y][x];
      const cell = { x, y, kind: "floor", orientation: 0, direction: null, pair: null };
      if (glyph === "#") {
        cell.kind = "wall";
        walls.push(cell);
      } else if (glyph === "/") {
        cell.kind = "mirror";
        cell.orientation = 0;
        mirrors.push(cell);
        rotatables.push(cell);
      } else if (glyph === "\\") {
        cell.kind = "mirror";
        cell.orientation = 1;
        mirrors.push(cell);
        rotatables.push(cell);
      } else if (glyph === "S") {
        cell.kind = "splitter";
        cell.orientation = 0;
        splitters.push(cell);
        rotatables.push(cell);
      } else if (glyph === "Z") {
        cell.kind = "splitter";
        cell.orientation = 1;
        splitters.push(cell);
        rotatables.push(cell);
      } else if (glyph === "*") {
        cell.kind = "prism";
        prisms.push(cell);
      } else if (glyph === "T") {
        cell.kind = "receiver";
        receivers.push(cell);
      } else if (glyph in EMITTER_DIRECTIONS) {
        cell.kind = "emitter";
        cell.direction = EMITTER_DIRECTIONS[glyph];
        emitters.push(cell);
      } else if (glyph >= "1" && glyph <= "4") {
        cell.kind = "portal";
        cell.pair = glyph;
        portals.push(cell);
      } else if (glyph !== ".") {
        throw new Error(`Unknown tile '${glyph}' in level ${level.id ?? "(unnamed)"}.`);
      }
      row.push(cell);
    }
    cells.push(row);
  }

  for (const portal of portals) {
    const peers = portals.filter((candidate) => candidate.pair === portal.pair);
    if (peers.length !== 2) {
      throw new Error(
        `Level ${level.id ?? "(unnamed)"} needs exactly two portals labelled '${portal.pair}'.`,
      );
    }
  }
  if (emitters.length === 0) {
    throw new Error(`Level ${level.id ?? "(unnamed)"} has no emitter.`);
  }
  if (receivers.length === 0) {
    throw new Error(`Level ${level.id ?? "(unnamed)"} has no receiver.`);
  }

  return Object.freeze({
    width,
    height,
    cells,
    mirrors,
    splitters,
    rotatables,
    emitters,
    receivers,
    prisms,
    portals,
    walls,
  });
}

export function cellAt(board, x, y) {
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) {
    return null;
  }
  return board.cells[y][x];
}

export function reflect(orientation, direction) {
  return orientation === 0 ? direction ^ 1 : direction ^ 3;
}

export function centerOf(cell) {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function boundaryPoint(cell, direction) {
  const [dx, dy] = DELTAS[direction];
  return { x: cell.x + 0.5 + dx * 0.5, y: cell.y + 0.5 + dy * 0.5 };
}

export function portalExit(board, portal) {
  return board.portals.find(
    (candidate) => candidate !== portal && candidate.pair === portal.pair,
  ) ?? null;
}

export function traceBeams(board) {
  const paths = [];
  const lit = new Set();
  const visited = new Set();
  const stack = board.emitters.map((emitter, source) => ({
    x: emitter.x,
    y: emitter.y,
    direction: emitter.direction,
    source,
    points: [centerOf(emitter)],
  }));

  while (stack.length > 0) {
    const beam = stack.pop();
    let { x, y, direction } = beam;
    const { source } = beam;
    const points = beam.points.slice();

    while (true) {
      const [dx, dy] = DELTAS[direction];
      const nx = x + dx;
      const ny = y + dy;
      const next = cellAt(board, nx, ny);

      if (!next || next.kind === "wall") {
        points.push(boundaryPoint({ x, y }, direction));
        paths.push({ points, source });
        break;
      }

      const key = `${nx},${ny},${direction}`;
      if (visited.has(key)) {
        paths.push({ points, source });
        break;
      }
      visited.add(key);

      if (next.kind === "receiver") {
        points.push(centerOf(next));
        lit.add(`${nx},${ny}`);
        paths.push({ points, source });
        break;
      }

      if (next.kind === "emitter") {
        points.push(centerOf(next));
        paths.push({ points, source });
        break;
      }

      points.push(centerOf(next));

      if (next.kind === "mirror") {
        direction = reflect(next.orientation, direction);
        x = nx;
        y = ny;
        continue;
      }

      if (next.kind === "splitter") {
        const turn = next.orientation === 0 ? 1 : 3;
        stack.push({
          x: nx,
          y: ny,
          direction: (direction + turn) % 4,
          source,
          points: [centerOf(next)],
        });
        x = nx;
        y = ny;
        continue;
      }

      if (next.kind === "portal") {
        paths.push({ points, source });
        const exit = portalExit(board, next);
        if (!exit) {
          break;
        }
        const exitKey = `${exit.x},${exit.y},${direction}`;
        if (visited.has(exitKey)) {
          break;
        }
        visited.add(exitKey);
        stack.push({
          x: exit.x,
          y: exit.y,
          direction,
          source,
          points: [centerOf(exit)],
        });
        break;
      }

      if (next.kind === "prism") {
        for (const turn of [1, 3]) {
          stack.push({
            x: nx,
            y: ny,
            direction: (direction + turn) % 4,
            source,
            points: [centerOf(next)],
          });
        }
        x = nx;
        y = ny;
        continue;
      }

      x = nx;
      y = ny;
    }
  }

  return Object.freeze({
    paths,
    lit,
    litCount: lit.size,
    complete: board.receivers.length > 0 && board.receivers.every((r) => lit.has(`${r.x},${r.y}`)),
  });
}

export function rotateAt(board, x, y) {
  const cell = cellAt(board, x, y);
  if (!cell || (cell.kind !== "mirror" && cell.kind !== "splitter")) {
    return false;
  }
  cell.orientation = cell.orientation === 0 ? 1 : 0;
  return true;
}

export function createSession(level) {
  const board = parseLevel(level);
  return {
    level,
    board,
    moves: 0,
    complete: false,
    stars: 0,
    litCount: 0,
    paths: [],
  };
}

export function refreshSession(session) {
  const trace = traceBeams(session.board);
  session.paths = trace.paths;
  session.litCount = trace.litCount;
  session.complete = trace.complete;
  if (session.complete) {
    session.stars = starsFor(session.moves, session.level.par);
  }
  return session;
}

export function rotateSessionCell(session, x, y) {
  if (!rotateAt(session.board, x, y)) {
    return false;
  }
  session.moves += 1;
  session.complete = false;
  session.stars = 0;
  refreshSession(session);
  return true;
}

export function resetSession(session) {
  const fresh = createSession(session.level);
  session.board = fresh.board;
  session.moves = 0;
  session.complete = false;
  session.stars = 0;
  session.litCount = 0;
  session.paths = [];
  refreshSession(session);
  return session;
}

export function starsFor(moves, par) {
  if (moves <= par) {
    return 3;
  }
  if (moves <= par + 2) {
    return 2;
  }
  return 1;
}

export function orientationKey(board) {
  return board.rotatables.map((piece) => piece.orientation).join("");
}
