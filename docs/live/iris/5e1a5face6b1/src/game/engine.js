export const RED = 1;
export const GREEN = 2;
export const BLUE = 4;

export const COLORS = Object.freeze({ r: RED, g: GREEN, b: BLUE });

export const COLOR_NAMES = Object.freeze({
  0: "none",
  1: "red",
  2: "green",
  3: "yellow",
  4: "blue",
  5: "magenta",
  6: "cyan",
  7: "white",
});

export const TARGET_MASKS = Object.freeze({
  r: RED,
  g: GREEN,
  b: BLUE,
  y: RED | GREEN,
  c: GREEN | BLUE,
  m: RED | BLUE,
  w: RED | GREEN | BLUE,
});

export const COLOR_KEYS = Object.freeze({
  0: "none",
  1: "r",
  2: "g",
  3: "y",
  4: "b",
  5: "m",
  6: "c",
  7: "w",
});

export const COLOR_LABELS = Object.freeze({
  r: "red",
  g: "green",
  b: "blue",
  y: "yellow",
  c: "cyan",
  m: "magenta",
  w: "white",
});

export const DIRECTIONS = Object.freeze({
  n: Object.freeze([0, -1]),
  e: Object.freeze([1, 0]),
  s: Object.freeze([0, 1]),
  w: Object.freeze([-1, 0]),
});

export const DIRECTION_NAMES = Object.freeze({
  n: "north",
  e: "east",
  s: "south",
  w: "west",
});

const MIRROR_REFLECTIONS = Object.freeze({
  "/": Object.freeze({ n: "e", e: "n", s: "w", w: "s" }),
  "\\": Object.freeze({ n: "w", e: "s", s: "e", w: "n" }),
});

const CHAR_TILES = Object.freeze({
  ".": null,
  "#": Object.freeze({ type: "wall" }),
  "/": Object.freeze({ type: "mirror", orientation: "/" }),
  "\\": Object.freeze({ type: "mirror", orientation: "\\" }),
  "1": Object.freeze({ type: "dye", color: "r" }),
  "2": Object.freeze({ type: "dye", color: "g" }),
  "3": Object.freeze({ type: "dye", color: "b" }),
});

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

export function mirrorKey(x, y) {
  return `${x},${y}`;
}

export function colorMask(key) {
  const mask = COLORS[key];
  assert(Number.isInteger(mask), `Unknown color key '${key}'.`);
  return mask;
}

export function targetMask(key) {
  const mask = TARGET_MASKS[key];
  assert(Number.isInteger(mask), `Unknown target key '${key}'.`);
  return mask;
}

export function colorName(mask) {
  return COLOR_NAMES[mask] ?? "none";
}

export function colorKey(mask) {
  return COLOR_KEYS[mask] ?? "none";
}

export function colorLabel(key) {
  return COLOR_LABELS[key] ?? "none";
}

export function colorOfMask(mask) {
  const key = colorKey(mask);
  assert(key !== "none", "A beam must carry at least one color.");
  return key;
}

export function rotateOrientation(orientation) {
  assert(orientation === "/" || orientation === "\\", `Unknown mirror orientation '${orientation}'.`);
  return orientation === "/" ? "\\" : "/";
}

export function reflect(direction, orientation) {
  const table = MIRROR_REFLECTIONS[orientation];
  assert(table, `Unknown mirror orientation '${orientation}'.`);
  const reflected = table[direction];
  assert(reflected, `Unknown direction '${direction}'.`);
  return reflected;
}

export function advance(point, direction) {
  const delta = DIRECTIONS[direction];
  assert(delta, `Unknown direction '${direction}'.`);
  return [point[0] + delta[0], point[1] + delta[1]];
}

export function inside(level, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 &&
    x < level.width && y < level.height;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildTiles(level) {
  const tiles = [];
  for (let y = 0; y < level.height; y += 1) {
    const row = [];
    for (let x = 0; x < level.width; x += 1) {
      const character = level.rows[y][x];
      assert(character in CHAR_TILES, `Level ${level.id} has an unknown symbol '${character}'.`);
      row.push(CHAR_TILES[character]);
    }
    tiles.push(row);
  }
  for (const emitter of level.emitters) {
    assert(tiles[emitter.y][emitter.x] === null,
      `Level ${level.id} puts emitter ${emitter.x},${emitter.y} on another tile.`);
    tiles[emitter.y][emitter.x] = Object.freeze({
      type: "emitter",
      color: emitter.color,
      direction: emitter.dir,
    });
  }
  for (const receiver of level.receivers) {
    assert(tiles[receiver.y][receiver.x] === null,
      `Level ${level.id} puts receiver ${receiver.x},${receiver.y} on another tile.`);
    tiles[receiver.y][receiver.x] = Object.freeze({
      type: "receiver",
      target: receiver.target,
    });
  }
  return Object.freeze(tiles.map((row) => Object.freeze(row)));
}

export function mirrorTiles(level) {
  const mirrors = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const character = level.rows[y][x];
      if (character === "/" || character === "\\") {
        mirrors.push(Object.freeze({ x, y, orientation: character }));
      }
    }
  }
  return Object.freeze(mirrors);
}

