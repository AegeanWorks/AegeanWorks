import {
  EPISODES,
  LEVELS,
  TOTAL_LEVELS,
  TOTAL_STARS,
  episodeForLevel,
  levelById,
  nextLevel,
} from "../game/levels.js";
import {
  createSession,
  resetSession,
  rotateSessionCell,
  starsFor,
  traceBeams,
} from "../game/engine.js";
import { solveLevel } from "../game/solver.js";
import * as audio from "./audio.js";
import {
  isUnlocked,
  loadProgress,
  rankFor,
  recordResult,
  saveProgress,
  setMusic,
  setSound,
  statsFor,
  updateProfile,
} from "./progress.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const screens = new Map(
  ["title", "chambers", "game", "profile"].map((name) => [
    name,
    document.getElementById(`screen-${name}`),
  ]),
);

const elements = {
  topbarStatus: document.querySelector('[data-cue="topbar-status"]'),
  soundToggle: document.querySelector('[data-ui="sound-toggle"]'),
  profileChip: document.querySelector('[data-ui="open-profile"]'),
  profileChipName: document.getElementById("profile-chip-name"),
  profileChipSigil: document.getElementById("profile-chip-sigil"),
  titleStars: document.getElementById("title-stars"),
  titleBest: document.getElementById("title-best"),
  chamberGrid: document.getElementById("chamber-grid"),
  chamberProgressFill: document.getElementById("chamber-progress-fill"),
  chamberProgressTrack: document.getElementById("chamber-progress-track"),
  chamberProgressValue: document.getElementById("chamber-progress-value"),
  gameChapter: document.getElementById("game-chapter"),
  gameTitle: document.getElementById("game-title"),
  gameSubtitle: document.getElementById("game-subtitle"),
  hudMoves: document.getElementById("hud-moves"),
  hudPar: document.getElementById("hud-par"),
  hudRelays: document.getElementById("hud-relays"),
  gameHint: document.getElementById("game-hint"),
  gameMechanic: document.getElementById("game-mechanic"),
  statusLine: document.getElementById("status-line"),
  board: document.getElementById("board"),
  boardFrame: document.getElementById("board-frame"),
  beamLayer: document.getElementById("beam-layer"),
  legendSplitter: document.querySelector('[data-legend="splitter"]'),
  legendPortal: document.querySelector('[data-legend="portal"]'),
  modal: document.getElementById("modal"),
  modalKicker: document.getElementById("modal-kicker"),
  modalTitle: document.getElementById("modal-title"),
  modalStars: document.getElementById("modal-stars"),
  modalBody: document.getElementById("modal-body"),
  modalPrimary: document.getElementById("modal-primary"),
  modalSecondary: document.getElementById("modal-secondary"),
  modalTertiary: document.getElementById("modal-tertiary"),
  modalClose: document.querySelector('[data-ui="modal-close"]'),
  profileBack: document.querySelector('[data-ui="profile-back"]'),
  profileSigil: document.getElementById("profile-sigil"),
  profileCallsignDisplay: document.getElementById("profile-callsign-display"),
  profileRank: document.getElementById("profile-rank"),
  profileForm: document.getElementById("profile-form"),
  profileCallsign: document.getElementById("profile-callsign"),
  profileSaveStatus: document.getElementById("profile-save-status"),
  profileStatChambers: document.getElementById("profile-stat-chambers"),
  profileStatStars: document.getElementById("profile-stat-stars"),
  profileStatPerfect: document.getElementById("profile-stat-perfect"),
  profileStatMoves: document.getElementById("profile-stat-moves"),
  profileEpisodes: document.getElementById("profile-episodes"),
  profileMusic: document.getElementById("profile-music"),
  profileSfx: document.getElementById("profile-sfx"),
  sigilPicker: document.querySelector('[data-ui="sigil-picker"]'),
  sigilOptions: [...document.querySelectorAll('[data-ui="sigil-option"]')],
};

const state = {
  progress: loadProgress(storage),
  screen: "title",
  level: null,
  session: null,
  completed: false,
  paused: false,
  preview: false,
  result: null,
  modalOpen: false,
  modalKind: null,
  rotatableCells: [],
  cellElements: new Map(),
  profileReturn: "title",
  audioUnlocked: false,
  victoryTimer: null,
  victoryPending: false,
  profileStatusTimer: null,
};

