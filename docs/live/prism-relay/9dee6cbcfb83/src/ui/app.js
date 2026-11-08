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
  cellNear,
  createSession,
  resetSession,
  rotateSessionCell,
  starsFor,
  traceBeams,
  undoSession,
} from "../game/engine.js";
import { solveLevel } from "../game/solver.js";
import * as audio from "./audio.js";
import {
  BOARD_MAX_WIDTH,
  BOARD_MIN_WIDTH,
  MOBILE_MIN_CELL,
  TALL_MIN_CELL,
  fitBoardWidth,
  wideBoardNeedsPan,
} from "./layout.js";
import {
  isUnlocked,
  loadProgress,
  nextEpisodeId,
  episodeIdAfterLevel,
  rankProgress,
  recordResult,
  saveProgress,
  setMusic,
  setSound,
  statsFor,
  updateProfile,
} from "./progress.js";
import { feedbackFor, livePortalPairs, newlyLitKeys, portalTransitKey } from "./cues.js";
import { parHint, postVictoryAction, relayCtaLabel, restartPrompt, saveStatusMessage } from "./hints.js";
import { mechanicNotes } from "./mechanics.js";
import { starLabel, starsMarkup } from "./stars.js";
import {
  dailyDateLabelForKey,
  dailyHistory,
  dailyLevelId,
  dailyStats,
  dailySummary,
  dateKey,
  loadDaily,
  recordDailyResult,
  saveDaily,
} from "./daily.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const compactLayout = window.matchMedia("(max-width: 900px)");
const BOARD_FOOT_RESERVE = 56;
const chargeTimers = new WeakMap();
const turnTimers = new WeakMap();

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
  dailyRun: document.querySelector('[data-ui="daily-run"]'),
  dailyDate: document.getElementById("daily-date"),
  dailyLevel: document.getElementById("daily-level"),
  dailyStatus: document.getElementById("daily-status"),
  dailyStreak: document.getElementById("daily-streak"),
  dailyHistory: document.getElementById("daily-history"),
  startLabel: document.getElementById("start-label"),
  chamberGrid: document.getElementById("chamber-grid"),
  chamberTabs: document.getElementById("episode-tabs"),
  chamberProgressFill: document.getElementById("chamber-progress-fill"),
  chamberProgressTrack: document.getElementById("chamber-progress-track"),
  chamberProgressValue: document.getElementById("chamber-progress-value"),
  gameChapter: document.getElementById("game-chapter"),
  gameTitle: document.getElementById("game-title"),
  gameSubtitle: document.getElementById("game-subtitle"),
  hudMoves: document.getElementById("hud-moves"),
  hudPar: document.getElementById("hud-par"),
  hudStars: document.getElementById("hud-stars"),
  hudRelays: document.getElementById("hud-relays"),
  undoMove: document.querySelector('[data-ui="undo-move"]'),
  gameHint: document.getElementById("game-hint"),
  gameMechanic: document.getElementById("game-mechanic"),
  statusLine: document.getElementById("status-line"),
  nextStep: document.querySelector('[data-ui="next-step"]'),
  board: document.getElementById("board"),
  boardFrame: document.getElementById("board-frame"),
  boardViewport: document.getElementById("board-viewport"),
  boardStage: document.getElementById("board-stage"),
  boardPanHint: document.getElementById("board-pan-hint"),
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
  profileRankNext: document.getElementById("profile-rank-next"),
  profileForm: document.getElementById("profile-form"),
  profileCallsign: document.getElementById("profile-callsign"),
  profileSaveStatus: document.getElementById("profile-save-status"),
  profileStatChambers: document.getElementById("profile-stat-chambers"),
  profileStatStars: document.getElementById("profile-stat-stars"),
  profileStatPerfect: document.getElementById("profile-stat-perfect"),
  profileStatMoves: document.getElementById("profile-stat-moves"),
  profileStatDaily: document.getElementById("profile-stat-daily"),
  profileStatStreak: document.getElementById("profile-stat-streak"),
  profileEpisodes: document.getElementById("profile-episodes"),
  profileMusic: document.getElementById("profile-music"),
  profileSfx: document.getElementById("profile-sfx"),
  sigilPicker: document.querySelector('[data-ui="sigil-picker"]'),
  sigilOptions: [...document.querySelectorAll('[data-ui="sigil-option"]')],
};

