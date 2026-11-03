import {
  applySolution,
  colorKey,
  colorName,
  createGame,
  mirrorTiles,
  orientationAt,
  rotateMirror,
  traceGame,
} from "../game/engine.js";
import {
  EPISODES,
  LEVELS,
  LEVEL_BY_ID,
  TOTAL_CHAMBERS,
  TOTAL_STARS,
  episodeForLevel,
  levelsForEpisode,
} from "../game/levels.js";
import { createAudio } from "./audio.js";
import {
  bestFor,
  isUnlocked,
  loadProgress,
  nextUnsolved,
  rankFor,
  ratingFor,
  recordSolve,
  saveProgress,
  solvedCount,
  starCount,
} from "./progress.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DIRECTIONS = Object.freeze({
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
});
const ORIENTATION_NAMES = Object.freeze({ "/": "slash", "\\": "backslash" });
const DIRECTION_LABELS = Object.freeze({ n: "north", e: "east", s: "south", w: "west" });
const HINT_DURATION = 5000;

function required(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Iris is missing the #${id} element.`);
  }
  return node;
}

const refs = {
  board: required("board"),
  status: required("status"),
  moveCount: required("move-count"),
  parCount: required("par-count"),
  receiverCount: required("receiver-count"),
  levelKicker: required("level-kicker"),
  levelName: required("level-name"),
  titleProgress: required("title-progress"),
  chambersProgress: required("chambers-progress"),
  chamberList: required("chamber-list"),
  helpDialog: required("help-dialog"),
  winDialog: required("win-dialog"),
  winKicker: required("win-kicker"),
  winHeading: required("win-heading"),
  winStars: required("win-stars"),
  winSummary: required("win-summary"),
  winMoves: required("win-moves"),
  winPar: required("win-par"),
  winBest: required("win-best"),
  btnPlay: required("btn-play"),
  btnHow: required("btn-how"),
  btnHelpGame: required("btn-help-game"),
  btnBackTitle: required("btn-back-title"),
  btnChambers: required("btn-chambers"),
  btnUndo: required("btn-undo"),
  btnReset: required("btn-reset"),
  btnHint: required("btn-hint"),
  btnSoundTitle: required("btn-sound-title"),
  btnSoundGame: required("btn-sound-game"),
  btnNext: required("btn-next"),
  btnReplay: required("btn-replay"),
  btnWinChambers: required("btn-win-chambers"),
  btnHelpClose: required("btn-help-close"),
};

const audio = createAudio();

const state = {
  screen: "title",
  level: null,
  game: null,
  moves: 0,
  undoStack: [],
  hint: null,
  hintTimer: null,
  won: false,
  progress: loadProgress(),
  sound: true,
  preview: null,
};