function showScreen(name) {
  state.screen = name;
  for (const [id, screen] of screens) {
    screen.hidden = id !== name;
  }
  if (name === "title") {
    updateTitleStats();
  }
  if (name === "chambers") {
    renderChambers();
  }
  if (name === "profile") {
    renderProfile();
  }
  updateTopbarStatus();
  updateSoundButton();
  updateProfileChip();
  const screen = screens.get(name);
  const heading = screen?.querySelector("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  if (name === "game" && state.victoryPending) {
    state.victoryPending = false;
    openVictoryModal();
  }
  if (name !== "game") {
    closeModal();
  }
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

function updateTitleStats() {
  const stats = statsFor(state.progress);
  elements.titleStars.textContent = String(stats.stars).padStart(2, "0");
  elements.titleBest.textContent = stats.completed > 0 ? `${stats.moves} moves` : "—";
}

function updateTopbarStatus() {
  if (!elements.topbarStatus) {
    return;
  }
  if (state.screen === "game" && state.level) {
    const episode = episodeForLevel(state.level.id);
    elements.topbarStatus.textContent = `EPISODE ${episode?.number ?? "I"} / CHAMBER ${state.level.chapter}`;
    return;
  }
  if (state.screen === "profile") {
    elements.topbarStatus.textContent = `OPERATOR / ${state.progress.profile.callsign.toUpperCase()}`;
    return;
  }
  if (state.screen === "chambers") {
    elements.topbarStatus.textContent = `${statsFor(state.progress).completed} / ${TOTAL_LEVELS} CHAMBERS COMPLETE`;
    return;
  }
  elements.topbarStatus.textContent = `LIGHT ROUTING / ${TOTAL_LEVELS} CHAMBERS`;
}

function updateSoundButton() {
  if (!elements.soundToggle) {
    return;
  }
  const enabled = state.progress.sound || state.progress.music;
  elements.soundToggle.classList.toggle("is-muted", !enabled);
  elements.soundToggle.setAttribute("aria-pressed", String(!enabled));
  elements.soundToggle.setAttribute("aria-label", enabled ? "Mute all audio" : "Enable all audio");
}

function updateProfileChip() {
  if (elements.profileChipName) {
    elements.profileChipName.textContent = state.progress.profile.callsign;
  }
  if (elements.profileChipSigil) {
    elements.profileChipSigil.dataset.sigil = state.progress.profile.sigil;
  }
}

function nextPlayableLevel() {
  return (
    LEVELS.find(
      (level) => isUnlocked(state.progress, level.id) && !state.progress.best[level.id],
    ) ?? LEVELS[0]
  );
}

function starsMarkup(count) {
  return [1, 2, 3]
    .map((index) => `<span class="star${index <= count ? " is-earned" : ""}" aria-hidden="true">★</span>`)
    .join("");
}

function starLabel(count) {
  return count === 0 ? "No stars yet" : `${count} of 3 stars`;
}

function renderChambers() {
  if (!elements.chamberGrid) {
    return;
  }
  elements.chamberGrid.replaceChildren();
  for (const episode of EPISODES) {
    const episodeLocked = !isUnlocked(state.progress, episode.levels[0].id);
    const cleared = episode.levels.filter((level) => state.progress.best[level.id]).length;
    const stars = episode.levels.reduce(
      (total, level) => total + (state.progress.best[level.id]?.stars ?? 0),
      0,
    );
    const block = document.createElement("section");
    block.className = "episode-block";
    block.classList.toggle("is-locked", episodeLocked);
    block.dataset.episode = episode.id;
    block.innerHTML = `
      <header class="episode-head">
        <div class="episode-head__id">
          <span class="episode-number">Episode ${episode.number}</span>
          <h3>${episode.name}</h3>
          <p>${episode.subtitle}</p>
        </div>
        <div class="episode-head__meta">
          <span class="episode-mechanic">${episode.mechanic}</span>
          <span class="episode-count">${cleared}/${episode.levels.length} chambers · ${stars}/${episode.levels.length * 3} stars</span>
          ${episodeLocked ? '<span class="episode-lock">Locked</span>' : ""}
        </div>
      </header>
    `;
    const grid = document.createElement("div");
    grid.className = "episode-grid";
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", `Episode ${episode.number}: ${episode.name}`);

    for (const level of episode.levels) {
      const unlocked = isUnlocked(state.progress, level.id);
      const best = state.progress.best[level.id] ?? null;
      const item = document.createElement("div");
      item.className = "chamber-card-item";
      item.setAttribute("role", "listitem");
      const card = document.createElement("button");
      card.type = "button";
      card.className = "chamber-card";
      card.classList.toggle("is-complete", Boolean(best));
      card.classList.toggle("is-locked", !unlocked);
      card.disabled = !unlocked;
      card.dataset.level = level.id;
      card.dataset.episode = episode.id;
      card.setAttribute("data-ui", "chamber-card");
      card.setAttribute(
        "aria-label",
        `${level.chapter}, ${level.name}. ${unlocked ? (best ? `${best.stars} stars, best ${best.moves} moves` : "Open chamber") : "Locked"}`,
      );
      card.innerHTML = `
        <span class="chamber-card__top">
          <span class="chamber-card__number">CHAMBER ${level.chapter}</span>
          <span class="stars" aria-label="${starLabel(best?.stars ?? 0)}">${starsMarkup(best?.stars ?? 0)}</span>
        </span>
        <span class="chamber-card__name">${level.name}</span>
        <span class="chamber-card__subtitle">${level.subtitle}</span>
        <span class="chamber-card__footer">
          <span>PAR ${level.par}</span>
          <span class="chamber-card__action">${unlocked ? (best ? `${best.moves} MOVES` : "ENTER →") : "LOCKED"}</span>
        </span>
      `;
      card.addEventListener("click", () => startLevel(level.id));
      item.append(card);
      grid.append(item);
    }
    block.append(grid);
    elements.chamberGrid.append(block);
  }

  const stats = statsFor(state.progress);
  elements.chamberProgressTrack?.setAttribute("aria-valuenow", String(stats.completed));
  if (elements.chamberProgressFill) {
    elements.chamberProgressFill.style.width = `${(stats.completed / TOTAL_LEVELS) * 100}%`;
  }
  if (elements.chamberProgressValue) {
    elements.chamberProgressValue.textContent = `${stats.completed} / ${TOTAL_LEVELS} chambers`;
  }
}

function startLevel(levelId, options = {}) {
  const level = levelById(levelId) ?? LEVELS[0];
  if (state.victoryTimer) {
    clearTimeout(state.victoryTimer);
    state.victoryTimer = null;
  }
  closeModal();
  state.level = level;
  state.session = createSession(level);
  state.completed = false;
  state.paused = false;
  state.result = null;
  state.victoryPending = false;
  state.preview = Boolean(options.preview);
  traceSession();
  showScreen("game");
  renderBoard();
  updateBoard();
  if (!options.silent) {
    audio.playUi();
  }
}

function renderBoard() {
  const board = state.session?.board;
  if (!board || !elements.board) {
    return;
  }
  state.rotatableCells = [];
  state.cellElements.clear();
  elements.board.replaceChildren();
  elements.board.style.setProperty("--cols", board.width);
  elements.board.style.setProperty("--rows", board.height);
  elements.board.style.setProperty("--ratio", `${board.width} / ${board.height}`);
  elements.beamLayer.setAttribute("viewBox", `0 0 ${board.width} ${board.height}`);
  elements.beamLayer.setAttribute("preserveAspectRatio", "none");

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const cell = board.cells[y][x];
      const rotatable = cell.kind === "mirror" || cell.kind === "splitter";
      const node = document.createElement(rotatable ? "button" : "div");
      node.className = `cell cell--${cell.kind}`;
      node.dataset.x = String(x);
      node.dataset.y = String(y);
      if (rotatable) {
        node.type = "button";
        node.setAttribute("data-ui", "rotatable-cell");
        node.setAttribute("aria-label", cellLabel(cell));
        state.rotatableCells.push({ x, y, element: node });
      } else if (cell.kind === "wall" || cell.kind === "floor") {
        node.setAttribute("aria-hidden", "true");
      } else {
        node.setAttribute("role", "img");
        node.setAttribute("aria-label", cellLabel(cell));
      }
      if (cell.kind === "emitter") {
        node.classList.add(`dir-${directionName(cell.direction)}`);
      }
      if (cell.kind === "splitter") {
        node.classList.toggle("is-split-left", cell.orientation === 1);
      }
      const piece = buildPiece(cell);
      if (piece) {
        node.append(piece);
      }
      state.cellElements.set(`${x},${y}`, node);
      elements.board.append(node);
    }
  }
  state.rotatableCells.forEach((cell, index) => {
    cell.element.tabIndex = index === 0 ? 0 : -1;
  });
}