export function validateLevel(level) {
  assert(isRecord(level), "A level must be an object.");
  assert(typeof level.id === "string" && level.id.length > 0, "A level needs a non-empty id.");
  assert(typeof level.name === "string" && level.name.length > 0,
    `Level ${level.id} needs a non-empty name.`);
  assert(Number.isInteger(level.episode) && level.episode >= 1 && level.episode <= 3,
    `Level ${level.id} needs an episode from 1 to 3.`);
  assert(Number.isInteger(level.width) && level.width >= 3 && level.width <= 12,
    `Level ${level.id} needs a width from 3 to 12.`);
  assert(Number.isInteger(level.height) && level.height >= 3 && level.height <= 12,
    `Level ${level.id} needs a height from 3 to 12.`);
  assert(Array.isArray(level.rows) && level.rows.length === level.height,
    `Level ${level.id} needs ${level.height} rows.`);
  for (const row of level.rows) {
    assert(typeof row === "string" && row.length === level.width,
      `Level ${level.id} has a row that is not ${level.width} cells wide.`);
    for (const character of row) {
      assert(character in CHAR_TILES, `Level ${level.id} has an unknown symbol '${character}'.`);
    }
  }
  assert(Array.isArray(level.emitters) && level.emitters.length > 0,
    `Level ${level.id} needs at least one emitter.`);
  assert(Array.isArray(level.receivers) && level.receivers.length > 0,
    `Level ${level.id} needs at least one receiver.`);
  const occupied = new Set();
  for (const emitter of level.emitters) {
    assert(isRecord(emitter), `Level ${level.id} contains a non-object emitter.`);
    assert(inside(level, emitter.x, emitter.y),
      `Level ${level.id} has an emitter outside the board.`);
    assert(level.rows[emitter.y][emitter.x] === ".",
      `Level ${level.id} puts an emitter on ${emitter.x},${emitter.y}.`);
    assert(Object.hasOwn(COLORS, emitter.color),
      `Level ${level.id} has an emitter without a primary color.`);
    assert(Object.hasOwn(DIRECTIONS, emitter.dir),
      `Level ${level.id} has an emitter without a direction.`);
    const key = mirrorKey(emitter.x, emitter.y);
    assert(!occupied.has(key), `Level ${level.id} repeats a cell at ${key}.`);
    occupied.add(key);
  }
  for (const receiver of level.receivers) {
    assert(isRecord(receiver), `Level ${level.id} contains a non-object receiver.`);
    assert(inside(level, receiver.x, receiver.y),
      `Level ${level.id} has a receiver outside the board.`);
    assert(level.rows[receiver.y][receiver.x] === ".",
      `Level ${level.id} puts a receiver on ${receiver.x},${receiver.y}.`);
    assert(Object.hasOwn(COLOR_LABELS, receiver.target),
      `Level ${level.id} has a receiver without a valid target.`);
    const key = mirrorKey(receiver.x, receiver.y);
    assert(!occupied.has(key), `Level ${level.id} repeats a cell at ${key}.`);
    occupied.add(key);
  }
  const mirrors = mirrorTiles(level);
  assert(mirrors.length > 0, `Level ${level.id} needs at least one mirror.`);
  assert(Number.isInteger(level.par) && level.par >= 0 && level.par <= mirrors.length,
    `Level ${level.id} needs a par from 0 to ${mirrors.length}.`);
  assert(isRecord(level.solution), `Level ${level.id} needs a solution object.`);
  const mirrorKeys = new Set(mirrors.map((mirror) => mirrorKey(mirror.x, mirror.y)));
  const solutionKeys = Object.keys(level.solution); // aikit:allow-secret false positive: property names, not a credential
  assert(solutionKeys.length === mirrorKeys.size,
    `Level ${level.id} must give a solution orientation for every mirror.`);
  for (const key of solutionKeys) {
    assert(mirrorKeys.has(key), `Level ${level.id} solves a cell with no mirror: ${key}.`);
    const orientation = level.solution[key];
    assert(orientation === "/" || orientation === "\\",
      `Level ${level.id} has an invalid solution orientation at ${key}.`);
  }
  const tiles = buildTiles(level);
  return Object.freeze({ ...level, tiles });
}

export function createGame(level) {
  const prepared = level.tiles ? level : validateLevel(level);
  const orientations = {};
  for (const mirror of mirrorTiles(prepared)) {
    orientations[mirrorKey(mirror.x, mirror.y)] = mirror.orientation;
  }
  return Object.freeze({
    level: prepared,
    orientations: Object.freeze(orientations),
    moves: 0,
  });
}