state.sound = state.progress.settings.sound !== false;
audio.setMuted(!state.sound);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function beamVar(mask) {
  return `var(--beam-${colorKey(mask)})`;
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function formatTarget(target) {
  const names = {
    r: "red",
    g: "green",
    b: "blue",
    y: "yellow",
    c: "cyan",
    m: "magenta",
    w: "white",
  };
  return names[target] ?? target;
}

function setScreen(name, { focus = true } = {}) {
  for (const section of document.querySelectorAll("section[data-screen]")) {
    section.hidden = section.dataset.screen !== name;
  }
  state.screen = name;
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  if (!focus) {
    return;
  }
  const heading = document.querySelector(`section[data-screen="${name}"] h1`);
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

function syncSound() {
  for (const button of [refs.btnSoundTitle, refs.btnSoundGame]) {
    button.textContent = state.sound ? "Sound on" : "Sound off";
    button.setAttribute("aria-pressed", String(state.sound));
  }
}

function setSound(enabled) {
  state.sound = Boolean(enabled);
  state.progress = {
    ...state.progress,
    settings: { ...state.progress.settings, sound: state.sound },
  };
  saveProgress(state.progress);
  audio.setMuted(!state.sound);
  syncSound();
  if (state.sound) {
    audio.unlock();
    audio.play("rotate");
  }
}

function starsMarkup(count, label) {
  const wrapper = element("span", "star-row");
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", label ?? `${count} of 3 stars`);
  for (let index = 0; index < 3; index += 1) {
    const star = element("span", "star");
    star.dataset.filled = String(index < count);
    star.setAttribute("aria-hidden", "true");
    wrapper.append(star);
  }
  return wrapper;
}

function renderTitleProgress() {
  const lit = solvedCount(state.progress);
  const stars = starCount(state.progress);
  const next = nextUnsolved(state.progress, LEVELS);
  const rank = rankFor(stars, TOTAL_STARS);
  if (lit === 0) {
    refs.titleProgress.textContent = `${TOTAL_CHAMBERS} chambers · no account · no network`;
  } else {
    refs.titleProgress.textContent =
      `${lit} of ${TOTAL_CHAMBERS} chambers lit · ${stars}/${TOTAL_STARS} stars · ${rank}` +
      (next ? ` · next: ${next.name}` : " · spectrum complete");
  }
}

function renderChambers() {
  refs.chamberList.replaceChildren();
  const next = nextUnsolved(state.progress, LEVELS);
  let number = 0;
  for (const episode of EPISODES) {
    const section = element("section", "episode");
    const head = element("header", "episode-head");
    const title = element("div");
    title.append(
      element("p", "eyebrow", `Episode ${episode.numeral}`),
      element("h2", "episode-name", episode.name),
      element("p", "episode-subtitle", episode.subtitle),
    );
    head.append(title);
    const levels = levelsForEpisode(episode.number);
    head.append(element("p", "episode-count", `${levels.length} chambers`));
    const grid = element("div", "chamber-grid");

    for (const level of levels) {
      number += 1;
      const best = bestFor(state.progress, level.id);
      const unlocked = isUnlocked(state.progress, LEVELS, level.id);
      const isNext = next?.id === level.id;
      const card = element("button", "chamber-card");
      card.type = "button";
      card.dataset.level = level.id;
      card.dataset.locked = String(!unlocked);
      card.dataset.solved = String(Boolean(best));
      card.dataset.next = String(isNext);
      card.disabled = !unlocked;
      card.setAttribute("aria-current", isNext ? "true" : "false");
      card.setAttribute(
        "aria-label",
        `Chamber ${number}, ${level.name}, par ${level.par}, ` +
          `${best ? `${best.stars} stars, best ${best.bestMoves} moves` : isNext ? "next" : unlocked ? "open" : "locked"}`,
      );

      const top = element("span", "chamber-card-top");
      top.append(
        element("span", "chamber-number", String(number).padStart(2, "0")),
        element("span", "chamber-state", best ? "Lit" : isNext ? "Next" : unlocked ? "Open" : "Locked"),
      );
      const body = element("span", "chamber-card-body");
      body.append(
        element("span", "chamber-name", level.name),
        element("span", "chamber-meta", `${level.par} par · ${level.receivers.length} receiver${level.receivers.length === 1 ? "" : "s"}`),
      );
      const foot = element("span", "chamber-card-foot");
      if (best) {
        foot.append(
          starsMarkup(best.stars, `${best.stars} of 3 stars`),
          element("span", "chamber-best", `${best.bestMoves} moves`),
        );
      } else if (unlocked) {
        foot.append(element("span", "chamber-best", "Unplayed"));
      } else {
        foot.append(element("span", "chamber-best", "Finish the previous chamber"));
      }
      card.append(top, body, foot);
      card.addEventListener("click", () => openLevel(level.id));
      grid.append(card);
    }
    section.append(head, grid);
    refs.chamberList.append(section);
  }
  refs.chambersProgress.textContent = `${solvedCount(state.progress)} of ${TOTAL_CHAMBERS} lit`;
}

function showTitle() {
  renderTitleProgress();
  setScreen("title");
}

function showChambers({ focus = true } = {}) {
  renderChambers();
  setScreen("chambers", { focus });
}

function openLevel(levelId, { preview = false } = {}) {
  const level = Object.hasOwn(LEVEL_BY_ID, levelId) ? LEVEL_BY_ID[levelId] : null;
  if (!level) {
    return;
  }
  state.level = level;
  state.game = createGame(level);
  state.moves = 0;
  state.undoStack = [];
  state.hint = null;
  state.won = false;
  state.preview = preview ? levelId : null;
  clearHintTimer();
  refs.winDialog.close?.();
  renderGame();
  setScreen("game");
}

function renderGame() {
  if (!state.level || !state.game) {
    return;
  }
  const level = state.level;
  const trace = traceGame(state.game);
  const index = LEVELS.indexOf(level);
  const episode = episodeForLevel(level);
  refs.levelKicker.textContent =
    `Chamber ${String(index + 1).padStart(2, "0")} · Episode ${episode.numeral} · ${episode.name}`;
  refs.levelName.textContent = level.name;
  refs.moveCount.textContent = String(state.moves);
  refs.parCount.textContent = String(level.par);
  refs.receiverCount.textContent = `${trace.charged}/${trace.receivers.length}`;
  refs.btnUndo.disabled = state.undoStack.length === 0 || state.won;
  refs.btnReset.disabled = state.won || state.moves === 0;
  refs.btnHint.disabled = state.won || Boolean(state.hint);

  renderBoard(trace);
  if (state.won) {
    refs.status.textContent = "Chamber lit.";
  } else if (state.hint) {
    refs.status.textContent =
      `Hint: the highlighted mirror should face ${state.hint.orientation === "/" ? "slash (/)" : "backslash (\\)"}.`;
  } else {
    refs.status.textContent = describeProgress(trace);
  }
}

function describeProgress(trace) {
  const wrong = trace.receivers.filter((receiver) => !receiver.charged);
  if (wrong.length === 0) {
    return "Every receiver is charged.";
  }
  const first = wrong[0];
  const received = first.colors.length
    ? `receiving ${first.colors.map(colorName).join(" and ")}`
    : "unlit";
  return `${trace.charged} of ${trace.receivers.length} receivers charged · ` +
    `row ${first.y + 1}, column ${first.x + 1} wants ${formatTarget(first.target)}, ${received}.`;
}

function renderBoard(trace) {
  const level = state.level;
  const focused = document.activeElement?.closest?.(".tile-tile");
  const focusKey =
    focused && refs.board.contains(focused)
      ? keyOf(Number(focused.dataset.x), Number(focused.dataset.y))
      : null;

  refs.board.replaceChildren();
  refs.board.style.setProperty("--cols", String(level.width));
  refs.board.style.setProperty("--rows", String(level.height));
  refs.board.style.setProperty("--grid-x", `${100 / level.width}%`);
  refs.board.style.setProperty("--grid-y", `${100 / level.height}%`);
  refs.board.style.aspectRatio = `${level.width} / ${level.height}`;
  refs.board.dataset.level = level.id;
  refs.board.classList.toggle("is-won", state.won);
  refs.board.setAttribute(
    "aria-label",
    `${level.name}, ${level.width} by ${level.height}, ${state.moves} moves, par ${level.par}`,
  );

  const litCells = new Set();
  for (const beam of trace.beams) {
    for (const point of beam.points) {
      litCells.add(keyOf(point[0], point[1]));
    }
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "beams");
  svg.setAttribute("viewBox", `0 0 ${level.width} ${level.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const glow = document.createElementNS(SVG_NS, "g");
  glow.setAttribute("class", "beam-glow");
  const core = document.createElementNS(SVG_NS, "g");
  core.setAttribute("class", "beam-core");

  for (const beam of trace.beams) {
    for (const edge of beam.edges) {
      const x1 = edge.from[0] + 0.5;
      const y1 = edge.from[1] + 0.5;
      const x2 = edge.to[0] + 0.5;
      const y2 = edge.to[1] + 0.5;
      for (const group of [glow, core]) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", beamVar(edge.color));
        group.append(line);
      }
    }
  }
  svg.append(glow, core);
  refs.board.append(svg);

  const receivers = new Map();
  trace.receivers.forEach((receiver) => receivers.set(keyOf(receiver.x, receiver.y), receiver));
  const emitters = new Map();
  for (const emitter of level.emitters) {
    emitters.set(keyOf(emitter.x, emitter.y), emitter);
  }
  const dyes = new Map();
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const character = level.rows[y][x];
      if (character === "1" || character === "2" || character === "3") {
        dyes.set(keyOf(x, y), character);
      }
    }
  }
  const mirrors = new Map(
    mirrorTiles(level).map((mirror) => [keyOf(mirror.x, mirror.y), mirror]),
  );

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const key = keyOf(x, y);
      const character = level.rows[y][x];
      const tile = element("div", "tile");
      tile.dataset.x = String(x);
      tile.dataset.y = String(y);

      if (character === "#") {
        tile.dataset.kind = "wall";
        tile.setAttribute("aria-hidden", "true");
        refs.board.append(tile);
        continue;
      }

      if (mirrors.has(key)) {
        const button = element("button", "tile-tile");
        button.type = "button";
        button.dataset.kind = "mirror";
        button.dataset.x = String(x);
        button.dataset.y = String(y);
        button.dataset.orientation = orientationAt(state.game, x, y);
        button.tabIndex = 0;
        const orientation = orientationAt(state.game, x, y);
        button.setAttribute(
          "aria-label",
          `Mirror at row ${y + 1}, column ${x + 1}, ${ORIENTATION_NAMES[orientation]}, rotate`,
        );
        const line = element("span", "mirror-line");
        line.setAttribute("aria-hidden", "true");
        button.append(line);
        if (state.hint && state.hint.x === x && state.hint.y === y) {
          button.dataset.hint = state.hint.orientation;
          button.append(element("span", "hint-ghost"));
        }
        button.addEventListener("click", () => rotateAt(x, y));
        tile.append(button);
        refs.board.append(tile);
        continue;
      }

      if (emitters.has(key)) {
        const emitter = emitters.get(key);
        tile.dataset.kind = "emitter";
        tile.dataset.dir = emitter.dir;
        tile.style.setProperty("--tile-color", `var(--beam-${emitter.color})`);
        tile.setAttribute("role", "img");
        tile.setAttribute(
          "aria-label",
          `${formatTarget(emitter.color)} emitter at row ${y + 1}, column ${x + 1}, pointing ${DIRECTION_LABELS[emitter.dir]}`,
        );
        tile.append(element("span", "emitter"));
        tile.append(element("span", "emitter-arrow"));
        refs.board.append(tile);
        continue;
      }

      if (receivers.has(key)) {
        const receiver = receivers.get(key);
        tile.dataset.kind = "receiver";
        tile.dataset.charged = String(receiver.charged);
        tile.style.setProperty("--tile-color", `var(--beam-${receiver.target})`);
        tile.setAttribute("role", "img");
        tile.setAttribute(
          "aria-label",
          `Receiver at row ${y + 1}, column ${x + 1}, wants ${formatTarget(receiver.target)}, ` +
            (receiver.charged
              ? "charged"
              : receiver.colors.length
                ? `receiving ${receiver.colors.map(colorName).join(" and ")}`
                : "unlit"),
        );
        const ring = element("span", "receiver-ring");
        const dot = element("span", "receiver-dot");
        if (receiver.colors.length) {
          dot.style.setProperty("--tile-color", beamVar(receiver.colors.reduce((a, b) => a | b, 0)));
          dot.dataset.filled = "true";
        }
        tile.append(ring, dot, element("span", "receiver-glint"));
        refs.board.append(tile);
        continue;
      }

      if (dyes.has(key)) {
        const primary = { 1: "r", 2: "g", 3: "b" }[dyes.get(key)];
        tile.dataset.kind = "dye";
        tile.dataset.lit = String(litCells.has(key));
        tile.style.setProperty("--tile-color", `var(--beam-${primary})`);
        tile.setAttribute("role", "img");
        tile.setAttribute(
          "aria-label",
          `${formatTarget(primary)} dye at row ${y + 1}, column ${x + 1}, ${litCells.has(key) ? "lit by a beam" : "not lit"}`,
        );
        tile.append(element("span", "dye-cell"));
        refs.board.append(tile);
        continue;
      }

      tile.dataset.kind = "floor";
      tile.setAttribute("aria-hidden", "true");
      refs.board.append(tile);
    }
  }

  if (focusKey) {
    const target = refs.board.querySelector(
      `.tile-tile[data-x="${focusKey.split(",")[0]}"][data-y="${focusKey.split(",")[1]}"]`,
    );
    target?.focus({ preventScroll: true });
  }
}

function clearHintTimer() {
  if (state.hintTimer) {
    clearTimeout(state.hintTimer);
    state.hintTimer = null;
  }
}

function rotateAt(x, y) {
  if (!state.game || state.won) {
    return;
  }
  const before = traceGame(state.game);
  state.undoStack.push({ game: state.game, moves: state.moves });
  if (state.undoStack.length > 80) {
    state.undoStack.shift();
  }
  state.game = rotateMirror(state.game, x, y);
  state.moves += 1;
  state.hint = null;
  clearHintTimer();
  const after = traceGame(state.game);
  audio.unlock();
  audio.play("rotate");
  if (after.charged > before.charged) {
    audio.play("charge");
  }
  if (after.solved) {
    finishLevel({ preview: Boolean(state.preview) });
    return;
  }
  renderGame();
}

function finishLevel({ preview = false } = {}) {
  state.won = true;
  refs.board.classList.add("is-won");
  const stars = ratingFor(state.moves, state.level.par);
  if (!preview) {
    state.progress = recordSolve(state.progress, state.level.id, {
      moves: state.moves,
      stars,
      hints: 0,
    });
    saveProgress(state.progress);
  }
  const best = bestFor(state.progress, state.level.id) ?? {
    bestMoves: state.moves,
    stars,
  };
  const index = LEVELS.indexOf(state.level);
  const next = LEVELS[index + 1] ?? null;
  refs.winKicker.textContent = `Chamber ${String(index + 1).padStart(2, "0")} complete`;
  refs.winHeading.textContent = state.level.name;
  refs.winStars.replaceChildren(starsMarkup(stars, `${stars} of 3 stars`));
  refs.winSummary.textContent =
    stars === 3
      ? "Perfect routing: every beam landed at par."
      : stars === 2
        ? "Charged, with a little room to spare."
        : "Charged. Par is the target for three stars.";
  refs.winMoves.textContent = String(state.moves);
  refs.winPar.textContent = String(state.level.par);
  refs.winBest.textContent = String(best.bestMoves);
  refs.btnNext.hidden = !next || preview;
  refs.btnNext.dataset.next = next?.id ?? "";
  audio.play("win");
  renderTitleProgress();
  renderGame();
  refs.winDialog.showModal();
}

function undo() {
  const previous = state.undoStack.pop();
  if (!previous) {
    return;
  }
  state.game = previous.game;
  state.moves = previous.moves;
  state.won = false;
  state.hint = null;
  clearHintTimer();
  renderGame();
}

function resetLevel() {
  if (!state.level) {
    return;
  }
  openLevel(state.level.id, { preview: Boolean(state.preview) });
}

function showHint() {
  if (!state.level || state.won || state.hint) {
    return;
  }
  const solution = state.level.solution;
  const mirror = mirrorTiles(state.level).find(
    (candidate) => solution[keyOf(candidate.x, candidate.y)] !== orientationAt(state.game, candidate.x, candidate.y),
  );
  if (!mirror) {
    refs.status.textContent = "Every mirror already matches the stored route.";
    return;
  }
  state.hint = {
    x: mirror.x,
    y: mirror.y,
    orientation: solution[keyOf(mirror.x, mirror.y)],
  };
  audio.play("dye");
  renderGame();
  clearHintTimer();
  state.hintTimer = setTimeout(() => {
    if (!state.hint) {
      return;
    }
    state.hint = null;
    state.hintTimer = null;
    renderGame();
  }, HINT_DURATION);
}

function moveFocus(x, y, delta) {
  const mirrors = mirrorTiles(state.level);
  const [dx, dy] = delta;
  let best = null;
  let bestScore = Infinity;
  for (const mirror of mirrors) {
    if (mirror.x === x && mirror.y === y) {
      continue;
    }
    const offsetX = mirror.x - x;
    const offsetY = mirror.y - y;
    const forward = offsetX * dx + offsetY * dy;
    const side = Math.abs(offsetX * dy - offsetY * dx);
    if (forward <= 0) {
      continue;
    }
    const score = forward * 100 + side;
    if (score < bestScore) {
      bestScore = score;
      best = mirror;
    }
  }
  if (!best) {
    return;
  }
  const target = refs.board.querySelector(
    `.tile-tile[data-x="${best.x}"][data-y="${best.y}"]`,
  );
  target?.focus();
}

function openHelp() {
  refs.btnHelpClose.textContent = state.screen === "game" ? "Back to the board" : "Begin";
  refs.helpDialog.showModal();
}

function wireEvents() {
  refs.btnPlay.addEventListener("click", () => {
    audio.unlock();
    const next = nextUnsolved(state.progress, LEVELS);
    if (next) {
      openLevel(next.id);
    } else {
      showChambers();
    }
  });
  refs.btnHow.addEventListener("click", openHelp);
  refs.btnHelpGame.addEventListener("click", openHelp);
  refs.btnHelpClose.addEventListener("click", () => refs.helpDialog.close());
  refs.btnBackTitle.addEventListener("click", showTitle);
  refs.btnChambers.addEventListener("click", () => showChambers());
  refs.btnWinChambers.addEventListener("click", () => {
    state.preview = null;
    refs.winDialog.close();
    showChambers();
  });
  refs.btnUndo.addEventListener("click", undo);
  refs.btnReset.addEventListener("click", resetLevel);
  refs.btnHint.addEventListener("click", showHint);
  refs.btnSoundTitle.addEventListener("click", () => setSound(!state.sound));
  refs.btnSoundGame.addEventListener("click", () => setSound(!state.sound));
  refs.btnReplay.addEventListener("click", () => {
    refs.winDialog.close();
    resetLevel();
  });
  refs.btnNext.addEventListener("click", () => {
    const nextId = refs.btnNext.dataset.next;
    refs.winDialog.close();
    if (nextId) {
      openLevel(nextId);
    }
  });

  refs.board.addEventListener("keydown", (event) => {
    if (!state.level) {
      return;
    }
    const button = event.target.closest?.(".tile-tile");
    if (!button) {
      return;
    }
    const delta = DIRECTIONS[event.key];
    if (delta) {
      event.preventDefault();
      moveFocus(Number(button.dataset.x), Number(button.dataset.y), delta);
    }
  });

  refs.helpDialog.addEventListener("click", (event) => {
    if (event.target === refs.helpDialog) {
      refs.helpDialog.close();
    }
  });
  refs.winDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    refs.winDialog.close();
    showChambers();
  });
}

function applyPreview() {
  const params = new URLSearchParams(window.location.search);
  const levelParam = params.get("level");
  const screenParam = params.get("screen");
  const previewParam = params.get("preview");
  syncSound();
  if (levelParam && Object.hasOwn(LEVEL_BY_ID, levelParam)) {
    openLevel(levelParam, { preview: true });
    state.preview = levelParam;
    if (previewParam === "victory") {
      const level = LEVEL_BY_ID[levelParam];
      state.game = applySolution(level);
      state.moves = level.par;
      renderGame();
      finishLevel({ preview: true });
    }
    if (previewParam === "howto") {
      openHelp();
    }
    return;
  }
  if (screenParam === "chambers") {
    showChambers();
    return;
  }
  showTitle();
  if (previewParam === "howto") {
    openHelp();
  }
}

wireEvents();
applyPreview();
syncSound();
