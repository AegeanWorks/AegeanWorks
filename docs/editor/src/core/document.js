import { clamp } from "./color.js";
import { clampAdjustments } from "./filters.js";

export const BLEND_MODES = Object.freeze({
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  "color-dodge": "Color dodge",
  "color-burn": "Color burn",
  "hard-light": "Hard light",
  "soft-light": "Soft light",
  difference: "Difference",
  exclusion: "Exclusion",
  hue: "Hue",
  saturation: "Saturation",
  color: "Color",
  luminosity: "Luminosity",
});

export function normalizeBlendMode(value) {
  return typeof value === "string" && Object.hasOwn(BLEND_MODES, value) ? value : "normal";
}

export function blendOperation(value) {
  const mode = normalizeBlendMode(value);
  return mode === "normal" ? "source-over" : mode;
}

let sequence = 0;

export function uid(prefix = "layer") {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function createLayer({
  id = uid("layer"),
  name = "Layer",
  visible = true,
  opacity = 1,
  blendMode = "normal",
  locked = false,
  clipToBelow = false,
  canvas = null,
  adjustments = {},
} = {}) {
  return {
    id,
    name: String(name || "Layer").slice(0, 80),
    visible: visible !== false,
    opacity: clamp(opacity, 0, 1),
    blendMode: normalizeBlendMode(blendMode),
    locked: Boolean(locked),
    clipToBelow: Boolean(clipToBelow),
    canvas,
    adjustments: clampAdjustments(adjustments),
  };
}

export function createDocument({ width, height, layers, name = "Untitled", activeLayerId = null } = {}) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const list = Array.isArray(layers) && layers.length ? layers.slice() : [createLayer({ name: "Background" })];
  const active = list.some((layer) => layer.id === activeLayerId) ? activeLayerId : list[list.length - 1].id;
  return {
    name: String(name || "Untitled").slice(0, 80),
    width: safeWidth,
    height: safeHeight,
    layers: list,
    activeLayerId: active,
  };
}

export function layerById(doc, id) {
  return doc.layers.find((layer) => layer.id === id) ?? null;
}

export function activeLayer(doc) {
  return layerById(doc, doc.activeLayerId) ?? doc.layers[doc.layers.length - 1] ?? null;
}

export function indexOfLayer(doc, id) {
  return doc.layers.findIndex((layer) => layer.id === id);
}

export function clippingBaseIndex(doc, id) {
  const index = indexOfLayer(doc, id);
  if (index <= 0 || !doc.layers[index].clipToBelow) return -1;
  for (let below = index - 1; below >= 0; below -= 1) {
    if (!doc.layers[below].clipToBelow) return below;
  }
  return -1;
}

export function setActiveLayer(doc, id) {
  return layerById(doc, id) ? { ...doc, activeLayerId: id } : doc;
}

export function addLayer(doc, layer, index = doc.layers.length) {
  const at = Math.min(doc.layers.length, Math.max(0, Math.round(index)));
  const layers = doc.layers.slice();
  layers.splice(at, 0, layer);
  return { ...doc, layers, activeLayerId: layer.id };
}

export function removeLayer(doc, id) {
  const index = indexOfLayer(doc, id);
  if (index < 0) return doc;
  const layers = doc.layers.filter((layer) => layer.id !== id);
  const activeLayerId =
    doc.activeLayerId === id ? layers[Math.min(index, layers.length - 1)]?.id ?? null : doc.activeLayerId;
  return { ...doc, layers, activeLayerId };
}

export function updateLayer(doc, id, patch) {
  let changed = false;
  const layers = doc.layers.map((layer) => {
    if (layer.id !== id) return layer;
    changed = true;
    return createLayer({ ...layer, ...patch, id: layer.id, canvas: patch.canvas === undefined ? layer.canvas : patch.canvas });
  });
  return changed ? { ...doc, layers } : doc;
}

export function moveLayer(doc, id, delta) {
  const from = indexOfLayer(doc, id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= doc.layers.length) return doc;
  const layers = doc.layers.slice();
  const [layer] = layers.splice(from, 1);
  layers.splice(to, 0, layer);
  return { ...doc, layers };
}

export function duplicateLayerRecord(layer, { id = uid("layer"), name = `${layer.name} copy`, canvas = layer.canvas } = {}) {
  return createLayer({ ...layer, id, name, canvas });
}

export function nextLayerName(doc) {
  const used = new Set(doc.layers.map((layer) => layer.name));
  let index = doc.layers.length + 1;
  while (used.has(`Layer ${index}`)) index += 1;
  return `Layer ${index}`;
}

export function resizeDocument(doc, width, height) {
  return {
    ...doc,
    width: Math.max(1, Math.round(Number(width) || 1)),
    height: Math.max(1, Math.round(Number(height) || 1)),
  };
}
