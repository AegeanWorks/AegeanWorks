import { getMotif } from "./motifs.js";
import { getPalette } from "./palettes.js";
import { createRandom } from "./random.js";
import { describeState, normalizeState } from "./state.js";

const XML_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
});

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1000) / 1000);
}

function resolvePaint(value, palette) {
  if (value === "none" || value === "transparent") return value;
  return (palette.colors && palette.colors[value]) || value;
}

function attributeMarkup(name, value, palette) {
  if (value === undefined || value === null || value === false) return "";
  if (name === "fill" || name === "stroke" || name === "stop-color") {
    value = resolvePaint(value, palette);
  }
  if (typeof value === "number") value = formatNumber(value);
  return ` ${name}="${escapeXml(value)}"`;
}

export function elementMarkup(element, palette) {
  const attributes = Object.keys(element)
    .filter((name) => name !== "tag")
    .sort()
    .map((name) => attributeMarkup(name, element[name], palette))
    .join("");
  return `<${element.tag}${attributes}/>`;
}

export function elementsMarkup(elements, palette) {
  return elements.map((element) => elementMarkup(element, palette)).join("");
}

export function createPattern(state) {
  const normalized = normalizeState(state);
  const motif = getMotif(normalized.motif);
  const palette = getPalette(normalized.palette);
  const random = createRandom(normalized.seed);
  const elements = motif.build({
    random,
    weight: normalized.weight,
    warp: normalized.warp / 100,
  });
  return { state: normalized, motif, palette, elements };
}

function guideMarkup(tileWidth, tileHeight, width, height, palette) {
  const lines = [];
  for (let x = tileWidth; x < width; x += tileWidth) {
    lines.push(
      `<line x1="${formatNumber(x)}" y1="0" x2="${formatNumber(x)}" y2="${formatNumber(height)}" stroke="${escapeXml(palette.colors.ink)}" stroke-opacity="0.32" stroke-width="1" stroke-dasharray="5 9"/>`,
    );
  }
  for (let y = tileHeight; y < height; y += tileHeight) {
    lines.push(
      `<line x1="0" y1="${formatNumber(y)}" x2="${formatNumber(width)}" y2="${formatNumber(y)}" stroke="${escapeXml(palette.colors.ink)}" stroke-opacity="0.32" stroke-width="1" stroke-dasharray="5 9"/>`,
    );
  }
  return lines.join("");
}

function patternTransform(state, motif, unitWidth, unitHeight) {
  const parts = [];
  if (state.flip === "x") {
    parts.push(`translate(${formatNumber(unitWidth)} 0) scale(-1 1)`);
  } else if (state.flip === "y") {
    parts.push(`translate(0 ${formatNumber(unitHeight)}) scale(1 -1)`);
  }
  if (state.rotate === 90) {
    parts.push(`translate(${formatNumber(motif.tile.height)} 0) rotate(90)`);
  } else if (state.rotate === 180) {
    parts.push(
      `translate(${formatNumber(motif.tile.width)} ${formatNumber(motif.tile.height)}) rotate(180)`,
    );
  } else if (state.rotate === 270) {
    parts.push(`translate(0 ${formatNumber(motif.tile.width)}) rotate(270)`);
  }
  return parts.join(" ");
}

export function renderSvg(state, options = {}) {
  const width = Number(options.width) || 1200;
  const height = Number(options.height) || 800;
  const repeat = Math.max(1, Number(options.repeat) || normalizeState(state).repeat);
  const { state: normalized, motif, palette, elements } = createPattern(state);
  const swap = normalized.rotate === 90 || normalized.rotate === 270;
  const unitWidth = swap ? motif.tile.height : motif.tile.width;
  const unitHeight = swap ? motif.tile.width : motif.tile.height;
  const tileWidth = width / repeat;
  const scale = tileWidth / unitWidth;
  const tileHeight = unitHeight * scale;
  const idPrefix = options.idPrefix || "tessera";
  const patternId = `${idPrefix}-pattern`;
  const decorative = Boolean(options.decorative);
  const guides = options.guides ?? normalized.guides;
  const transform = patternTransform(normalized, motif, unitWidth, unitHeight);
  const content = elementsMarkup(elements, palette);
  const patternContent = transform
    ? `<g transform="scale(${formatNumber(scale)})"><g transform="${transform}">${content}</g></g>`
    : `<g transform="scale(${formatNumber(scale)})">${content}</g>`;
  const pattern = `<pattern id="${escapeXml(patternId)}" patternUnits="userSpaceOnUse" width="${formatNumber(tileWidth)}" height="${formatNumber(tileHeight)}">${patternContent}</pattern>`;
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;
  const title = options.title || "Tessera pattern";
  const description = options.description || describeState(normalized);
  const accessibility = decorative
    ? 'role="presentation" aria-hidden="true"'
    : `role="img" aria-labelledby="${escapeXml(titleId)} ${escapeXml(descId)}"`;
  const headings = decorative
    ? ""
    : `<title id="${escapeXml(titleId)}">${escapeXml(title)}</title><desc id="${escapeXml(descId)}">${escapeXml(description)}</desc>`;
  const guideLayer = guides ? guideMarkup(tileWidth, tileHeight, width, height, palette) : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" preserveAspectRatio="xMidYMid slice" ${accessibility}>` +
    headings +
    `<defs>${pattern}</defs>` +
    `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${escapeXml(palette.colors.bg)}"/>` +
    `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="url(#${escapeXml(patternId)})"/>` +
    guideLayer +
    "</svg>"
  );
}
