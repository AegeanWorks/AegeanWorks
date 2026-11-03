const IGNITION_LEVELS = Object.freeze([
  Object.freeze({
    id: "first-light",
    name: "First Light",
    chapter: "01",
    subtitle: "Wake the receiver with a single reflection.",
    par: 1,
    rows: Object.freeze([
      ".......",
      "...T...",
      ".......",
      ">..\\...",
      ".......",
      ".......",
      ".......",
    ]),
  }),
  Object.freeze({
    id: "split-decision",
    name: "Split Decision",
    chapter: "02",
    subtitle: "A prism divides the signal. Send both halves home.",
    par: 2,
    rows: Object.freeze([
      "........",
      "........",
      "....\\.T.",
      "........",
      ">...*...",
      "........",
      "..../.T.",
      "........",
    ]),
  }),
  Object.freeze({
    id: "mirror-maze",
    name: "Mirror Maze",
    chapter: "03",
    subtitle: "Three branches, three choices, one clean circuit.",
    par: 3,
    rows: Object.freeze([
      ".........",
      "......T..",
      "..\\....T.",
      ".........",
      ">.*...\\..",
      ".........",
      "../....T.",
      ".........",
      ".........",
    ]),
  }),
  Object.freeze({
    id: "switchback",
    name: "Switchback",
    chapter: "04",
    subtitle: "Thread the beam through the service corridors.",
    par: 3,
    rows: Object.freeze([
      "v.......#",
      ".........",
      "/...../..",
      "...T#....",
      "....#....",
      "....#....",
      ".T.*..\\..",
      "....#....",
      "........#",
    ]),
  }),
  Object.freeze({
    id: "crossfire",
    name: "Crossfire",
    chapter: "05",
    subtitle: "Two emitters. Six receivers. One shared lattice of light.",
    par: 4,
    rows: Object.freeze([
      "..T...T..",
      ">.*...\\..",
      ".........",
      ".........",
      "T.\\...\\.T",
      ".........",
      ".........",
      "..\\...*.<",
      "..T...T..",
    ]),
  }),
  Object.freeze({
    id: "the-vault",
    name: "The Vault",
    chapter: "06",
    subtitle: "Every prism is listening. Close the relay.",
    par: 6,
    rows: Object.freeze([
      "....T......",
      "...........",
      "..\\.\\.\\...T",
      "...........",
      "....#......",
      ">.*...*...T",
      "....#......",
      "...........",
      "../././...T",
      "...........",
      "....T......",
    ]),
  }),
]);

const REFRACTION_LEVELS = Object.freeze([
  Object.freeze({
    id: "double-down",
    name: "Double Down",
    chapter: "07",
    subtitle: "The splitter forks the signal. Flip it to choose a side.",
    par: 4,
    rows: Object.freeze([
      ".........",
      ">.Z./....",
      ".........",
      "T...\\....",
      ".........",
      ".........",
      "T.\\......",
      ".........",
      ".........",
    ]),
  }),
  Object.freeze({
    id: "forked-path",
    name: "Forked Path",
    chapter: "08",
    subtitle: "Three splitters. Four receivers. Keep every branch alive.",
    par: 7,
    rows: Object.freeze([
      ".........",
      ".....\\..T",
      ".........",
      ".........",
      ">.Z.ZS./.",
      ".........",
      "..../.T..",
      "T.\\......",
      ".......T.",
    ]),
  }),
  Object.freeze({
    id: "prism-break",
    name: "Prism Break",
    chapter: "09",
    subtitle: "Splitters and prisms cross the chamber in one lattice.",
    par: 7,
    rows: Object.freeze([
      ".........",
      "...\\./...",
      ".........",
      ".T...\\...",
      ">Z.*../..",
      ".........",
      "T..\\.....",
      "T\\.......",
      "......T..",
    ]),
  }),
  Object.freeze({
    id: "white-noise",
    name: "White Noise",
    chapter: "10",
    subtitle: "Two signals, ten switches, no room for a stray beam.",
    par: 10,
    rows: Object.freeze([
      "...........",
      "...........",
      "......\\...T",
      ".T.........",
      ".......T/..",
      ">.Z...S../.",
      "...........",
      "./..S...Z.<",
      "T.\\........",
      "..T.\\....T.",
      "...........",
    ]),
  }),
]);

const CROSSING_LEVELS = Object.freeze([
  Object.freeze({
    id: "wormhole",
    name: "Wormhole",
    chapter: "11",
    subtitle: "A portal carries the beam across the chamber. Follow the exit.",
    par: 6,
    rows: Object.freeze([
      ".........",
      "...1.Z./.",
      "....T....",
      "...T.\\...",
      ".........",
      ">Z.1...T.",
      "./..\\....",
      ".........",
      ".........",
    ]),
  }),
  Object.freeze({
    id: "twin-gates",
    name: "Twin Gates",
    chapter: "12",
    subtitle: "Two gate pairs, two operators, one synchronized circuit.",
    par: 8,
    rows: Object.freeze([
      "...........",
      ">.Z..1.....",
      "...........",
      "....\\3.....",
      "T.\\........",
      ".T..\\......",
      ".....1./\\.T",
      "...........",
      "...T...\\...",
      ".....3..Z.<",
      "...........",
    ]),
  }),
  Object.freeze({
    id: "long-way-home",
    name: "The Long Way Home",
    chapter: "13",
    subtitle: "Every gate, every reflection. The final relay is listening.",
    par: 13,
    rows: Object.freeze([
      "v..........",
      ".\\......./.",
      "..\\...../..",
      "...\\.S./...",
      "1........3.",
      "...T.......",
      ".....T.....",
      "1./....\\.3.",
      "./......\\..",
      "/........\\.",
      "...........",
    ]),
  }),
]);

export const EPISODES = Object.freeze([
  Object.freeze({
    id: "ignition",
    number: "I",
    name: "Ignition",
    mechanic: "Mirrors & prisms",
    subtitle: "Learn the relay and close the first six chambers.",
    levels: IGNITION_LEVELS,
  }),
  Object.freeze({
    id: "refraction",
    number: "II",
    name: "Refraction",
    mechanic: "Rotatable splitters",
    subtitle: "Forks in the signal demand a steadier hand.",
    levels: REFRACTION_LEVELS,
  }),
  Object.freeze({
    id: "crossing",
    number: "III",
    name: "Crossing",
    mechanic: "Teleport portals",
    subtitle: "Space folds. The final circuit is waiting.",
    levels: CROSSING_LEVELS,
  }),
]);

export const LEVELS = Object.freeze(EPISODES.flatMap((episode) => episode.levels));

export function levelById(id) {
  return LEVELS.find((level) => level.id === id) ?? null;
}

export function episodeForLevel(levelId) {
  return EPISODES.find((episode) => episode.levels.some((level) => level.id === levelId)) ?? null;
}

export function levelsForEpisode(episodeId) {
  return EPISODES.find((episode) => episode.id === episodeId)?.levels ?? [];
}

export function nextLevel(levelId) {
  const index = LEVELS.findIndex((level) => level.id === levelId);
  return index >= 0 ? LEVELS[index + 1] ?? null : null;
}

export function firstLevel() {
  return LEVELS[0];
}

export const TOTAL_LEVELS = LEVELS.length;
export const TOTAL_STARS = TOTAL_LEVELS * 3;
