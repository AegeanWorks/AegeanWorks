import { GALLERY_VERSION, normalizeGalleryRecord } from "./gallery.js";
import { normalizeState } from "./state.js";

export const STORAGE_KEY = "tessera.studio.v1";
export const STORAGE_VERSION = 1;
export const GALLERY_KEY = "tessera.gallery.v1";

export function readState(storage) {
  if (!storage) return { state: null, issue: "unavailable" };
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: null, issue: "unavailable" };
  }
  if (!raw) return { state: null, issue: null };
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== STORAGE_VERSION || !data.state) {
      return { state: null, issue: "unreadable" };
    }
    return { state: normalizeState(data.state), issue: null };
  } catch {
    return { state: null, issue: "unreadable" };
  }
}

export function loadState(storage) {
  return readState(storage).state;
}

export function saveState(storage, state) {
  if (!storage) return false;
  try {
    const normalized = normalizeState(state);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, saved_at: new Date().toISOString(), state: normalized }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readGallery(storage) {
  if (!storage) return { gallery: null, issue: "unavailable" };
  let raw;
  try {
    raw = storage.getItem(GALLERY_KEY);
  } catch {
    return { gallery: null, issue: "unavailable" };
  }
  if (!raw) return { gallery: null, issue: null };
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== GALLERY_VERSION || !Array.isArray(data.entries)) {
      return { gallery: null, issue: "unreadable" };
    }
    return { gallery: normalizeGalleryRecord(data), issue: null };
  } catch {
    return { gallery: null, issue: "unreadable" };
  }
}

export function loadGallery(storage) {
  return readGallery(storage).gallery;
}

export function saveGallery(storage, record) {
  if (!storage) return false;
  try {
    const normalized = normalizeGalleryRecord(record);
    storage.setItem(
      GALLERY_KEY,
      JSON.stringify({
        version: GALLERY_VERSION,
        saved_at: new Date().toISOString(),
        entries: normalized.entries,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearGallery(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(GALLERY_KEY);
    return true;
  } catch {
    return false;
  }
}