function buildPiece(cell) {
  if (cell.kind === "wall" || cell.kind === "floor") {
    return null;
  }
  const piece = document.createElement("span");
  piece.className = `piece piece--${cell.kind}`;
  piece.setAttribute("aria-hidden", "true");
  if (cell.kind === "emitter" || cell.kind === "receiver") {
    piece.append(document.createElement("i"));
  }
  if (cell.kind === "portal") {
    piece.dataset.pair = cell.pair;
    const glyph = document.createElement("b");
    glyph.className = "portal-glyph";
    glyph.textContent = cell.pair;
    piece.append(glyph);
  }
  return piece;
}

function directionName(direction) {
  return ["north", "east", "south", "west"][direction] ?? "east";
}

function cellLabel(cell) {
  if (cell.kind === "mirror") {
    return `Mirror, ${cell.orientation === 1 ? "backslash" : "slash"} orientation. Rotate mirror.`;
  }
  if (cell.kind === "splitter") {
    return `Splitter, forks the beam ${cell.orientation === 1 ? "left" : "right"}. Rotate splitter.`;
  }
  if (cell.kind === "receiver") {
    return "Receiver, waiting for light.";
  }
  if (cell.kind === "emitter") {
    return `Emitter facing ${directionName(cell.direction)}.`;
  }
  if (cell.kind === "prism") {
    return "Prism, splits light into three directions.";
  }
  if (cell.kind === "portal") {
    return `Portal ${cell.pair}, paired with the other ${cell.pair} gate.`;
  }
  if (cell.kind === "wall") {
    return "Wall, blocks light.";
  }
  return "Empty tile.";
}

function traceSession() {
  if (!state.session) {
    return null;
  }
  const trace = traceBeams(state.session.board);
  state.session.paths = trace.paths;
  state.session.litCount = trace.litCount;
  state.session.complete = trace.complete;
  if (trace.complete) {
    state.session.stars = starsFor(state.session.moves, state.level.par);
  }
  return trace;
}

