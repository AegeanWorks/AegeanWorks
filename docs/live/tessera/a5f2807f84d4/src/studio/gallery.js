import { DEFAULTS, normalizeState } from "./state.js";

export const GALLERY_VERSION = 1;
export const GALLERY_LIMIT = 12;

const ENTRY_KEYS = Object.freeze([
  "motif",
  "palette",
  "repeat",
  "weight",
  "warp",
  "seed",
  "rotate",
  "flip",
]);

function titleCase(value) {
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function stateSignature(state) {
  const normalized = normalizeState(state);
  return ENTRY_KEYS.map((key) => normalized[key]).join("-");
}

export function entryName(state) {
  const normalized = normalizeState(state);
  const suffix = [];
  if (normalized.rotate) suffix.push(`${normalized.rotate}°`);
  if (normalized.flip === "x") suffix.push("X");
  else if (normalized.flip === "y") suffix.push("Y");
  const base = `${titleCase(normalized.palette)} ${titleCase(normalized.motif)} · seed ${normalized.seed}`;
  return suffix.length ? `${base} · ${suffix.join(" ")}` : base;
}

function visualState(state) {
  const normalized = normalizeState(state);
  const visual = {};
  for (const key of ENTRY_KEYS) visual[key] = normalized[key];
  return Object.freeze(visual);
}

export function normalizeEntry(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !raw.state ||
    typeof raw.state !== "object" ||
    Array.isArray(raw.state)
  ) {
    return null;
  }
  const state = visualState(raw.state);
  const id = stateSignature(state);
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : entryName(state);
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt.slice(0, 40) : "";
  return Object.freeze({ id, name, state, savedAt });
}

export function normalizeGalleryRecord(raw) {
  const source = Array.isArray(raw) ? raw : raw && Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set();
  const entries = [];
  for (const item of source) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
    if (entries.length >= GALLERY_LIMIT) break;
  }
  return Object.freeze({ version: GALLERY_VERSION, entries: Object.freeze(entries) });
}

export function emptyGallery() {
  return normalizeGalleryRecord(null);
}

export function addEntry(record, state, savedAt = new Date().toISOString()) {
  const base = normalizeGalleryRecord(record);
  const entry = normalizeEntry({ state, savedAt });
  if (!entry) return base;
  return normalizeGalleryRecord({
    entries: [entry, ...base.entries.filter((item) => item.id !== entry.id)],
  });
}

export function removeEntry(record, id) {
  const base = normalizeGalleryRecord(record);
  return normalizeGalleryRecord({ entries: base.entries.filter((item) => item.id !== id) });
}

export function isSaved(record, state) {
  const id = stateSignature(state);
  return normalizeGalleryRecord(record).entries.some((entry) => entry.id === id);
}

export function restoreEntry(entry, current = DEFAULTS) {
  const base = normalizeState(current);
  const normalized = normalizeEntry(entry);
  if (!normalized) return base;
  return normalizeState({
    ...base,
    ...normalized.state,
    guides: base.guides,
    motion: base.motion,
  });
}
