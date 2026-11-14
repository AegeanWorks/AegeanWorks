import { getMotif, motifList } from "../studio/motifs.js";
import { gridTargetIndex } from "../studio/navigation.js";
import { paletteList, getPalette } from "../studio/palettes.js";
import { svgToPng } from "../studio/raster.js";
import {
  DEFAULT_EXPORT_SIZE,
  EXPORT_SIZES,
  describeExportSize,
  exportSize,
  formatExportResult,
  pngName,
  renderExportSvg,
} from "../studio/export.js";
import { renderSvg } from "../studio/svg.js";
import {
  DEFAULTS,
  PRESETS,
  activePresetId,
  applyPreset,
  decodeSearch,
  encodeState,
  exportName,
  normalizeState,
  presetState,
  randomizeState,
  reseedState,
  shareSummary,
  thumbKey,
  transformLabel,
} from "../studio/state.js";
import {
  GALLERY_VERSION,
  activeEntryId,
  addEntry,
  emptyGallery,
  evictionCandidate,
  isSaved,
  mergeEntry,
  neighborEntryId,
  normalizeGalleryRecord,
  removeEntry,
  renameEntry,
  restoreEntry,
} from "../studio/gallery.js";
import { pushHistory, stepBack, stepForward } from "../studio/history.js";
import {
  GALLERY_KEY,
  STORAGE_KEY,
  clearGallery,
  clearState,
  readGallery,
  readState,
  saveGallery,
  saveState,
} from "../studio/storage.js";

const stage = document.getElementById("stage");
const motifGrid = document.getElementById("motif-grid");
const paletteGrid = document.getElementById("palette-grid");
const presetList = document.getElementById("preset-list");
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const repeatInput = document.getElementById("repeat");
const weightInput = document.getElementById("weight");
const warpInput = document.getElementById("warp");
const rotateInput = document.getElementById("rotate");
const flipInput = document.getElementById("flip");
const repeatValue = document.getElementById("repeat-value");
const weightValue = document.getElementById("weight-value");
const warpValue = document.getElementById("warp-value");
const seedValue = document.getElementById("seed-value");
const motionInput = document.getElementById("motion");
const motionNote = document.getElementById("motion-note");
const guidesInput = document.getElementById("guides");
const soundInput = document.getElementById("sound");
const stageMotif = document.getElementById("stage-motif");
const stagePalette = document.getElementById("stage-palette");
const stageRepeat = document.getElementById("stage-repeat");
const stageSeed = document.getElementById("stage-seed");
const stageTransform = document.getElementById("stage-transform");
const stageTransformDivider = document.getElementById("stage-transform-divider");
const stageEffects = document.getElementById("stage-effects");
const pngSizeInput = document.getElementById("png-size");
const exportPngButton = document.getElementById("export-png");
const exportStatus = document.getElementById("export-status");
const galleryList = document.getElementById("gallery-list");
const saveLookButton = document.getElementById("save-look");
const copyLinkButton = document.getElementById("copy-link");
const clearGalleryButton = document.getElementById("clear-gallery");
const backupGalleryButton = document.getElementById("backup-gallery");
const restoreGalleryButton = document.getElementById("restore-gallery");
const restoreFileInput = document.getElementById("restore-file");
const storageNote = document.getElementById("storage-note");
const toast = document.getElementById("toast");
const shortcutPanel = document.getElementById("shortcuts");
const shortcutSummary = document.getElementById("shortcuts-summary");
const reducedMotionQuery =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

function prefersReducedMotion() {
  return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let state = normalizeState(DEFAULTS);
let historyBaseline = state;
let pastStates = [];
let futureStates = [];
let lastThumbKey = "";
let thumbFrame = 0;
let pngSize = DEFAULT_EXPORT_SIZE;
let gallery = emptyGallery();
let galleryIssue = null;
let galleryRovingId = "";
let clearArmed = false;
let clearTimer = 0;
let deleteArmedId = "";
let deleteTimer = 0;
let statePersisted = true;
let stateReadFailed = false;
let stateIssue = null;
let toastTimer = 0;
let settleTimer = 0;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let audioContext = null;

function cue(kind) {
  if (!state.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(kind === "save" ? 660 : kind === "export" ? 880 : 520, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch {}
}

function announce(message) {
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  window.requestAnimationFrame(() => toast.classList.add("is-visible"));
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 220);
  }, 2400);
}

function persistedNotice(message, persisted) {
  if (persisted) return message;
  return `${message.replace(/\.$/, "")}. Browser storage is unavailable, so this lasts for this session only.`;
}

const STORAGE_WRITE_NOTE = "Browser storage is unavailable, so pattern changes last for this session only.";
const STORAGE_READ_NOTE = "Saved settings could not be read. Starting from the defaults.";

function setStorageNote(message, visible) {
  if (!storageNote) return;
  if (message) storageNote.textContent = message;
  storageNote.hidden = !visible;
}