function updateBoard() {
  if (!state.session || !state.level) {
    return;
  }
  const trace = traceSession();
  for (const piece of state.session.board.rotatables) {
    const node = state.cellElements.get(`${piece.x},${piece.y}`);
    if (!node) {
      continue;
    }
    node.classList.toggle("is-backslash", piece.kind === "mirror" && piece.orientation === 1);
    node.classList.toggle("is-split-left", piece.kind === "splitter" && piece.orientation === 1);
    node.setAttribute("aria-label", cellLabel(piece));
  }
  for (const receiver of state.session.board.receivers) {
    const node = state.cellElements.get(`${receiver.x},${receiver.y}`);
    const lit = trace.lit.has(`${receiver.x},${receiver.y}`);
    if (node) {
      node.classList.toggle("is-lit", lit);
      node.setAttribute("aria-label", lit ? "Receiver, charged." : "Receiver, waiting for light.");
    }
  }
  renderBeams();
  updateGameView();
  if (trace.complete && !state.completed && !state.preview) {
    finishLevel();
  }
}

function renderBeams() {
  if (!elements.beamLayer || !state.session) {
    return;
  }
  elements.beamLayer.replaceChildren();
  for (const path of state.session.paths) {
    const points = path.points
      .map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const color = path.source % 3;
    for (const layer of ["halo", "core"]) {
      const line = document.createElementNS(SVG_NS, "polyline");
      line.setAttribute("points", points);
      line.setAttribute("class", `beam beam--${layer} beam--${color}`);
      elements.beamLayer.append(line);
    }
  }
}

function updateGameView() {
  if (!state.session || !state.level) {
    return;
  }
  const board = state.session.board;
  const episode = episodeForLevel(state.level.id);
  const total = board.receivers.length;
  const lit = state.session.litCount;
  elements.gameChapter.textContent = `Episode ${episode?.number ?? "I"} / Chamber ${state.level.chapter}`;
  elements.gameTitle.textContent = state.level.name;
  elements.gameSubtitle.textContent = state.level.subtitle;
  elements.hudMoves.textContent = String(state.session.moves);
  elements.hudPar.textContent = String(state.level.par);
  elements.hudRelays.textContent = `${lit}/${total}`;
  elements.gameHint.textContent = board.portals.length
    ? "Portals preserve direction. Follow the paired number."
    : board.splitters.length
      ? "Click a splitter to flip which side receives the fork."
      : `Par is ${state.level.par} moves. Every rotation counts.`;
  elements.legendSplitter.hidden = board.splitters.length === 0;
  elements.legendPortal.hidden = board.portals.length === 0;

  const mechanics = [];
  if (board.splitters.length > 0) {
    mechanics.push([
      "Splitter",
      "The main beam passes through; a copy forks to the bright side.",
    ]);
  }
  if (board.portals.length > 0) {
    mechanics.push([
      "Portal",
      "Enter one gate, leave the twin in the same direction. Numbers pair the gates.",
    ]);
  }
  elements.gameMechanic.hidden = mechanics.length === 0;
  elements.gameMechanic.innerHTML = mechanics
    .map(([name, text]) => `<strong>${name}</strong>${text}`)
    .join("<br>");
  elements.boardFrame.classList.toggle("is-complete", state.session.complete);

  if (state.session.complete) {
    elements.statusLine.textContent = "Relay closed. Chamber complete.";
  } else if (state.session.moves === 0) {
    elements.statusLine.textContent = "Rotate a piece to begin.";
  } else if (lit === 0) {
    elements.statusLine.textContent = "No signal yet. Rotate a piece into the beam.";
  } else if (lit < total) {
    elements.statusLine.textContent = `${lit} of ${total} receivers charged.`;
  } else {
    elements.statusLine.textContent = "All receivers charged. Hold the circuit.";
  }
}

function finishLevel() {
  if (state.completed || !state.session || !state.level) {
    return;
  }
  state.completed = true;
  const level = state.level;
  const episode = episodeForLevel(level.id);
  const next = nextLevel(level.id);
  const nextEpisode = next ? episodeForLevel(next.id) : null;
  const episodeComplete = !next || nextEpisode.id !== episode.id;
  const stars = state.session.stars || starsFor(state.session.moves, level.par);
  const previousBest = state.progress.best[level.id] ?? null;
  state.session.stars = stars;
  state.progress = recordResult(
    state.progress,
    level.id,
    state.session.moves,
    stars,
    next?.id ?? null,
  );
  saveProgress(storage, state.progress);
  state.result = {
    stars,
    moves: state.session.moves,
    previousBest: previousBest?.moves ?? null,
    bestMoves: state.progress.best[level.id]?.moves ?? state.session.moves,
    next: next?.id ?? null,
    nextEpisode: nextEpisode?.number ?? null,
    episodeComplete,
    episodeNumber: episode?.number ?? "I",
    preview: false,
  };
  updateTitleStats();
  updateTopbarStatus();
  updateProfileChip();
  audio.playVictory();
  state.victoryTimer = window.setTimeout(() => {
    state.victoryTimer = null;
    if (!state.completed) {
      return;
    }
    if (state.screen === "game" && !state.modalOpen) {
      openVictoryModal();
    } else {
      state.victoryPending = true;
    }
  }, reduceMotion ? 60 : 520);
}