const state = {
  progress: loadProgress(storage),
  daily: loadDaily(storage),
  screen: "title",
  chamberEpisode: null,
  dailyDate: null,
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
  if (name === "game") {
    fitBoardToViewport();
  }
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

function updateTitleStats() {
  const stats = statsFor(state.progress);
  elements.titleStars.textContent = String(stats.stars).padStart(2, "0");
  elements.titleBest.textContent = stats.completed > 0 ? `${stats.moves} moves` : "—";
  if (elements.startLabel) {
    elements.startLabel.textContent = relayCtaLabel(stats.completed, stats.totalLevels);
  }
  const today = new Date();
  const summary = dailySummary(state.daily, today);
  const dailyLevel = LEVELS.find((level) => level.id === summary.levelId) ?? LEVELS[0];
  const status = summary.result
    ? `${summary.result.moves} moves · ${summary.result.stars} stars`
    : "Not run yet";
  const streak = summary.streak > 0 ? `${summary.streak}-day streak` : "Start a streak";
  const history = dailyHistory(state.daily, today);
  const played = history.filter((entry) => entry.played).length;
  if (elements.dailyHistory) {
    elements.dailyHistory.replaceChildren();
    for (const entry of history) {
      const dot = document.createElement("span");
      dot.className = "daily-card__day";
      dot.classList.toggle("is-played", entry.played);
      dot.classList.toggle("is-today", entry.today);
      dot.dataset.date = entry.key;
      elements.dailyHistory.append(dot);
    }
  }
  if (elements.dailyDate) {
    elements.dailyDate.textContent = summary.label;
  }
  if (elements.dailyLevel) {
    elements.dailyLevel.textContent = dailyLevel.name;
  }
  if (elements.dailyStatus) {
    elements.dailyStatus.textContent = status;
  }
  if (elements.dailyStreak) {
    elements.dailyStreak.textContent = streak;
  }
  if (elements.dailyRun) {
    elements.dailyRun.dataset.level = summary.levelId;
    elements.dailyRun.setAttribute(
      "aria-label",
      `Daily relay for ${summary.label}: ${dailyLevel.name}. ${summary.result ? `${summary.result.moves} moves, ${summary.result.stars} stars` : "Not run yet"}. ${streak}. Played ${played} of the last ${history.length} days.`,
    );
  }
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

function renderChambers() {
  if (!elements.chamberGrid) {
    return;
  }
  elements.chamberGrid.replaceChildren();
  const activeEpisode =
    state.chamberEpisode &&
    EPISODES.some((episode) => episode.id === state.chamberEpisode)
      ? state.chamberEpisode
      : nextEpisodeId(state.progress);
  if (elements.chamberTabs) {
    elements.chamberTabs.replaceChildren();
    for (const episode of EPISODES) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "episode-tab";
      tab.dataset.ui = "episode-tab";
      tab.dataset.episode = episode.id;
      tab.classList.toggle("is-active", episode.id === activeEpisode);
      tab.setAttribute("aria-pressed", String(episode.id === activeEpisode));
      tab.setAttribute("aria-label", `Episode ${episode.number}: ${episode.name}`);
      tab.textContent = `EP ${episode.number}`;
      tab.addEventListener("click", () => {
        state.chamberEpisode = episode.id;
        renderChambers();
        elements.chamberTabs?.querySelector(".is-active")?.focus();
      });
      elements.chamberTabs.append(tab);
    }
  }
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
    block.classList.toggle("is-active", episode.id === activeEpisode);
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
  state.dailyDate = options.dailyDate ?? null;
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
  fitBoardToViewport();
}

function fitBoardToViewport() {
  if (
    !elements.boardFrame ||
    !state.session ||
    elements.boardFrame.offsetParent === null
  ) {
    return;
  }
  const frame = elements.boardFrame;
  frame.style.width = "";
  if (elements.boardStage) {
    elements.boardStage.style.width = "";
  }
  const styles = getComputedStyle(frame);
  const frameX =
    (Number.parseFloat(styles.paddingLeft) || 0) +
    (Number.parseFloat(styles.paddingRight) || 0) +
    (Number.parseFloat(styles.borderLeftWidth) || 0) +
    (Number.parseFloat(styles.borderRightWidth) || 0);
  const frameY =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0) +
    (Number.parseFloat(styles.borderTopWidth) || 0) +
    (Number.parseFloat(styles.borderBottomWidth) || 0);
  const rect = frame.getBoundingClientRect();
  let documentTop = 0;
  for (let node = frame; node; node = node.offsetParent) {
    documentTop += node.offsetTop;
  }
  if (compactLayout.matches) {
    const board = state.session.board;
    const viewportWidth = elements.boardViewport?.clientWidth ?? 0;
    if (wideBoardNeedsPan({ columns: board.width, rows: board.height, viewportWidth })) {
      elements.boardStage.style.width = `${board.width * MOBILE_MIN_CELL}px`;
    } else if (board.height > board.width) {
      const availableHeight = window.innerHeight - documentTop - 8;
      if (rect.height > availableHeight) {
        const fit = fitBoardWidth({
          columns: board.width,
          rows: board.height,
          availableHeight,
          paddingX: frameX,
          paddingY: frameY,
          minWidth: board.width * TALL_MIN_CELL + frameX,
          maxWidth: Math.min(BOARD_MAX_WIDTH, rect.width),
        });
        const fitHeight =
          ((fit - frameX) * board.height) / board.width + frameY;
        if (fitHeight <= availableHeight || fit < rect.width - 24) {
          frame.style.width = `${fit}px`;
        }
      }
    }
    updateBoardPanHint();
    return;
  }
  const availableHeight = window.innerHeight - documentTop - BOARD_FOOT_RESERVE;
  const width = fitBoardWidth({
    columns: state.session.board.width,
    rows: state.session.board.height,
    availableHeight,
    paddingX: frameX,
    paddingY: frameY,
    minWidth: BOARD_MIN_WIDTH,
    maxWidth: Math.min(BOARD_MAX_WIDTH, rect.width),
  });
  frame.style.width = `${width}px`;
  updateBoardPanHint();
}

