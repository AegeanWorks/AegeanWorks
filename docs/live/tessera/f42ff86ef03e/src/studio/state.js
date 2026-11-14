import { MOTIF_IDS } from "./motifs.js";
import { PALETTE_IDS } from "./palettes.js";
import { integerBetween, pick } from "./random.js";

export const LIMITS = Object.freeze({
  repeat: Object.freeze({ min: 3, max: 10 }),
  weight: Object.freeze({ min: 1, max: 6 }),
  warp: Object.freeze({ min: 0, max: 100 }),
  seed: Object.freeze({ min: 1, max: 9999 }),
});

export const ROTATIONS = Object.freeze([0, 90, 180, 270]);
export const FLIPS = Object.freeze(["none", "x", "y"]);

export const DEFAULTS = Object.freeze({
  motif: "wave",
  palette: "aegean",
  repeat: 6,
  weight: 3,
  warp: 42,
  seed: 7,
  rotate: 0,
  flip: "none",
  guides: false,
  motion: false,
  sound: false,
});

export const PRESETS = Object.freeze([
  Object.freeze({
    id: "aegean-tide",
    name: "Aegean tide",
    note: "Wave / Aegean",
    state: Object.freeze({ motif: "wave", palette: "aegean", repeat: 6, weight: 3, warp: 46, seed: 7 }),
  }),
  Object.freeze({
    id: "kilim-ridge",
    name: "Kilim ridge",
    note: "Ridge / Kilim",
    state: Object.freeze({ motif: "ridge", palette: "kilim", repeat: 5, weight: 4, warp: 64, seed: 11 }),
  }),
  Object.freeze({
    id: "riso-comb",
    name: "Riso comb",
    note: "Comb / Riso",
    state: Object.freeze({ motif: "comb", palette: "riso", repeat: 4, weight: 3, warp: 20, seed: 3 }),
  }),
  Object.freeze({
    id: "nocturne-pinwheel",
    name: "Nocturne pinwheel",
    note: "Pinwheel / Nocturne",
    state: Object.freeze({ motif: "pinwheel", palette: "nocturne", repeat: 6, weight: 2, warp: 58, seed: 5 }),
  }),
  Object.freeze({
    id: "sage-mosaic",
    name: "Sage mosaic",
    note: "Mosaic / Sage",
    state: Object.freeze({ motif: "mosaic", palette: "sage", repeat: 5, weight: 2, warp: 72, seed: 13 }),
  }),
  Object.freeze({
    id: "ember-arcade",
    name: "Ember arcade",
    note: "Arcade / Ember",
    state: Object.freeze({ motif: "arcade", palette: "ember", repeat: 5, weight: 3, warp: 54, seed: 17 }),
  }),
  Object.freeze({
    id: "terra-loom",
    name: "Terra loom",
    note: "Loom / Terra",
    state: Object.freeze({ motif: "loom", palette: "terra", repeat: 5, weight: 3, warp: 58, seed: 19 }),
  }),
  Object.freeze({
    id: "iris-drift",
    name: "Iris drift",
    note: "Drift / Iris",
    state: Object.freeze({ motif: "drift", palette: "iris", repeat: 6, weight: 2, warp: 68, seed: 23 }),
  }),
  Object.freeze({
    id: "lagoon-bloom",
    name: "Lagoon bloom",
    note: "Bloom / Lagoon",
    state: Object.freeze({ motif: "bloom", palette: "lagoon", repeat: 5, weight: 3, warp: 52, seed: 29 }),
  }),
]);

const STATE_KEYS = Object.freeze([
  "motif",
  "palette",
  "repeat",
  "weight",
  "warp",
  "seed",
  "rotate",
  "flip",
  "guides",
  "motion",
  "sound",
]);

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "on") return true;
  if (value === 0 || value === "0" || value === "false" || value === "off") return false;
  return fallback;
}

export function normalizeState(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const motif = MOTIF_IDS.includes(source.motif) ? source.motif : DEFAULTS.motif;
  const palette = PALETTE_IDS.includes(source.palette) ? source.palette : DEFAULTS.palette;
  const rotate = ROTATIONS.includes(Number(source.rotate)) ? Number(source.rotate) : DEFAULTS.rotate;
  const flip = FLIPS.includes(source.flip) ? source.flip : DEFAULTS.flip;
  return Object.freeze({
    motif,
    palette,
    repeat: clampInteger(source.repeat, LIMITS.repeat.min, LIMITS.repeat.max, DEFAULTS.repeat),
    weight: clampInteger(source.weight, LIMITS.weight.min, LIMITS.weight.max, DEFAULTS.weight),
    warp: clampInteger(source.warp, LIMITS.warp.min, LIMITS.warp.max, DEFAULTS.warp),
    seed: clampInteger(source.seed, LIMITS.seed.min, LIMITS.seed.max, DEFAULTS.seed),
    rotate,
    flip,
    guides: toBoolean(source.guides, DEFAULTS.guides),
    motion: toBoolean(source.motion, DEFAULTS.motion),
    sound: toBoolean(source.sound, DEFAULTS.sound),
  });
}

export function hasStateParams(search = "") {
  const params = new URLSearchParams(search);
  return STATE_KEYS.some((key) => params.has(key));
}