function syncStorageNote(persisted) {
  if (persisted && stateReadFailed) {
    stateReadFailed = false;
    setStorageNote(null, false);
  }
  if (persisted === statePersisted) return;
  statePersisted = persisted;
  if (!persisted) {
    setStorageNote(STORAGE_WRITE_NOTE, true);
    announce(STORAGE_WRITE_NOTE);
  } else if (!stateReadFailed) {
    setStorageNote(null, false);
  }
}

function sameState(a, b) {
  return encodeState(a) === encodeState(b);
}

function syncHistoryButtons() {
  if (undoButton) undoButton.disabled = pastStates.length === 0;
  if (redoButton) redoButton.disabled = futureStates.length === 0;
}

function commitHistory() {
  if (sameState(state, historyBaseline)) return false;
  pastStates = pushHistory(pastStates, historyBaseline);
  futureStates = [];
  historyBaseline = state;
  syncHistoryButtons();
  return true;
}

function undo() {
  commitHistory();
  const step = stepBack(pastStates, futureStates, state);
  if (!step) return;
  pastStates = step.past;
  futureStates = step.future;
  state = step.state;
  historyBaseline = state;
  update({ settle: true });
  announce("Undid the last change.");
}

function redo() {
  commitHistory();
  const step = stepForward(pastStates, futureStates, state);
  if (!step) return;
  pastStates = step.past;
  futureStates = step.future;
  state = step.state;
  historyBaseline = state;
  update({ settle: true });
  announce("Redid the last change.");
}

function randomizeLook() {
  state = randomizeState(state, Math.random);
  commitHistory();
  update({ settle: true });
  announce("A new pattern, picked at random.");
  cue("select");
}

function reseedLook() {
  state = reseedState(state, Math.random);
  commitHistory();
  update({ settle: true });
  announce(`Seed ${state.seed}.`);
  cue("select");
}

function motifOptions() {
  return motifList();
}

function paletteOptions() {
  return paletteList();
}

function buildMotifButtons() {
  if (!motifGrid) return;
  motifGrid.replaceChildren();
  for (const motif of motifOptions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "motif-button";
    button.dataset.motif = motif.id;
    button.setAttribute("aria-pressed", "false");
    button.tabIndex = motif.id === state.motif ? 0 : -1;
    button.setAttribute("aria-label", `${motif.name} motif. ${motif.note}`);

    const icon = document.createElement("span");
    icon.className = "motif-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = renderSvg(
      { ...state, motif: motif.id, repeat: 2, guides: false, motion: false },
      { width: 132, height: 92, repeat: 2, decorative: true, idPrefix: `thumb-${motif.id}` },
    );

    const label = document.createElement("span");
    label.className = "motif-label";
    label.textContent = motif.name;

    button.append(icon, label);
    button.addEventListener("click", () => {
      state = normalizeState({ ...state, motif: motif.id });
      commitHistory();
      update({ settle: true });
      cue("select");
    });
    motifGrid.appendChild(button);
  }
}

function refreshMotifThumbs() {
  if (!motifGrid) return;
  for (const button of motifGrid.querySelectorAll(".motif-button")) {
    const motifId = button.dataset.motif;
    const icon = button.querySelector(".motif-icon");
    if (!motifId || !icon) continue;
    icon.innerHTML = renderSvg(
      { ...state, motif: motifId, repeat: 2, guides: false, motion: false },
      { width: 132, height: 92, repeat: 2, decorative: true, idPrefix: `thumb-${motifId}` },
    );
  }
}

function scheduleMotifThumbs() {
  if (!motifGrid || thumbFrame) return;
  const request = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
  thumbFrame = request(() => {
    thumbFrame = 0;
    refreshMotifThumbs();
  });
}

function buildPaletteButtons() {
  if (!paletteGrid) return;
  paletteGrid.replaceChildren();
  for (const palette of paletteOptions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette-button";
    button.dataset.palette = palette.id;
    button.setAttribute("aria-pressed", "false");
    button.tabIndex = palette.id === state.palette ? 0 : -1;
    button.setAttribute("aria-label", `${palette.name} palette. ${palette.note}`);

    const swatches = document.createElement("span");
    swatches.className = "swatches";
    swatches.setAttribute("aria-hidden", "true");
    for (const role of ["ink", "accent", "highlight"]) {
      const chip = document.createElement("i");
      chip.style.background = palette.colors[role];
      swatches.appendChild(chip);
    }

    const name = document.createElement("span");
    name.className = "palette-name";
    name.textContent = palette.name;

    button.append(swatches, name);
    button.addEventListener("click", () => {
      state = normalizeState({ ...state, palette: palette.id });
      commitHistory();
      update({ settle: true });
      cue("select");
    });
    paletteGrid.appendChild(button);
  }
}