function updateBoardPanHint() {
  if (!elements.boardPanHint || !state.session) {
    return;
  }
  const board = state.session.board;
  const viewportWidth = elements.boardViewport?.clientWidth ?? 0;
  elements.boardPanHint.hidden =
    !compactLayout.matches ||
    !wideBoardNeedsPan({ columns: board.width, rows: board.height, viewportWidth });
}

let boardFitFrame = 0;

function scheduleBoardFit() {
  if (boardFitFrame) {
    return;
  }
  boardFitFrame = requestAnimationFrame(() => {
    boardFitFrame = 0;
    fitBoardToViewport();
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
  state.session.litKeys = [...trace.lit];
  state.session.complete = trace.complete;
  if (trace.complete) {
    state.session.stars = starsFor(state.session.moves, state.level.par);
  }
  return trace;
}

function updateBoard(previousLit = null) {
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
  if (previousLit) {
    markChargedReceivers(previousLit, trace.lit);
  } else {
    clearChargeBursts();
  }
  const livePairs = new Set(livePortalPairs(state.session.board, trace.paths));
  for (const portal of state.session.board.portals) {
    const node = state.cellElements.get(`${portal.x},${portal.y}`);
    if (!node) {
      continue;
    }
    const live = livePairs.has(portal.pair);
    node.classList.toggle("is-live", live);
    node.setAttribute(
      "aria-label",
      live
        ? `${cellLabel(portal)} The beam is passing through this pair.`
        : cellLabel(portal),
    );
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
  const board = state.session.board;
  const lit = new Set(state.session.litKeys ?? []);
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
    const end = path.points[path.points.length - 1];
    if (!end) {
      continue;
    }
    const cell = cellNear(board, end);
    if (cell?.kind === "portal") {
      continue;
    }
    const key = cell ? `${cell.x},${cell.y}` : null;
    const isLit = key !== null && lit.has(key);
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", end.x.toFixed(2));
    dot.setAttribute("cy", end.y.toFixed(2));
    dot.setAttribute("r", isLit ? "0.11" : "0.085");
    dot.setAttribute(
      "class",
      `beam-end beam-end--${color} beam-end--${isLit ? "lit" : "dead"}`,
    );
    elements.beamLayer.append(dot);
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
  elements.gameChapter.textContent = state.dailyDate
    ? `Daily relay / ${dailyDateLabelForKey(state.dailyDate)}`
    : `Episode ${episode?.number ?? "I"} / Chamber ${state.level.chapter}`;
  elements.gameTitle.textContent = state.level.name;
  elements.gameSubtitle.textContent = state.level.subtitle;
  elements.hudMoves.textContent = String(state.session.moves);
  elements.hudPar.textContent = String(state.level.par);
  const pace = starsFor(state.session.moves, state.level.par);
  if (elements.hudStars) {
    elements.hudStars.innerHTML = starsMarkup(pace);
    elements.hudStars.setAttribute(
      "aria-label",
      `On pace for ${pace} star${pace === 1 ? "" : "s"}`,
    );
  }
  elements.hudRelays.textContent = `${lit}/${total}`;
  if (elements.undoMove) {
    elements.undoMove.disabled = state.session.history.length === 0;
  }
  elements.gameHint.textContent = board.portals.length
    ? "Portals preserve direction. Follow the paired number."
    : board.splitters.length
      ? "Click a splitter to flip which side receives the fork."
      : parHint(state.level.par);
  elements.legendSplitter.hidden = board.splitters.length === 0;
  elements.legendPortal.hidden = board.portals.length === 0;

  const mechanics = mechanicNotes(board);
  elements.gameMechanic.hidden = mechanics.length === 0;
  elements.gameMechanic.innerHTML = mechanics
    .map(({ name, text }) => `<strong>${name}</strong>${text}`)
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
  const nextAction = state.completed ? postVictoryAction(state.result) : null;
  if (elements.nextStep) {
    elements.nextStep.hidden = !nextAction;
    if (nextAction) {
      elements.nextStep.textContent = nextAction.label;
    }
  }
}

function markChargedReceivers(previousLit, lit) {
  const charged = new Set(newlyLitKeys(previousLit, lit));
  for (const receiver of state.session.board.receivers) {
    const node = state.cellElements.get(`${receiver.x},${receiver.y}`);
    if (!node) {
      continue;
    }
    const timer = chargeTimers.get(node);
    if (timer) {
      clearTimeout(timer);
      chargeTimers.delete(node);
    }
    node.classList.remove("is-charging");
    if (!charged.has(`${receiver.x},${receiver.y}`)) {
      continue;
    }
    void node.offsetWidth;
    node.classList.add("is-charging");
    chargeTimers.set(
      node,
      window.setTimeout(() => {
        node.classList.remove("is-charging");
        chargeTimers.delete(node);
      }, 600),
    );
  }
}

function clearChargeBursts() {
  if (!state.session) {
    return;
  }
  for (const receiver of state.session.board.receivers) {
    const node = state.cellElements.get(`${receiver.x},${receiver.y}`);
    if (!node) {
      continue;
    }
    const timer = chargeTimers.get(node);
    if (timer) {
      clearTimeout(timer);
      chargeTimers.delete(node);
    }
    node.classList.remove("is-charging");
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
  state.session.stars = stars;
  if (state.dailyDate) {
    state.daily = recordDailyResult(
      state.daily,
      state.dailyDate,
      level.id,
      state.session.moves,
      stars,
    );
    const saved = saveDaily(storage, state.daily);
    const summary = dailySummary(state.daily, new Date());
    state.result = {
      stars,
      moves: state.session.moves,
      bestMoves: state.daily.days[state.dailyDate]?.moves ?? state.session.moves,
      bestStars: state.daily.days[state.dailyDate]?.stars ?? stars,
      daily: true,
      dailyDate: state.dailyDate,
      streak: summary.streak,
      preview: false,
      saveFailed: !saved,
    };
  } else {
    const nextEpisodeTab = episodeIdAfterLevel(level.id);
    if (nextEpisodeTab) {
      state.chamberEpisode = nextEpisodeTab;
    }
    const previousBest = state.progress.best[level.id] ?? null;
    state.progress = recordResult(
      state.progress,
      level.id,
      state.session.moves,
      stars,
      next?.id ?? null,
    );
    const saved = saveProgress(storage, state.progress);
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
      saveFailed: !saved,
    };
  }
  updateGameView();
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
  const beforeLit = new Set(state.session.litKeys ?? []);
  const before = {
    lit: state.session.litCount,
    portalKey: portalTransitKey(state.session.board, state.session.paths),
  };
  const changed = rotateSessionCell(state.session, x, y);
  if (!changed || !cell) {
    return;
  }
  for (const piece of state.rotatableCells) {
    piece.element.tabIndex = piece.element === element ? 0 : -1;
    piece.element.classList.toggle("is-last-moved", piece.element === element);
  }
  if (cell.kind === "splitter") {
    audio.playSplit();
  } else {
    audio.playRotate();
  }
  const feedback = feedbackFor(before, {
    lit: state.session.litCount,
    portalKey: portalTransitKey(state.session.board, state.session.paths),
  });
  if (feedback.charge) {
    audio.playCharge();
  }
  if (feedback.portal) {
    audio.playPortal();
  }
  const priorTurn = turnTimers.get(element);
  if (priorTurn) {
    clearTimeout(priorTurn);
    turnTimers.delete(element);
  }
  element.classList.remove("is-turning");
  void element.offsetWidth;
  element.classList.add("is-turning");
  turnTimers.set(
    element,
    window.setTimeout(() => {
      element.classList.remove("is-turning");
      turnTimers.delete(element);
    }, 320),
  );
  updateBoard(beforeLit);
}

function undoLastMove() {
  if (
    state.screen !== "game" ||
    state.paused ||
    state.completed ||
    state.modalOpen ||
    !state.session ||
    !state.level
  ) {
    return;
  }
  const last = state.session.history[state.session.history.length - 1];
  if (!undoSession(state.session)) {
    return;
  }
  state.result = null;
  state.victoryPending = false;
  for (const piece of state.rotatableCells) {
    const timer = turnTimers.get(piece.element);
    if (timer) {
      clearTimeout(timer);
      turnTimers.delete(piece.element);
    }
    piece.element.classList.remove("is-turning");
    piece.element.classList.toggle(
      "is-last-moved",
      Boolean(last) && piece.element === state.cellElements.get(`${last.x},${last.y}`),
    );
  }
  updateBoard();
  audio.playUi();
}

function requestReset() {
  if (!state.session || !state.level || state.screen !== "game" || state.modalOpen) {
    return;
  }
  if (state.session.moves === 0 || state.completed) {
    resetCurrentLevel();
    return;
  }
  state.paused = true;
  const copy = restartPrompt(state.level.name, state.session.moves);
  audio.playUi();
  openModal({
    kind: "restart",
    kicker: "Restart chamber",
    title: copy.title,
    bodyHtml: `<p>${copy.body}</p>`,
    primary: { label: "Keep playing", run: () => {} },
    secondary: { label: "Restart chamber", run: resetCurrentLevel },
  });
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
    const timer = turnTimers.get(piece.element);
    if (timer) {
      clearTimeout(timer);
      turnTimers.delete(piece.element);
    }
    piece.element.classList.remove("is-turning");
    piece.element.classList.remove("is-last-moved");
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
  if (result.daily) {
    const saveWarning = result.saveFailed
      ? `<p class="modal__fine">Today's daily result is not being stored.</p>`
      : "";
    const streakLine =
      result.streak > 1
        ? `<p><strong>${result.streak}-day streak.</strong> Return tomorrow to keep it alive.</p>`
        : `<p><strong>Streak started.</strong> Return tomorrow to keep it alive.</p>`;
    openModal({
      kind: "victory",
      kicker: "Daily relay cleared",
      title: level.name,
      stars: result.stars,
      bodyHtml: `
        <p>${message}</p>
        ${streakLine}
        <dl class="result-grid">
          <div><dt>Moves</dt><dd>${result.moves}</dd></div>
          <div><dt>Par</dt><dd>${level.par}</dd></div>
          <div><dt>Best today</dt><dd>${result.bestMoves} · ${result.bestStars} stars</dd></div>
        </dl>
        <p class="modal__fine">Daily results stay separate; campaign progress is unchanged.</p>
        ${saveWarning}
      `,
      primary: { label: "Back to title", run: () => showScreen("title") },
      secondary: {
        label: "Play again",
        run: () => startLevel(level.id, { dailyDate: result.dailyDate }),
      },
    });
    return;
  }
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
  const saveWarning = result.saveFailed
    ? `<p class="modal__fine">Progress for this run is not being stored.</p>`
    : "";
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
      ${saveWarning}
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
  const rank = rankProgress(stats.stars);
  elements.profileCallsignDisplay.textContent = callsign;
  elements.profileCallsign.value = callsign;
  elements.profileRank.textContent = rank.current;
  if (elements.profileRankNext) {
    elements.profileRankNext.textContent = rank.next
      ? `${rank.remaining} star${rank.remaining === 1 ? "" : "s"} to ${rank.next}`
      : `All ${rank.target} stars collected`;
  }
  elements.profileSigil.dataset.sigil = sigil;
  elements.profileStatChambers.textContent = `${stats.completed} / ${stats.totalLevels}`;
  elements.profileStatStars.textContent = `${stats.stars} / ${stats.totalStars}`;
  elements.profileStatPerfect.textContent = String(stats.perfect);
  elements.profileStatMoves.textContent = String(stats.moves);
  const lifetimeDaily = dailyStats(state.daily);
  if (elements.profileStatDaily) {
    elements.profileStatDaily.textContent = String(lifetimeDaily.totalDays);
  }
  if (elements.profileStatStreak) {
    elements.profileStatStreak.textContent = String(lifetimeDaily.bestStreak);
  }
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
  const saved = saveProgress(storage, state.progress);
  renderProfile();
  updateTitleStats();
  updateTopbarStatus();
  setProfileStatus(saveStatusMessage(saved, "Callsign saved."));
  audio.playUi();
}

function chooseSigil(sigil) {
  const draft = elements.profileCallsign.value;
  state.progress = updateProfile(state.progress, { sigil });
  const saved = saveProgress(storage, state.progress);
  renderProfile();
  elements.profileCallsign.value = draft;
  setProfileStatus(saveStatusMessage(saved, "Sigil updated."));
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
  const saved = saveProgress(storage, state.progress);
  if (!saved && state.screen === "profile") {
    setProfileStatus(saveStatusMessage(false, ""));
  }
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
  const saved = saveProgress(storage, state.progress);
  if (!saved && state.screen === "profile") {
    setProfileStatus(saveStatusMessage(false, ""));
  }
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
  const saved = saveProgress(storage, state.progress);
  if (!saved && state.screen === "profile") {
    setProfileStatus(saveStatusMessage(false, ""));
  }
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
    requestReset();
    return;
  }
  if (key === "z") {
    event.preventDefault();
    undoLastMove();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    audio.playUi();
    openPauseModal();
  }
}

function previewVictory() {
  if (!state.session) {
    startLevel(LEVELS[0].id, { preview: true, silent: true });
  }
  const rotatables = state.session.board.rotatables;
  const embedded = state.level.solution;
  if (Array.isArray(embedded) && embedded.length === rotatables.length) {
    rotatables.forEach((piece, index) => {
      piece.orientation = embedded[index];
    });
    state.session.moves = state.level.par;
    traceSession();
    state.completed = true;
    updateBoard();
  } else {
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
  updateGameView();
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
  elements.dailyRun?.addEventListener("click", () => {
    const now = new Date();
    startLevel(dailyLevelId(now), { dailyDate: dateKey(now) });
  });
  document.querySelectorAll('[data-ui="open-chambers"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      showScreen("chambers");
    });
  });
  document.querySelectorAll('[data-ui="open-howto"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      openHowToModal();
    });
  });
  document.querySelectorAll('[data-ui="open-profile"]').forEach((button) => {
    button.addEventListener("click", openProfile);
  });
  document.querySelectorAll('[data-ui="back-to-title"], [data-ui="brand-home"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      showScreen("title");
    });
  });
  document.querySelectorAll('[data-ui="game-back"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      showScreen("chambers");
    });
  });
  document.querySelectorAll('[data-ui="reset-level"], [data-ui="restart-level-side"]').forEach((button) => {
    button.addEventListener("click", requestReset);
  });
  elements.undoMove?.addEventListener("click", undoLastMove);
  elements.nextStep?.addEventListener("click", () => {
    const action = postVictoryAction(state.result);
    if (!action) {
      return;
    }
    if (action.levelId) {
      startLevel(action.levelId, action.dailyDate ? { dailyDate: action.dailyDate } : {});
    } else {
      showScreen(action.screen ?? "chambers");
    }
  });
  document.querySelectorAll('[data-ui="pause-game"]').forEach((button) => {
    button.addEventListener("click", () => {
      audio.playUi();
      openPauseModal();
    });
  });
  elements.profileBack?.addEventListener("click", () => {
    audio.playUi();
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
  elements.modalClose?.addEventListener("click", () => {
    audio.playUi();
    closeModal();
  });
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
  window.addEventListener("resize", scheduleBoardFit);
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
