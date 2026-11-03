import { boundedDimensions, MAX_DIMENSION } from "../core/project.js";
import { canvasToBlob } from "./canvas.js";

export const AUTOSAVE_FORMAT = "palette-autosave";
export const AUTOSAVE_VERSION = 2;
export const AUTOSAVE_SUPPORTED_VERSIONS = Object.freeze([1, 2]);
const DB_NAME = "palette-autosave";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const RECORD_KEY = "latest";

let databasePromise = null;

export function autosaveAvailable() {
  return typeof indexedDB !== "undefined";
}

export function validateSessionRecord(record) {
  if (
    !record ||
    typeof record !== "object" ||
    record.format !== AUTOSAVE_FORMAT ||
    !AUTOSAVE_SUPPORTED_VERSIONS.includes(record.version)
  ) {
    return null;
  }
  const width = Number(record.width);
  const height = Number(record.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
  const bounded = boundedDimensions(width, height);
  if (bounded.width !== Math.round(width) || bounded.height !== Math.round(height)) return null;
  const supportsClipping = Number(record.version) >= 2;
  if (!Array.isArray(record.layers) || record.layers.length === 0) return null;
  const layers = [];
  for (const [index, layer] of record.layers.entries()) {
    if (!layer || typeof layer !== "object" || !layer.image) return null;
    if (typeof layer.id !== "string" || !layer.id.trim()) return null;
    layers.push({
      id: layer.id,
      name: String(layer.name || "Layer").slice(0, 80),
      visible: layer.visible !== false,
      opacity: Number.isFinite(Number(layer.opacity)) ? Math.min(1, Math.max(0, Number(layer.opacity))) : 1,
      blendMode: typeof layer.blendMode === "string" ? layer.blendMode : "normal",
      locked: layer.locked === true,
      clipToBelow: supportsClipping && index > 0 && layer.clipToBelow === true,
      adjustments: layer.adjustments && typeof layer.adjustments === "object" ? layer.adjustments : {},
      image: layer.image,
    });
  }
  return {
    format: AUTOSAVE_FORMAT,
    version: AUTOSAVE_VERSION,
    savedAt: Number.isFinite(Number(record.savedAt)) ? Number(record.savedAt) : 0,
    name: String(record.name || "Untitled").slice(0, 80),
    width: Math.round(width),
    height: Math.round(height),
    activeLayerId: layers.some((layer) => layer.id === record.activeLayerId)
      ? record.activeLayerId
      : layers[layers.length - 1].id,
    layers,
  };
}

export async function captureSession(doc) {
  const layers = await Promise.all(
    doc.layers.map(async (layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      locked: layer.locked,
      clipToBelow: Boolean(layer.clipToBelow),
      adjustments: { ...layer.adjustments },
      image: await canvasToBlob(layer.canvas, "image/png"),
    })),
  );
  return {
    format: AUTOSAVE_FORMAT,
    version: AUTOSAVE_VERSION,
    savedAt: Date.now(),
    name: doc.name,
    width: doc.width,
    height: doc.height,
    activeLayerId: doc.activeLayerId,
    layers,
  };
}

export function formatSavedAt(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function openDatabase() {
  if (!autosaveAvailable()) return Promise.reject(new Error("IndexedDB is unavailable."));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("IndexedDB could not be opened."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("IndexedDB is blocked by another tab."));
    };
  });
  return databasePromise;
}

export async function readAutosave() {
  if (!autosaveAvailable()) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Autosave could not be read."));
  });
}

export async function writeAutosave(record) {
  if (!autosaveAvailable()) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Autosave could not be written."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Autosave was aborted."));
    transaction.objectStore(STORE_NAME).put(record, RECORD_KEY);
  });
}

export async function clearAutosave() {
  if (!autosaveAvailable()) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Autosave could not be cleared."));
    transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
  });
}