function handleBoardClick(event) {
  const target =
    event.target instanceof Element
      ? event.target.closest("button.cell--mirror, button.cell--splitter")
      : null;
  if (!target || !elements.board.contains(target)) {
    return;
  }
  event.preventDefault();
  rotatePiece(Number(target.dataset.x), Number(target.dataset.y), target);
}

function handleBoardKeydown(event) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    return;
  }
  const active = document.activeElement;
  if (
    !(active instanceof HTMLElement) ||
    (!active.classList.contains("cell--mirror") && !active.classList.contains("cell--splitter"))
  ) {
    return;
  }
  event.preventDefault();
  moveRotatableFocus(active, event.key);
}

function moveRotatableFocus(active, key) {
  const x = Number(active.dataset.x);
  const y = Number(active.dataset.y);
  const [dx, dy] = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  }[key];
  const candidates = state.rotatableCells
    .filter((cell) => cell.element !== active)
    .filter((cell) => {
      if (dx !== 0) {
        return cell.y === y && (cell.x - x) * dx > 0;
      }
      return cell.x === x && (cell.y - y) * dy > 0;
    })
    .sort((a, b) => {
      const aDistance = dx !== 0 ? Math.abs(a.x - x) : Math.abs(a.y - y);
      const bDistance = dx !== 0 ? Math.abs(b.x - x) : Math.abs(b.y - y);
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      return dx !== 0 ? Math.abs(a.y - y) - Math.abs(b.y - y) : Math.abs(a.x - x) - Math.abs(b.x - x);
    });
  const target = candidates[0];
  if (!target) {
    return;
  }
  for (const cell of state.rotatableCells) {
    cell.element.tabIndex = -1;
  }
  target.element.tabIndex = 0;
  target.element.focus();
}

function rotatePiece(x, y, element) {
  if (
    state.screen !== "game" ||
    state.paused ||
    state.completed ||
    state.modalOpen ||
    !state.session
  ) {
    return;
  }
  const cell = state.session.board.cells[y]?.[x];
  const changed = rotateSessionCell(state.session, x, y);
  if (!changed || !cell) {
    return;
  }
  for (const piece of state.rotatableCells) {
    piece.element.tabIndex = piece.element === element ? 0 : -1;
  }
  if (cell.kind === "splitter") {
    audio.playSplit();
  } else {
    audio.playRotate();
  }
  element.classList.remove("is-turning");
  void element.offsetWidth;
  element.classList.add("is-turning");
  updateBoard();
}

function resetCurrentLevel() {
  if (!state.session || !state.level) {
    return;
  }
  if (state.victoryTimer) {
    clearTimeout(state.victoryTimer);
    state.victoryTimer = null;
  }
  closeModal();
  resetSession(state.session);
  state.completed = false;
  state.paused = false;
  state.result = null;
  state.preview = false;
  state.victoryPending = false;
  for (const piece of state.rotatableCells) {
    piece.element.classList.remove("is-turning");
  }
  updateBoard();
  audio.playUi();
}

function setAction(button, action) {
  if (!button) {
    return;
  }
  if (!action) {
    button.hidden = true;
    button.onclick = null;
    return;
  }
  button.hidden = false;
  button.textContent = action.label;
  button.onclick = (event) => {
    event.preventDefault();
    closeModal();
    action.run();
  };
}

function openModal({ kind, kicker, title, stars = null, bodyHtml, primary, secondary, tertiary }) {
  state.modalKind = kind;
  state.modalOpen = true;
  elements.modalKicker.textContent = kicker;
  elements.modalTitle.textContent = title;
  elements.modalBody.innerHTML = bodyHtml;
  elements.modalStars.innerHTML = stars === null ? "" : starsMarkup(stars);
  elements.modalStars.hidden = stars === null;
  if (stars !== null) {
    elements.modalStars.setAttribute("aria-label", starLabel(stars));
  }
  setAction(elements.modalPrimary, primary);
  setAction(elements.modalSecondary, secondary);
  setAction(elements.modalTertiary, tertiary);
  if (!elements.modal.open) {
    elements.modal.showModal();
  }
  const focusTarget = elements.modalPrimary.hidden ? elements.modalClose : elements.modalPrimary;
  focusTarget?.focus({ preventScroll: true });
}

function closeModal() {
  if (elements.modal.open) {
    elements.modal.close();
  }
}