function buildPresetButtons() {
  if (!presetList) return;
  presetList.replaceChildren();
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.dataset.preset = preset.id;
    button.setAttribute("aria-label", `${preset.name}: ${preset.note}`);

    const thumb = document.createElement("span");
    thumb.className = "preset-thumb";
    thumb.setAttribute("aria-hidden", "true");
    thumb.innerHTML = renderSvg(presetState(preset.id), {
      width: 64,
      height: 42,
      repeat: 2,
      decorative: true,
      idPrefix: `preset-${preset.id}`,
    });

    const name = document.createElement("span");
    name.className = "preset-name";
    name.textContent = preset.name;

    const note = document.createElement("span");
    note.className = "preset-note";
    note.textContent = preset.note;

    button.append(thumb, name, note);
    button.addEventListener("click", () => {
      state = applyPreset(preset.id, state);
      commitHistory();
      update({ settle: true });
      announce(`Loaded the ${preset.name} preset.`);
      cue("select");
    });
    presetList.appendChild(button);
  }
}

function buildPngSizes() {
  if (!pngSizeInput) return;
  pngSizeInput.replaceChildren();
  for (const size of EXPORT_SIZES) {
    const option = document.createElement("option");
    option.value = size.id;
    option.textContent = describeExportSize(size);
    pngSizeInput.appendChild(option);
  }
  pngSizeInput.value = pngSize;
  pngSizeInput.addEventListener("change", () => {
    pngSize = exportSize(pngSizeInput.value).id;
  });
}

