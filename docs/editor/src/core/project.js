import { clamp } from "./color.js";
import { normalizeBlendMode } from "./document.js";
import { clampAdjustments } from "./filters.js";

export const PROJECT_FORMAT = "palette-project";
export const PROJECT_VERSION = 2;
export const PROJECT_SUPPORTED_VERSIONS = Object.freeze([1, 2]);
export const MAX_DIMENSION = 8192;
export const MAX_PIXELS = 24_000_000;

export function cleanDocumentName(value, fallback = "Untitled") {
  const text = String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().replace(/\s+/g, " ").slice(0, 80);
  return text || fallback;
}

export function cleanDimension(value, fallback = 1) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(1, number));
}

export function requestedDimension(value, fallback = 1) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 1) return cleanDimension(fallback);
  return number;
}

export function boundedDimensions(width, height) {
  const requestedWidth = Math.round(Number(width));
  const requestedHeight = Math.round(Number(height));
  const safeWidth = Number.isFinite(requestedWidth) ? Math.max(1, requestedWidth) : 1;
  const safeHeight = Number.isFinite(requestedHeight) ? Math.max(1, requestedHeight) : 1;
  let scale = Math.min(1, MAX_DIMENSION / safeWidth, MAX_DIMENSION / safeHeight);
  const scaledPixels = safeWidth * scale * safeHeight * scale;
  if (scaledPixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / scaledPixels);
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
  };
}

export function serializeProject(doc, images) {
  return JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: cleanDocumentName(doc.name),
    width: doc.width,
    height: doc.height,
    activeLayerId: doc.activeLayerId,
    layers: doc.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: normalizeBlendMode(layer.blendMode),
      locked: Boolean(layer.locked),
      clipToBelow: Boolean(layer.clipToBelow),
      adjustments: clampAdjustments(layer.adjustments),
      image: images[layer.id] ?? "",
    })),
  });
}

export function parseProject(source) {
  let data = source;
  if (typeof source === "string") {
    try {
      data = JSON.parse(source);
    } catch {
      throw new Error("This file is not valid JSON.");
    }
  }
  if (!data || typeof data !== "object" || data.format !== PROJECT_FORMAT) {
    throw new Error("This is not a Palette project file.");
  }
  if (data.version !== PROJECT_VERSION) {
    if (!PROJECT_SUPPORTED_VERSIONS.includes(data.version)) {
      throw new Error(`Unsupported Palette project version: ${String(data.version)}.`);
    }
  }
  if (!Array.isArray(data.layers) || data.layers.length === 0) {
    throw new Error("The project has no layers.");
  }
  const seen = new Set();
  const supportsClipping = Number(data.version) >= 2;
  const layers = data.layers.map((layer, index) => {
    if (!layer || typeof layer !== "object") throw new Error(`Layer ${index + 1} is malformed.`);
    const id = typeof layer.id === "string" && layer.id.trim() ? layer.id.trim() : `layer-${index + 1}`;
    if (seen.has(id)) throw new Error(`Duplicate layer id: ${id}.`);
    seen.add(id);
    if (typeof layer.image !== "string" || !layer.image.startsWith("data:image/")) {
      throw new Error(`Layer ${index + 1} has no embedded image.`);
    }
    return {
      id,
      name: cleanDocumentName(layer.name, `Layer ${index + 1}`),
      visible: layer.visible !== false,
      opacity: Number.isFinite(Number(layer.opacity)) ? clamp(Number(layer.opacity), 0, 1) : 1,
      blendMode: normalizeBlendMode(layer.blendMode),
      locked: layer.locked === true,
      clipToBelow: supportsClipping && index > 0 && layer.clipToBelow === true,
      adjustments: clampAdjustments(layer.adjustments),
      image: layer.image,
    };
  });
  const { width, height } = boundedDimensions(data.width, data.height);
  const activeLayerId = layers.some((layer) => layer.id === data.activeLayerId)
    ? data.activeLayerId
    : layers[layers.length - 1].id;
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: cleanDocumentName(data.name),
    width,
    height,
    activeLayerId,
    layers,
  };
}