function openHowToModal() {
  const fromGame = state.screen === "game" && state.session;
  const startAction = {
    label: fromGame ? "Return to chamber" : "Enter the relay",
    run: () => {
      if (fromGame) {
        return;
      }
      startLevel(nextPlayableLevel().id);
    },
  };
  openModal({
    kind: "howto",
    kicker: "Field manual",
    title: "Route the light.",
    bodyHtml: `
      <div class="howto-list">
        <div class="howto-item">
          <span class="legend__glyph legend__glyph--mirror" aria-hidden="true"></span>
          <div><strong>Rotate mirrors</strong><p>Click, tap, or press Space on a focused mirror. Slash and backslash faces reflect the beam in different directions.</p></div>
        </div>
        <div class="howto-item">
          <span class="legend__glyph legend__glyph--splitter" aria-hidden="true"></span>
          <div><strong>Flip splitters</strong><p>Introduced in Episode II. A splitter keeps the main beam and forks a copy to one side; click it to send the fork the other way.</p></div>
        </div>
        <div class="howto-item">
          <span class="legend__glyph legend__glyph--prism" aria-hidden="true"></span>
          <div><strong>Use the prisms</strong><p>A prism passes the beam through and splits copies to both perpendicular sides. One source can feed three branches.</p></div>
        </div>
        <div class="howto-item">
          <span class="legend__glyph legend__glyph--portal" aria-hidden="true"></span>
          <div><strong>Cross the portals</strong><p>Introduced in Episode III. A portal sends the beam to its twin; it exits in the same direction. Matching numbers are paired.</p></div>
        </div>
        <div class="howto-item">
          <span class="legend__glyph legend__glyph--receiver" aria-hidden="true"></span>
          <div><strong>Charge every receiver</strong><p>The chamber closes only when every receiver is lit. Finish at or under par for three stars.</p></div>
        </div>
      </div>
      <p class="modal__fine">Keyboard: arrows move focus, space rotates, R restarts, M mutes all audio, P opens profile, Esc pauses.</p>
    `,
    primary: startAction,
    secondary: fromGame ? null : { label: "Close", run: () => {} },
  });
}

function openPauseModal() {
  if (state.screen !== "game" || !state.session) {
    return;
  }
  state.paused = true;
  openModal({
    kind: "pause",
    kicker: "Signal paused",
    title: "Take a breath.",
    bodyHtml: `<p>The circuit is holding. Resume when you are ready to rotate another piece.</p>`,
    primary: { label: "Resume", run: () => {} },
    secondary: { label: "Restart chamber", run: resetCurrentLevel },
    tertiary: { label: "Episode index", run: () => showScreen("chambers") },
  });
}

function openVictoryModal() {
  if (!state.level || !state.result) {
    return;
  }
  state.victoryPending = false;
  const result = state.result;
  const level = state.level;
  const message =
    result.stars === 3
      ? "Perfect routing. The grid is singing."
      : result.stars === 2
        ? "Relay closed. A cleaner path is still waiting."
        : "Relay closed. There is a sharper route through the light.";
  const episodeLine = result.episodeComplete
    ? `<p><strong>Episode ${result.episodeNumber} complete.</strong>${result.nextEpisode ? ` Episode ${result.nextEpisode} is now open.` : " Every relay is closed."}</p>`
    : "";
  const nextAction = result.next
    ? {
        label: result.episodeComplete
          ? `Begin Episode ${result.nextEpisode} →`
          : "Next chamber →",
        run: () => startLevel(result.next),
      }
    : {
        label: "Return to chambers",
        run: () => showScreen("chambers"),
      };
  openModal({
    kind: "victory",
    kicker: result.episodeComplete ? "Episode complete" : "Chamber complete",
    title: level.name,
    stars: result.stars,
    bodyHtml: `
      <p>${message}</p>
      ${episodeLine}
      <dl class="result-grid">
        <div><dt>Moves</dt><dd>${result.moves}</dd></div>
        <div><dt>Par</dt><dd>${level.par}</dd></div>
        <div><dt>Best</dt><dd>${result.bestMoves}</dd></div>
      </dl>
    `,
    primary: nextAction,
    secondary: { label: "Replay", run: () => startLevel(level.id) },
    tertiary: { label: "Episode index", run: () => showScreen("chambers") },
  });
}

function openProfile() {
  if (state.screen !== "profile") {
    state.profileReturn = state.screen;
  }
  audio.playUi();
  showScreen("profile");
}

function renderProfile() {
  const stats = statsFor(state.progress);
  const { callsign, sigil } = state.progress.profile;
  elements.profileCallsignDisplay.textContent = callsign;
  elements.profileCallsign.value = callsign;
  elements.profileRank.textContent = rankFor(stats.stars);
  elements.profileSigil.dataset.sigil = sigil;
  elements.profileStatChambers.textContent = `${stats.completed} / ${stats.totalLevels}`;
  elements.profileStatStars.textContent = `${stats.stars} / ${stats.totalStars}`;
  elements.profileStatPerfect.textContent = String(stats.perfect);
  elements.profileStatMoves.textContent = String(stats.moves);
  elements.profileMusic.checked = state.progress.music;
  elements.profileSfx.checked = state.progress.sound;
  for (const option of elements.sigilOptions) {
    const checked = option.dataset.sigil === sigil;
    option.setAttribute("aria-checked", String(checked));
    option.tabIndex = checked ? 0 : -1;
  }
  renderProfileEpisodes();
  updateProfileChip();
}

