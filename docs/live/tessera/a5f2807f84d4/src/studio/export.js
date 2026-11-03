import { normalizeState, transformSuffix } from "./state.js";
import { renderSvg } from "./svg.js";

export const EXPORT_SIZES = Object.freeze([
  Object.freeze({ id: "wallpaper", label: "Wallpaper", width: 2560, height: 1440 }),
  Object.freeze({ id: "full-hd", label: "Full HD", width: 1920, height: 1080 }),
  Object.freeze({ id: "uhd", label: "4K", width: 3840, height: 2160 }),
  Object.freeze({ id: "phone", label: "Phone", width: 1170, height: 2532 }),
  Object.freeze({ id: "square", label: "Square", width: 1080, height: 1080 }),
]);

export const DEFAULT_EXPORT_SIZE = "wallpaper";

const EXPORT_BY_ID = new Map(EXPORT_SIZES.map((size) => [size.id, size]));

export function exportSize(id) {
  return EXPORT_BY_ID.get(id) || EXPORT_BY_ID.get(DEFAULT_EXPORT_SIZE);
}

export function pngName(state, sizeId = DEFAULT_EXPORT_SIZE) {
  const normalized = normalizeState(state);
  const size = exportSize(sizeId);
  const suffix = transformSuffix(normalized);
  return `tessera-${normalized.motif}-${normalized.palette}-${normalized.seed}${suffix}-${size.width}x${size.height}.png`;
}

export function renderExportSvg(state, sizeId = DEFAULT_EXPORT_SIZE, options = {}) {
  const size = exportSize(sizeId);
  return renderSvg(state, {
    width: size.width,
    height: size.height,
    repeat: normalizeState(state).repeat,
    ...options,
  });
}

export function describeExportSize(size) {
  return `${size.label} ${size.width} × ${size.height}`;
}