export function resetGame(game) {
  return createGame(game.level);
}

export function mirrorAt(game, x, y) {
  if (!inside(game.level, x, y)) {
    return null;
  }
  const tile = game.tiles ? game.tiles[y][x] : game.level.tiles[y][x];
  return tile && tile.type === "mirror" ? tile : null;
}

export function orientationAt(game, x, y) {
  const tile = mirrorAt(game, x, y);
  return tile ? game.orientations[mirrorKey(x, y)] ?? tile.orientation : null;
}

export function rotateMirror(game, x, y) {
  const tile = mirrorAt(game, x, y);
  assert(tile, `There is no mirror at ${x},${y}.`);
  const key = mirrorKey(x, y);
  const current = orientationAt(game, x, y);
  const orientations = Object.freeze({
    ...game.orientations,
    [key]: rotateOrientation(current),
  });
  return Object.freeze({
    level: game.level,
    orientations,
    moves: game.moves + 1,
  });
}

export function mirrorsOfLevel(level) {
  return mirrorTiles(level);
}

function receiverState(receiver, colors) {
  const mask = [...colors].reduce((total, value) => total | value, 0);
  const target = targetMask(receiver.target);
  return Object.freeze({
    x: receiver.x,
    y: receiver.y,
    target: receiver.target,
    colors: Object.freeze([...colors].sort((a, b) => a - b)),
    mask,
    charged: colors.size > 0 && mask === target,
  });
}

export function traceGame(game) {
  const tiles = game.level.tiles;
  const hits = new Map();
  for (const receiver of game.level.receivers) {
    hits.set(mirrorKey(receiver.x, receiver.y), new Set());
  }
  const beams = [];
  for (const emitter of game.level.emitters) {
    let x = emitter.x;
    let y = emitter.y;
    let direction = emitter.dir;
    let color = colorMask(emitter.color);
    const points = [[x, y]];
    const edges = [];
    const seen = new Set([`${x},${y},${direction},${color}`]);
    const limit = game.level.width * game.level.height * 16;
    let steps = 0;
    while (steps < limit) {
      steps += 1;
      const delta = DIRECTIONS[direction];
      const nextX = x + delta[0];
      const nextY = y + delta[1];
      if (!inside(game.level, nextX, nextY)) {
        break;
      }
      edges.push(Object.freeze({ from: Object.freeze([x, y]), to: Object.freeze([nextX, nextY]), color }));
      x = nextX;
      y = nextY;
      points.push([x, y]);
      const tile = tiles[y][x];
      if (!tile) {
        const state = `${x},${y},${direction},${color}`;
        if (seen.has(state)) {
          break;
        }
        seen.add(state);
        continue;
      }
      if (tile.type === "wall" || tile.type === "emitter") {
        break;
      }
      if (tile.type === "dye") {
        color |= colorMask(tile.color);
        const state = `${x},${y},${direction},${color}`;
        if (seen.has(state)) {
          break;
        }
        seen.add(state);
        continue;
      }
      if (tile.type === "mirror") {
        direction = reflect(direction, orientationAt(game, x, y));
        const state = `${x},${y},${direction},${color}`;
        if (seen.has(state)) {
          break;
        }
        seen.add(state);
        continue;
      }
      if (tile.type === "receiver") {
        hits.get(mirrorKey(x, y)).add(color);
        break;
      }
    }
    beams.push(Object.freeze({
      emitter,
      points: Object.freeze(points.map((point) => Object.freeze(point))),
      edges: Object.freeze(edges),
    }));
  }
  const receivers = game.level.receivers.map((receiver) =>
    receiverState(receiver, hits.get(mirrorKey(receiver.x, receiver.y)) ?? new Set()));
  return Object.freeze({
    beams: Object.freeze(beams),
    receivers: Object.freeze(receivers),
    solved: receivers.length > 0 && receivers.every((receiver) => receiver.charged),
    charged: receivers.filter((receiver) => receiver.charged).length,
  });
}

export function isSolved(game) {
  return traceGame(game).solved;
}

export function moveCountToSolution(level) {
  let moves = 0;
  for (const mirror of mirrorTiles(level)) {
    const key = mirrorKey(mirror.x, mirror.y);
    if (level.solution[key] !== mirror.orientation) {
      moves += 1;
    }
  }
  return moves;
}

export function applySolution(level) {
  let game = createGame(level);
  for (const mirror of mirrorTiles(level)) {
    const key = mirrorKey(mirror.x, mirror.y);
    if (orientationAt(game, mirror.x, mirror.y) !== level.solution[key]) {
      game = rotateMirror(game, mirror.x, mirror.y);
    }
  }
  return game;
}