function renderProfileEpisodes() {
  if (!elements.profileEpisodes) {
    return;
  }
  elements.profileEpisodes.replaceChildren();
  for (const episode of EPISODES) {
    const locked = !isUnlocked(state.progress, episode.levels[0].id);
    const cleared = episode.levels.filter((level) => state.progress.best[level.id]).length;
    const stars = episode.levels.reduce(
      (total, level) => total + (state.progress.best[level.id]?.stars ?? 0),
      0,
    );
    const complete = cleared === episode.levels.length;
    const card = document.createElement("article");
    card.className = "episode-progress-card";
    card.classList.toggle("is-locked", locked);
    card.innerHTML = `
      <div class="episode-progress-card__head">
        <div>
          <span class="episode-number">Episode ${episode.number}</span>
          <h4>${episode.name}</h4>
          <p>${episode.mechanic}</p>
        </div>
        <strong>${cleared}/${episode.levels.length}</strong>
      </div>
      <div class="episode-progress-card__bar" aria-hidden="true"><span style="width:${(cleared / episode.levels.length) * 100}%"></span></div>
      <div class="episode-progress-card__meta">
        <span>${stars}/${episode.levels.length * 3} stars</span>
        <span>${complete ? "Complete" : locked ? "Locked" : "In progress"}</span>
      </div>
    `;
    elements.profileEpisodes.append(card);
  }
}

function setProfileStatus(message) {
  if (state.profileStatusTimer) {
    clearTimeout(state.profileStatusTimer);
  }
  elements.profileSaveStatus.textContent = message;
  state.profileStatusTimer = window.setTimeout(() => {
    elements.profileSaveStatus.textContent = "";
    state.profileStatusTimer = null;
  }, 2400);
}

function saveCallsign(event) {
  event.preventDefault();
  state.progress = updateProfile(state.progress, { callsign: elements.profileCallsign.value });
  saveProgress(storage, state.progress);
  renderProfile();
  updateTitleStats();
  updateTopbarStatus();
  setProfileStatus("Callsign saved.");
  audio.playUi();
}

function chooseSigil(sigil) {
  const draft = elements.profileCallsign.value;
  state.progress = updateProfile(state.progress, { sigil });
  saveProgress(storage, state.progress);
  renderProfile();
  elements.profileCallsign.value = draft;
  setProfileStatus("Sigil updated.");
  audio.playUi();
}