function renderGallery() {
  if (!galleryList) return;
  disarmDelete();
  syncClearButton();
  galleryList.replaceChildren();
  if (!gallery.entries.length) {
    galleryRovingId = "";
    const empty = document.createElement("p");
    const warning = galleryIssue === "unreadable" || galleryIssue === "unavailable";
    empty.className = warning ? "gallery-empty is-warning" : "gallery-empty";
    if (warning) empty.setAttribute("role", "status");
    empty.textContent =
      galleryIssue === "unreadable"
        ? "Saved looks could not be read. Save a new look to start a fresh collection."
        : galleryIssue === "unavailable"
          ? "Browser storage is unavailable. Saved looks will last for this session only."
          : "No saved looks yet. Save the current pattern to start a collection.";
    galleryList.appendChild(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "gallery-items";
  for (const entry of gallery.entries) {
    const item = document.createElement("li");
    item.className = "gallery-item";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "gallery-open";
    open.dataset.galleryId = entry.id;
    open.setAttribute("aria-label", `Load ${entry.name}`);

    const thumb = document.createElement("span");
    thumb.className = "gallery-thumb";
    thumb.setAttribute("aria-hidden", "true");
    thumb.innerHTML = renderSvg(entry.state, {
      width: 160,
      height: 100,
      repeat: 2,
      decorative: true,
      idPrefix: `gallery-${entry.id}`,
    });

    const name = document.createElement("span");
    name.className = "gallery-name";
    name.textContent = entry.name;
    open.append(thumb, name);
    open.addEventListener("click", () => loadLook(entry.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "gallery-delete";
    remove.dataset.galleryDelete = entry.id;
    remove.setAttribute("aria-label", `Delete ${entry.name}`);
    remove.title = `Delete ${entry.name}`;
    remove.textContent = "×";
    remove.addEventListener("click", () => armDelete(entry.id));

    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "gallery-rename";
    rename.dataset.galleryRename = entry.id;
    rename.setAttribute("aria-label", `Rename ${entry.name}`);
    rename.title = `Rename ${entry.name}`;
    rename.textContent = "✎";
    rename.addEventListener("click", () => startRename(entry.id));

    item.append(open, rename, remove);
    list.appendChild(item);
  }
  galleryList.appendChild(list);
  syncGallerySelection();
}

function syncGallerySelection() {
  if (!galleryList) return;
  const activeId = activeEntryId(gallery, state);
  if (activeId) galleryRovingId = activeId;
  if (!gallery.entries.some((entry) => entry.id === galleryRovingId)) {
    galleryRovingId = gallery.entries[0]?.id ?? "";
  }
  const rovingIndex = gallery.entries.findIndex((entry) => entry.id === galleryRovingId);
  const items = [...galleryList.querySelectorAll(".gallery-item")];
  items.forEach((item, index) => {
    const open = item.querySelector(".gallery-open");
    const rename = item.querySelector(".gallery-rename");
    const remove = item.querySelector(".gallery-delete");
    const selected = open?.dataset.galleryId === activeId;
    item.classList.toggle("is-active", selected);
    if (selected) open?.setAttribute("aria-current", "true");
    else open?.removeAttribute("aria-current");
    if (open) open.tabIndex = index === rovingIndex ? 0 : -1;
    if (rename) rename.tabIndex = index === rovingIndex ? 0 : -1;
    if (remove) remove.tabIndex = index === rovingIndex ? 0 : -1;
  });
}

function bindGalleryNavigation(grid) {
  if (!grid) return;
  grid.addEventListener("keydown", (event) => {
    const row = event.target.closest?.(".gallery-item");
    if (!row) return;
    const rows = [...grid.querySelectorAll(".gallery-item")];
    const index = rows.indexOf(row);
    const target = gridTargetIndex(index, 1, rows.length, event.key);
    if (target === null) return;
    event.preventDefault();
    const open = rows[target].querySelector(".gallery-open");
    galleryRovingId = open?.dataset.galleryId ?? "";
    rows.forEach((item, rowIndex) => {
      const rowOpen = item.querySelector(".gallery-open");
      const rowRename = item.querySelector(".gallery-rename");
      const rowDelete = item.querySelector(".gallery-delete");
      if (rowOpen) rowOpen.tabIndex = rowIndex === target ? 0 : -1;
      if (rowRename) rowRename.tabIndex = rowIndex === target ? 0 : -1;
      if (rowDelete) rowDelete.tabIndex = rowIndex === target ? 0 : -1;
    });
    open?.focus();
  });
}

function disarmClear() {
  clearArmed = false;
  window.clearTimeout(clearTimer);
  clearTimer = 0;
  if (!clearGalleryButton) return;
  clearGalleryButton.classList.remove("is-armed");
  clearGalleryButton.textContent = "Clear all";
}

function syncClearButton() {
  if (!clearGalleryButton) return;
  const empty = gallery.entries.length === 0;
  clearGalleryButton.disabled = empty;
  if (backupGalleryButton) backupGalleryButton.disabled = empty;
  if (empty) disarmClear();
}

function armClear() {
  if (!gallery.entries.length || !clearGalleryButton) return;
  disarmDelete();
  clearArmed = true;
  clearGalleryButton.classList.add("is-armed");
  clearGalleryButton.textContent = "Confirm clear all";
  announce(`Press Clear again to remove all ${gallery.entries.length} saved looks.`);
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => disarmClear(), 4000);
}

function clearAllLooks() {
  const count = gallery.entries.length;
  if (!count) return;
  disarmClear();
  gallery = emptyGallery();
  galleryRovingId = "";
  galleryIssue = null;
  const persisted = clearGallery(storage());
  renderGallery();
  saveLookButton?.focus();
  const looks = count === 1 ? "look" : "looks";
  announce(persistedNotice(`Cleared ${count} saved ${looks}.`, persisted));
}

function backupGallery() {
  if (!gallery.entries.length) {
    announce("There are no saved looks to back up.");
    return;
  }
  const payload = JSON.stringify(
    {
      app: "tessera",
      version: GALLERY_VERSION,
      exported_at: new Date().toISOString(),
      entries: gallery.entries,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tessera-looks.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  const count = gallery.entries.length;
  announce(`Downloaded ${count} saved ${count === 1 ? "look" : "looks"}.`);
}

async function restoreGallery(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "tessera" || data.version !== GALLERY_VERSION || !Array.isArray(data.entries)) {
      throw new Error("shape");
    }
    const record = normalizeGalleryRecord({ entries: data.entries });
    if (!record.entries.length) throw new Error("empty");
    let next = gallery;
    for (const entry of [...record.entries].reverse()) {
      next = mergeEntry(next, entry);
    }
    gallery = next;
    galleryIssue = null;
    const persisted = saveGallery(storage(), gallery);
    renderGallery();
    const count = record.entries.length;
    announce(persistedNotice(`Restored ${count} saved ${count === 1 ? "look" : "looks"}.`, persisted));
  } catch {
    announce("That file is not a Tessera looks backup.");
  } finally {
    if (restoreFileInput) restoreFileInput.value = "";
  }
}

function saveLook() {
  const alreadySaved = isSaved(gallery, state);
  const evictedId = alreadySaved ? null : evictionCandidate(gallery, state);
  const evicted = evictedId ? gallery.entries.find((item) => item.id === evictedId) : null;
  gallery = addEntry(gallery, state);
  galleryRovingId = gallery.entries[0].id;
  galleryIssue = null;
  const persisted = saveGallery(storage(), gallery);
  renderGallery();
  const entry = gallery.entries[0];
  const message = alreadySaved
    ? `Moved ${entry.name} to the front.`
    : evicted
      ? `Saved ${entry.name}. Removed the oldest look, ${evicted.name}.`
      : `Saved ${entry.name}.`;
  announce(persistedNotice(message, persisted));
  cue("save");
}

function loadLook(id) {
  const entry = gallery.entries.find((item) => item.id === id);
  if (!entry) return;
  state = restoreEntry(entry, state);
  commitHistory();
  update({ settle: true });
  announce(`Loaded ${entry.name}.`);
  cue("select");
}

function startRename(id) {
  const entry = gallery.entries.find((item) => item.id === id);
  if (!entry || !galleryList) return;
  const open = [...galleryList.querySelectorAll(".gallery-open")].find(
    (button) => button.dataset.galleryId === id,
  );
  const row = open ? open.closest(".gallery-item") : null;
  if (!row) return;
  const form = document.createElement("form");
  form.className = "gallery-rename-form";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "gallery-rename-input";
  input.dataset.galleryRenameId = id;
  input.value = entry.name;
  input.maxLength = 80;
  input.setAttribute("aria-label", `New name for ${entry.name}`);
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn btn-small";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-small";
  cancel.textContent = "Cancel";
  const error = document.createElement("p");
  error.className = "gallery-rename-error";
  error.id = "gallery-rename-error";
  error.textContent = "Enter a name for this look.";
  error.hidden = true;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
      input.focus();
      announce("Enter a name for this look.");
      return;
    }
    gallery = renameEntry(gallery, id, name);
    galleryRovingId = id;
    const persisted = saveGallery(storage(), gallery);
    renderGallery();
    announce(persistedNotice(`Renamed to ${name}.`, persisted));
    focusGalleryRename(id);
  });
  cancel.addEventListener("click", () => {
    renderGallery();
    focusGalleryRename(id);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      renderGallery();
      focusGalleryRename(id);
    }
  });
  input.addEventListener("input", () => {
    if (error.hidden) return;
    error.hidden = true;
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  });
  form.append(input, save, cancel, error);
  row.replaceChildren(form);
  input.focus();
  input.select();
}