export function decodeSearch(search = "") {
  const params = new URLSearchParams(search);
  const patch = {};
  for (const key of STATE_KEYS) {
    if (params.has(key)) patch[key] = params.get(key);
  }
  return {
    hasState: Object.keys(patch).length > 0,
    preset: params.get("preset") || "",
    patch,
    state: normalizeState({ ...DEFAULTS, ...patch }),
  };
}

export function encodeState(state) {
  const normalized = normalizeState(state);
  const params = new URLSearchParams();
  for (const key of STATE_KEYS) {
    params.set(key, typeof normalized[key] === "boolean" ? (normalized[key] ? "1" : "0") : String(normalized[key]));
  }
  return params.toString();
}

export function presetState(id) {
  const preset = PRESETS.find((item) => item.id === id);
  return preset ? normalizeState({ ...DEFAULTS, ...preset.state }) : null;
}

export function applyPreset(id, current = DEFAULTS) {
  const base = normalizeState(current);
  const preset = presetState(id);
  if (!preset) return base;
  return normalizeState({
    ...base,
    ...preset,
    guides: base.guides,
    motion: base.motion,
    sound: base.sound,
    rotate: base.rotate,
    flip: base.flip,
  });
}

const PRESET_VISUAL_KEYS = Object.freeze(["motif", "palette", "repeat", "weight", "warp", "seed"]);

export function activePresetId(state) {
  const normalized = normalizeState(state);
  for (const preset of PRESETS) {
    const look = presetState(preset.id);
    if (look && PRESET_VISUAL_KEYS.every((key) => look[key] === normalized[key])) return preset.id;
  }
  return null;
}

function pickDifferent(list, current, random) {
  const candidate = pick(list, random);
  if (candidate !== current) return candidate;
  const index = list.indexOf(current);
  return list[(index + 1) % list.length];
}

export function randomizeState(current = DEFAULTS, random = Math.random) {
  const base = normalizeState(current);
  return normalizeState({
    ...base,
    motif: pickDifferent(MOTIF_IDS, base.motif, random),
    palette: pickDifferent(PALETTE_IDS, base.palette, random),
    repeat: integerBetween(LIMITS.repeat.min, LIMITS.repeat.max, random),
    weight: integerBetween(LIMITS.weight.min, LIMITS.weight.max, random),
    warp: integerBetween(LIMITS.warp.min, LIMITS.warp.max, random),
    seed: integerBetween(LIMITS.seed.min, LIMITS.seed.max, random),
    rotate: pick(ROTATIONS, random),
    flip: pick(FLIPS, random),
  });
}

export function reseedState(current = DEFAULTS, random = Math.random) {
  const base = normalizeState(current);
  const seed = integerBetween(LIMITS.seed.min, LIMITS.seed.max, random);
  return normalizeState({ ...base, seed: seed === base.seed ? (seed % LIMITS.seed.max) + 1 : seed });
}

export function describeState(state) {
  const normalized = normalizeState(state);
  const motifName = normalized.motif.charAt(0).toUpperCase() + normalized.motif.slice(1);
  const paletteName = normalized.palette.charAt(0).toUpperCase() + normalized.palette.slice(1);
  const parts = [
    `${paletteName} ${motifName.toLowerCase()}, ${normalized.repeat} repeats across, weight ${normalized.weight}, warp ${normalized.warp}%, seed ${normalized.seed}`,
  ];
  if (normalized.rotate) parts.push(`rotated ${normalized.rotate}°`);
  if (normalized.flip === "x") parts.push("flipped horizontally");
  if (normalized.flip === "y") parts.push("flipped vertically");
  return parts.join(", ");
}

export function transformLabel(state) {
  const normalized = normalizeState(state);
  const parts = [];
  if (normalized.rotate) parts.push(`${normalized.rotate}°`);
  if (normalized.flip === "x") parts.push("Flip X");
  else if (normalized.flip === "y") parts.push("Flip Y");
  return parts.join(" · ");
}

function titleCase(value) {
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shareSummary(state) {
  const normalized = normalizeState(state);
  const parts = [
    `${titleCase(normalized.palette)} ${titleCase(normalized.motif)}`,
    `seed ${normalized.seed}`,
    `${normalized.repeat} repeats`,
  ];
  const transform = transformLabel(normalized);
  if (transform) parts.push(transform);
  return parts.join(" · ");
}

export function thumbKey(state) {
  const normalized = normalizeState(state);
  return [
    normalized.palette,
    normalized.seed,
    normalized.weight,
    normalized.warp,
    normalized.rotate,
    normalized.flip,
  ].join(":");
}

export function geometrySuffix(state) {
  const normalized = normalizeState(state);
  return `-r${normalized.repeat}w${normalized.weight}v${normalized.warp}`;
}

export function transformSuffix(state) {
  const normalized = normalizeState(state);
  const parts = [];
  if (normalized.rotate) parts.push(`r${normalized.rotate}`);
  if (normalized.flip !== "none") parts.push(`f${normalized.flip}`);
  return parts.length ? `-${parts.join("-")}` : "";
}

export function exportName(state) {
  const normalized = normalizeState(state);
  return `tessera-${normalized.motif}-${normalized.palette}-${normalized.seed}${geometrySuffix(normalized)}${transformSuffix(normalized)}.svg`;
}