function handleSigilKeydown(event) {
  const options = elements.sigilOptions;
  const current = options.indexOf(document.activeElement);
  if (current === -1) {
    return;
  }
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  let next = null;
  if (step) {
    next = (current + step + options.length) % options.length;
  } else if (event.key === "Home") {
    next = 0;
  } else if (event.key === "End") {
    next = options.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  options[next].focus();
  chooseSigil(options[next].dataset.sigil);
}

function unlockAudio() {
  if (state.audioUnlocked) {
    return;
  }
  state.audioUnlocked = true;
  audio.setEnabled(state.progress.sound);
  audio.setMusicEnabled(state.progress.music);
  if (state.progress.music) {
    audio.startMusic();
  }
}

function toggleAllAudio() {
  const enable = !(state.progress.sound || state.progress.music);
  state.progress = setSound(state.progress, enable);
  state.progress = setMusic(state.progress, enable);
  saveProgress(storage, state.progress);
  if (enable) {
    state.audioUnlocked = true;
    audio.setEnabled(true);
    audio.setMusicEnabled(true);
    audio.startMusic();
  } else {
    audio.stopMusic();
    audio.setEnabled(false);
    audio.setMusicEnabled(false);
  }
  updateSoundButton();
  if (state.screen === "profile") {
    elements.profileMusic.checked = state.progress.music;
    elements.profileSfx.checked = state.progress.sound;
  }
  if (enable) {
    audio.playUi();
  }
}

function toggleMusic(enabled) {
  state.progress = setMusic(state.progress, enabled);
  saveProgress(storage, state.progress);
  audio.setMusicEnabled(state.progress.music);
  if (state.progress.music) {
    unlockAudio();
    audio.startMusic();
  } else {
    audio.stopMusic();
  }
  updateSoundButton();
}

function toggleEffects(enabled) {
  state.progress = setSound(state.progress, enabled);
  saveProgress(storage, state.progress);
  audio.setEnabled(state.progress.sound);
  updateSoundButton();
  if (state.progress.sound) {
    audio.playUi();
  }
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

function handleGlobalKeydown(event) {
  if (elements.modal.open || isTypingTarget(event.target)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "m") {
    toggleAllAudio();
    return;
  }
  if (key === "p") {
    event.preventDefault();
    if (state.screen === "profile") {
      showScreen(state.profileReturn === "profile" ? "title" : state.profileReturn);
    } else {
      openProfile();
    }
    return;
  }
  if (state.screen === "profile" && event.key === "Escape") {
    event.preventDefault();
    showScreen(state.profileReturn === "profile" ? "title" : state.profileReturn);
    return;
  }
  if (state.screen !== "game") {
    return;
  }
  if (key === "r") {
    event.preventDefault();
    resetCurrentLevel();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    openPauseModal();
  }
}

function previewVictory() {
  if (!state.session) {
    startLevel(LEVELS[0].id, { preview: true, silent: true });
  }
  const solution = solveLevel(state.level);
  if (solution) {
    state.session.board.rotatables.forEach((piece, index) => {
      piece.orientation = solution.orientations[index];
    });
    state.session.moves = solution.moves;
    traceSession();
    state.completed = true;
    updateBoard();
  }
  const episode = episodeForLevel(state.level.id);
  const next = nextLevel(state.level.id);
  const nextEpisode = next ? episodeForLevel(next.id) : null;
  state.completed = true;
  state.result = {
    stars: 3,
    moves: state.session.moves,
    previousBest: null,
    bestMoves: state.session.moves,
    next: next?.id ?? null,
    nextEpisode: nextEpisode?.number ?? null,
    episodeComplete: !next || nextEpisode.id !== episode.id,
    episodeNumber: episode?.number ?? "I",
    preview: true,
  };
  openVictoryModal();
}

function applyQueryState() {
  const params = new URLSearchParams(window.location.search);
  const requestedLevel = params.get("level");
  const requestedScreen = params.get("screen");
  const preview = params.get("preview");

  if (requestedLevel) {
    startLevel(requestedLevel, { preview: Boolean(preview), silent: true });
  } else if (requestedScreen === "chambers") {
    showScreen("chambers");
  } else if (requestedScreen === "profile") {
    state.profileReturn = "title";
    showScreen("profile");
  } else if (requestedScreen === "game") {
    startLevel(LEVELS[0].id, { preview: Boolean(preview), silent: true });
  } else {
    showScreen("title");
  }

  if (preview === "howto") {
    openHowToModal();
  } else if (preview === "pause") {
    if (!state.session) {
      startLevel(LEVELS[0].id, { preview: true, silent: true });
    }
    openPauseModal();
  } else if (preview === "victory") {
    previewVictory();
  }
}

function bindEvents() {
  elements.board.addEventListener("click", handleBoardClick);
  elements.board.addEventListener("keydown", handleBoardKeydown);
  document.querySelectorAll('[data-ui="start-game"]').forEach((button) => {
    button.addEventListener("click", () => startLevel(nextPlayableLevel().id));
  });
  document.querySelectorAll('[data-ui="open-chambers"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      showScreen("chambers");
    });
  });
  document.querySelectorAll('[data-ui="open-howto"]').forEach((button) => {
    button.addEventListener("click", openHowToModal);
  });
  document.querySelectorAll('[data-ui="open-profile"]').forEach((button) => {
    button.addEventListener("click", openProfile);
  });
  document.querySelectorAll('[data-ui="back-to-title"], [data-ui="brand-home"]').forEach((button) => {
    button.addEventListener("click", () => showScreen("title"));
  });
  document.querySelectorAll('[data-ui="game-back"]').forEach((button) => {
    button.addEventListener("click", () => showScreen("chambers"));
  });
  document.querySelectorAll('[data-ui="reset-level"], [data-ui="restart-level-side"]').forEach((button) => {
    button.addEventListener("click", resetCurrentLevel);
  });
  document.querySelectorAll('[data-ui="pause-game"]').forEach((button) => {
    button.addEventListener("click", openPauseModal);
  });
  elements.profileBack?.addEventListener("click", () => {
    showScreen(state.profileReturn === "profile" ? "title" : state.profileReturn);
  });
  elements.profileForm?.addEventListener("submit", saveCallsign);
  for (const option of elements.sigilOptions) {
    option.addEventListener("click", () => chooseSigil(option.dataset.sigil));
  }
  elements.sigilPicker?.addEventListener("keydown", handleSigilKeydown);
  elements.profileMusic?.addEventListener("change", (event) => {
    toggleMusic(event.target.checked);
  });
  elements.profileSfx?.addEventListener("change", (event) => {
    toggleEffects(event.target.checked);
  });
  elements.soundToggle?.addEventListener("click", toggleAllAudio);
  elements.modalClose?.addEventListener("click", closeModal);
  elements.modal.addEventListener("close", () => {
    state.modalOpen = false;
    state.modalKind = null;
    state.paused = false;
    if (state.victoryPending && state.screen === "game") {
      state.victoryPending = false;
      openVictoryModal();
    }
  });
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      audio.stopMusic();
    } else if (state.audioUnlocked && state.progress.music) {
      audio.startMusic();
    }
  });
}

audio.setEnabled(state.progress.sound);
audio.setMusicEnabled(state.progress.music);
bindEvents();
updateProfileChip();
updateSoundButton();
updateTitleStats();
applyQueryState();