function focusGalleryRename(entryId) {
  const target = galleryList
    ? [...galleryList.querySelectorAll(".gallery-rename")].find(
        (button) => button.dataset.galleryRename === entryId,
      )
    : null;
  target?.focus({ preventScroll: true });
}

function disarmDelete() {
  const armedId = deleteArmedId;
  deleteArmedId = "";
  window.clearTimeout(deleteTimer);
  deleteTimer = 0;
  if (!armedId || !galleryList) return;
  const button = [...galleryList.querySelectorAll(".gallery-delete")].find(
    (item) => item.dataset.galleryDelete === armedId,
  );
  if (!button) return;
  button.classList.remove("is-armed");
  button.textContent = "×";
  const entry = gallery.entries.find((item) => item.id === armedId);
  const label = entry ? `Delete ${entry.name}` : "Delete saved look";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function armDelete(id) {
  const entry = gallery.entries.find((item) => item.id === id);
  if (!entry) return;
  if (deleteArmedId === id) {
    deleteLook(id);
    return;
  }
  disarmDelete();
  disarmClear();
  deleteArmedId = id;
  const button = galleryList
    ? [...galleryList.querySelectorAll(".gallery-delete")].find(
        (item) => item.dataset.galleryDelete === id,
      )
    : null;
  if (button) {
    button.classList.add("is-armed");
    button.textContent = "✓";
    const label = `Confirm delete ${entry.name}`;
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  announce(`Press delete again to remove ${entry.name}.`);
  window.clearTimeout(deleteTimer);
  deleteTimer = window.setTimeout(() => disarmDelete(), 4000);
}

function deleteLook(id) {
  const entry = gallery.entries.find((item) => item.id === id);
  if (!entry) return;
  disarmDelete();
  const focusId = neighborEntryId(gallery, id);
  galleryRovingId = focusId || "";
  gallery = removeEntry(gallery, id);
  const persisted = saveGallery(storage(), gallery);
  renderGallery();
  let focusTarget = null;
  if (focusId && galleryList) {
    focusTarget = [...galleryList.querySelectorAll(".gallery-open")].find(
      (button) => button.dataset.galleryId === focusId,
    );
  }
  (focusTarget || saveLookButton)?.focus();
  announce(persistedNotice(`Removed ${entry.name}.`, persisted));
}

function syncInputs() {
  if (repeatInput) repeatInput.value = String(state.repeat);
  if (weightInput) weightInput.value = String(state.weight);
  if (warpInput) warpInput.value = String(state.warp);
  if (rotateInput) rotateInput.value = String(state.rotate);
  if (flipInput) flipInput.value = state.flip;
  if (repeatValue) repeatValue.textContent = String(state.repeat);
  if (weightValue) weightValue.textContent = String(state.weight);
  if (warpValue) warpValue.textContent = `${state.warp}%`;
  if (seedValue) seedValue.textContent = String(state.seed);
  if (motionInput) motionInput.checked = state.motion;
  if (guidesInput) guidesInput.checked = state.guides;
  if (soundInput) soundInput.checked = state.sound;
  if (stageMotif) stageMotif.textContent = getMotif(state.motif).name;
  if (stagePalette) stagePalette.textContent = getPalette(state.palette).name;
  if (stageRepeat) stageRepeat.textContent = String(state.repeat);
  if (stageSeed) stageSeed.textContent = String(state.seed);
  const transform = transformLabel(state);
  if (stageTransform) {
    stageTransform.textContent = transform;
    stageTransform.hidden = transform === "";
  }
  if (stageTransformDivider) stageTransformDivider.hidden = transform === "";
  if (stageEffects) {
    for (const chip of stageEffects.querySelectorAll("[data-effect]")) {
      const effect = chip.dataset.effect;
      const active = effect === "guides" ? state.guides : state.motion;
      chip.hidden = !active;
      if (effect === "motion") {
        chip.textContent = active && prefersReducedMotion() ? "Glow paused" : "Glow";
      }
    }
    stageEffects.hidden = !state.guides && !state.motion;
  }
  if (motionNote) {
    const paused = state.motion && prefersReducedMotion();
    motionNote.hidden = !paused;
    if (paused) motionInput?.setAttribute("aria-describedby", "motion-note");
    else motionInput?.removeAttribute("aria-describedby");
  }
  if (stage) {
    stage.dataset.motion = state.motion ? "on" : "off";
    stage.dataset.guides = state.guides ? "on" : "off";
  }
}

function syncSelection() {
  if (motifGrid) {
    for (const button of motifGrid.querySelectorAll(".motif-button")) {
      const selected = button.dataset.motif === state.motif;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    }
  }
  if (paletteGrid) {
    for (const button of paletteGrid.querySelectorAll(".palette-button")) {
      const selected = button.dataset.palette === state.palette;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    }
  }
  if (presetList) {
    const buttons = [...presetList.querySelectorAll(".preset-button")];
    const activeId = activePresetId(state);
    let rovingIndex = buttons.findIndex((button) => button.dataset.preset === activeId);
    if (rovingIndex < 0) rovingIndex = 0;
    buttons.forEach((button, index) => {
      const selected = button.dataset.preset === activeId;
      button.classList.toggle("is-active", selected);
      button.tabIndex = index === rovingIndex ? 0 : -1;
      if (selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }
}

function renderStage() {
  if (!stage) return;
  stage.innerHTML = renderSvg(state, {
    width: 1600,
    height: 1067,
    repeat: state.repeat,
    guides: state.guides,
    idPrefix: "tessera-stage",
  });
}

function syncUrl() {
  try {
    const params = new URLSearchParams(encodeState(state));
    params.delete("preset");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  } catch {
    // A sandboxed frame may refuse history writes; the studio still works.
  }
}

function settleStage() {
  if (!stage || prefersReducedMotion()) return;
  window.clearTimeout(settleTimer);
  stage.classList.remove("is-settling");
  void stage.offsetWidth;
  stage.classList.add("is-settling");
  settleTimer = window.setTimeout(() => stage.classList.remove("is-settling"), 380);
}

function update(options = {}) {
  const nextThumbKey = thumbKey(state);
  if (nextThumbKey !== lastThumbKey) {
    lastThumbKey = nextThumbKey;
    scheduleMotifThumbs();
  }
  syncInputs();
  syncSelection();
  syncGallerySelection();
  renderStage();
  if (options.settle) settleStage();
  if (options.persist !== false) syncStorageNote(saveState(storage(), state));
  if (options.url !== false) syncUrl();
  syncHistoryButtons();
}

function svgText() {
  return renderSvg(state, {
    width: 1600,
    height: 1067,
    repeat: state.repeat,
    guides: state.guides,
  });
}

async function copyText(text, successMessage) {
  const previousFocus = document.activeElement;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      announce(successMessage);
      return;
    }
  } catch {
    // Fall through to the selection-based copy.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    const copied = document.execCommand("copy");
    announce(copied ? successMessage : "Copy is unavailable in this browser.");
  } catch {
    announce("Copy is unavailable in this browser.");
  } finally {
    area.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus !== document.body) {
      previousFocus.focus({ preventScroll: true });
    }
  }
}

async function copySvg() {
  await copyText(svgText(), "SVG copied to the clipboard.");
}

function shareLink() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(encodeState(state));
  params.delete("preset");
  url.search = params.toString();
  return url.href;
}

async function copyLink() {
  await copyText(shareLink(), `Share link copied: ${shareSummary(state)}.`);
}

function exportSvg() {
  const blob = new Blob([svgText()], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportName(state);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Exported ${link.download}.`);
  cue("export");
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadSvgImage(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Some browsers cannot decode SVG through createImageBitmap; use an <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The SVG could not be decoded."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportPng() {
  if (exportPngButton?.disabled) return;
  const size = exportSize(pngSize);
  if (exportPngButton) {
    exportPngButton.disabled = true;
    exportPngButton.setAttribute("aria-busy", "true");
  }
  if (exportStatus) {
    exportStatus.hidden = false;
    exportStatus.textContent = `Rendering ${size.label} PNG…`;
  }
  announce(`Rendering ${size.label} PNG…`);
  try {
    const svg = renderExportSvg(state, size.id, { guides: state.guides });
    const png = await svgToPng(svg, size, { createCanvas, loadImage: loadSvgImage });
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = pngName(state, size.id);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (exportStatus) exportStatus.textContent = `Last export: ${formatExportResult(size, png.size)} · ${link.download}`;
    announce(`Exported ${link.download}.`);
    cue("export");
  } catch (error) {
    if (exportStatus) exportStatus.textContent = "Last export failed. PNG export is unavailable in this browser.";
    announce("PNG export is unavailable in this browser.");
    if (window.console) window.console.error(error);
  } finally {
    if (exportPngButton) {
      exportPngButton.disabled = false;
      exportPngButton.removeAttribute("aria-busy");
    }
  }
}

function bindRange(input, key) {
  if (!input) return;
  input.addEventListener("input", () => {
    state = normalizeState({ ...state, [key]: input.value });
    update({ persist: false, url: false });
  });
  input.addEventListener("change", () => {
    commitHistory();
    update();
  });
}

function bindSwitch(input, key) {
  if (!input) return;
  input.addEventListener("change", () => {
    state = normalizeState({ ...state, [key]: input.checked });
    commitHistory();
    update();
  });
}

function bindSelect(input, key) {
  if (!input) return;
  input.addEventListener("change", () => {
    state = normalizeState({ ...state, [key]: input.value });
    commitHistory();
    update({ settle: true });
  });
}

function bindGridNavigation(grid) {
  if (!grid) return;
  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll("button")];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    const columns = Number(grid.dataset.columns) || 1;
    const target = gridTargetIndex(index, columns, buttons.length, event.key);
    if (target === null) return;
    event.preventDefault();
    buttons.forEach((button, buttonIndex) => {
      button.tabIndex = buttonIndex === target ? 0 : -1;
    });
    buttons[target].focus();
  });
}

function bindActions() {
  const randomize = document.getElementById("randomize");
  const reseed = document.getElementById("new-seed");
  const copy = document.getElementById("copy");
  const exportButton = document.getElementById("export");

  randomize?.addEventListener("click", randomizeLook);
  reseed?.addEventListener("click", reseedLook);
  undoButton?.addEventListener("click", undo);
  redoButton?.addEventListener("click", redo);

  copy?.addEventListener("click", copySvg);
  exportButton?.addEventListener("click", exportSvg);
  exportPngButton?.addEventListener("click", exportPng);
  saveLookButton?.addEventListener("click", saveLook);
  backupGalleryButton?.addEventListener("click", backupGallery);
  restoreGalleryButton?.addEventListener("click", () => restoreFileInput?.click());
  restoreFileInput?.addEventListener("change", () => restoreGallery(restoreFileInput.files?.[0]));
  copyLinkButton?.addEventListener("click", copyLink);
  clearGalleryButton?.addEventListener("click", () => {
    if (clearArmed) clearAllLooks();
    else armClear();
  });
  clearGalleryButton?.addEventListener("blur", disarmClear);

  bindRange(repeatInput, "repeat");
  bindRange(weightInput, "weight");
  bindRange(warpInput, "warp");
  bindSelect(rotateInput, "rotate");
  bindSelect(flipInput, "flip");
  bindSwitch(motionInput, "motion");
  bindSwitch(guidesInput, "guides");
  bindSwitch(soundInput, "sound");
  soundInput?.addEventListener("change", () => {
    if (soundInput.checked) cue("select");
  });
  bindGridNavigation(motifGrid);
  bindGridNavigation(paletteGrid);
  bindGridNavigation(presetList);
  bindGalleryNavigation(galleryList);
}

function isTextEntry(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") {
    return !["range", "checkbox", "radio", "button", "submit", "reset"].includes(target.type);
  }
  return false;
}

function toggleShortcuts(force) {
  if (!shortcutPanel) return;
  const next = typeof force === "boolean" ? force : !shortcutPanel.open;
  shortcutPanel.open = next;
  if (next) {
    shortcutPanel.scrollIntoView({ block: "nearest" });
    shortcutSummary?.focus({ preventScroll: true });
  }
}

function bindStorageSync() {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const read = readState(storage());
      if (!read.state || sameState(read.state, state)) return;
      state = read.state;
      stateIssue = null;
      stateReadFailed = false;
      setStorageNote(null, false);
      historyBaseline = state;
      pastStates = [];
      futureStates = [];
      update({ persist: false, settle: true });
      announce("Settings updated from another tab.");
    } else if (event.key === GALLERY_KEY) {
      const active = document.activeElement;
      const renameDraft =
        active instanceof HTMLInputElement && active.classList.contains("gallery-rename-input")
          ? {
              id: active.dataset.galleryRenameId || "",
              value: active.value,
              start: active.selectionStart,
              end: active.selectionEnd,
            }
          : null;
      const focusId =
        active instanceof HTMLElement
          ? active.dataset.galleryId || active.dataset.galleryDelete || active.dataset.galleryRename || ""
          : "";
      const focusDelete = active instanceof HTMLElement && active.classList.contains("gallery-delete");
      const focusRename = active instanceof HTMLElement && active.classList.contains("gallery-rename");
      const read = readGallery(storage());
      gallery = read.gallery || emptyGallery();
      galleryIssue = read.issue;
      galleryRovingId = renameDraft?.id || focusId;
      renderGallery();
      if (renameDraft) {
        const reopened = gallery.entries.some((entry) => entry.id === renameDraft.id);
        if (reopened) {
          startRename(renameDraft.id);
          const input = galleryList?.querySelector(".gallery-rename-input");
          if (input) {
            input.value = renameDraft.value;
            input.focus({ preventScroll: true });
            if (typeof renameDraft.start === "number" && typeof renameDraft.end === "number") {
              input.setSelectionRange(renameDraft.start, renameDraft.end);
            }
          } else {
            saveLookButton?.focus({ preventScroll: true });
          }
        } else {
          saveLookButton?.focus({ preventScroll: true });
        }
        announce("Saved looks updated from another tab.");
        return;
      }
      let target = null;
      if (focusId) {
        const selector = focusDelete ? ".gallery-delete" : focusRename ? ".gallery-rename" : ".gallery-open";
        target = [...galleryList.querySelectorAll(selector)].find((button) => {
          const value = focusDelete
            ? button.dataset.galleryDelete
            : focusRename
              ? button.dataset.galleryRename
              : button.dataset.galleryId;
          return value === focusId;
        });
      }
      if (target) target.focus({ preventScroll: true });
      else if (focusId) saveLookButton?.focus({ preventScroll: true });
      announce("Saved looks updated from another tab.");
    }
  });
}

function bindReducedMotion() {
  if (!reducedMotionQuery) return;
  const refresh = () => syncInputs();
  if (typeof reducedMotionQuery.addEventListener === "function") reducedMotionQuery.addEventListener("change", refresh);
  else if (typeof reducedMotionQuery.addListener === "function") reducedMotionQuery.addListener(refresh);
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    const chord = (event.ctrlKey || event.metaKey) && !event.altKey;
    const editingText = isTextEntry(event.target) && event.target.tagName !== "SELECT";
    if (chord && key === "z" && !editingText) {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (key === "escape" && shortcutPanel?.open) {
      event.preventDefault();
      toggleShortcuts(false);
      shortcutSummary?.focus({ preventScroll: true });
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTextEntry(event.target)) return;
    if (key === "?") {
      event.preventDefault();
      toggleShortcuts();
      return;
    }
    if (key === "r") {
      event.preventDefault();
      randomizeLook();
    } else if (key === "c") {
      event.preventDefault();
      copySvg();
    } else if (key === "e") {
      event.preventDefault();
      exportSvg();
    } else if (key === "p") {
      event.preventDefault();
      exportPng();
    } else if (key === "s") {
      event.preventDefault();
      saveLook();
    } else if (key === "l") {
      event.preventDefault();
      copyLink();
    }
  });
}

function initialState() {
  const decoded = decodeSearch(window.location.search);
  const preset = decoded.preset ? presetState(decoded.preset) : null;
  const stored = readState(storage());
  stateIssue = decoded.hasState || preset ? null : stored.issue;
  const base = preset || stored.state || normalizeState(DEFAULTS);
  if (decoded.hasState) return normalizeState({ ...base, ...decoded.patch });
  return normalizeState(base);
}

function mount() {
  state = initialState();
  historyBaseline = state;
  pastStates = [];
  futureStates = [];
  const galleryRead = readGallery(storage());
  gallery = galleryRead.gallery || emptyGallery();
  galleryIssue = galleryRead.issue;
  buildMotifButtons();
  lastThumbKey = thumbKey(state);
  buildPaletteButtons();
  buildPresetButtons();
  buildPngSizes();
  renderGallery();
  bindActions();
  bindKeyboard();
  bindReducedMotion();
  bindStorageSync();
  update({ persist: false, url: false });
  if (stateIssue === "unreadable") {
    stateReadFailed = true;
    setStorageNote(STORAGE_READ_NOTE, true);
    announce(STORAGE_READ_NOTE);
  }
  const reset = document.getElementById("reset");
  reset?.addEventListener("click", () => {
    const persisted = clearState(storage());
    state = normalizeState(DEFAULTS);
    commitHistory();
    update({ settle: true });
    announce(persistedNotice("Reset the pattern to its defaults.", persisted));
  });
}

try {
  mount();
} catch (error) {
  announce("The studio could not start. Reload the page to try again.");
  if (window.console) window.console.error(error);
}
