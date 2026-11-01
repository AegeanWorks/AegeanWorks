import { clamp, rgbaString } from "../core/color.js";
import { normalizeRect } from "../core/geometry.js";
import { gradientRadius, gradientStops, normalizeGradientType } from "../core/gradient.js";
import { cloneCanvas, context2d, createCanvas } from "./canvas.js";

export const FONT_STACKS = Object.freeze({
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
});

export function brushStamp({ size = 32, hardness = 0.7, color = "#22d3ee", opacity = 1, erase = false } = {}) {
  const diameter = Math.max(1, Math.round(size));
  const radius = diameter / 2;
  const canvas = createCanvas(diameter, diameter);
  const context = context2d(canvas);
  const center = canvas.width / 2;
  const alpha = clamp(opacity, 0, 1);
  const solid = clamp(hardness, 0, 1);
  context.save();
  if (solid >= 0.999) {
    context.fillStyle = erase ? `rgba(0, 0, 0, ${alpha})` : rgbaString(color, alpha);
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  } else {
    const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
    const edge = Math.max(0.001, Math.min(0.99, solid));
    const inner = erase ? `rgba(0, 0, 0, ${alpha})` : rgbaString(color, alpha);
    const outer = erase ? "rgba(0, 0, 0, 0)" : rgbaString(color, 0);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(edge, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  return { canvas, radius, spacing: Math.max(0.8, diameter * 0.16) };
}

function appendSelectionShape(context, selection) {
  const { kind, rect } = selection;
  if (kind === "ellipse") {
    context.ellipse(
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      Math.max(0.01, rect.w / 2),
      Math.max(0.01, rect.h / 2),
      0,
      0,
      Math.PI * 2,
    );
  } else {
    context.rect(rect.x, rect.y, rect.w, rect.h);
  }
}

export function addSelectionPath(context, selection) {
  if (!selection || !selection.rect) return false;
  context.beginPath();
  appendSelectionShape(context, selection);
  context.closePath();
  return true;
}

export function clipToSelection(context, selection) {
  if (!selection || !selection.rect) return false;
  context.beginPath();
  if (selection.invert) context.rect(0, 0, context.canvas.width, context.canvas.height);
  appendSelectionShape(context, selection);
  context.closePath();
  context.clip(selection.invert ? "evenodd" : "nonzero");
  return true;
}

export function clearSelectionArea(canvas, selection) {
  if (!selection) return;
  const context = context2d(canvas);
  context.save();
  if (clipToSelection(context, selection)) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  context.restore();
}

export function extractSelection(source, selection) {
  const output = createCanvas(source.width, source.height);
  if (!selection) return output;
  const context = context2d(output);
  context.save();
  if (clipToSelection(context, selection)) {
    context.drawImage(source, 0, 0);
  }
  context.restore();
  return output;
}

export function redrawSelectedMove(base, patch, selection, dx, dy, target = cloneCanvas(base)) {
  const context = context2d(target);
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(base, 0, 0);
  context.save();
  if (clipToSelection(context, selection)) {
    context.clearRect(0, 0, target.width, target.height);
  }
  context.restore();
  context.drawImage(patch, dx, dy);
  return target;
}

export function replaceInsideSelection(original, replacement, selection) {
  const output = cloneCanvas(original);
  if (!selection) return output;
  const context = context2d(output);
  context.save();
  if (clipToSelection(context, selection)) {
    context.clearRect(0, 0, output.width, output.height);
  }
  context.restore();
  context.save();
  if (clipToSelection(context, selection)) {
    context.drawImage(replacement, 0, 0);
  }
  context.restore();
  return output;
}

export function strokeBrush(canvas, from, to, stamp, erase = false, selection = null) {
  const context = context2d(canvas);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / stamp.spacing));
  context.save();
  clipToSelection(context, selection);
  context.globalCompositeOperation = erase ? "destination-out" : "source-over";
  context.imageSmoothingEnabled = true;
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    context.drawImage(stamp.canvas, x - stamp.canvas.width / 2, y - stamp.canvas.height / 2);
  }
  context.restore();
}

export function strokeClone(canvas, from, to, stamp, source, offset, selection = null) {
  const context = context2d(canvas);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / stamp.spacing));
  const size = stamp.canvas.width;
  const radius = size / 2;
  const piece = createCanvas(size, size);
  const pieceContext = context2d(piece, true);
  context.save();
  clipToSelection(context, selection);
  context.imageSmoothingEnabled = true;
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    pieceContext.setTransform(1, 0, 0, 1, 0, 0);
    pieceContext.globalAlpha = 1;
    pieceContext.globalCompositeOperation = "source-over";
    pieceContext.filter = "none";
    pieceContext.clearRect(0, 0, size, size);
    pieceContext.drawImage(source, x + offset.x - radius, y + offset.y - radius, size, size, 0, 0, size, size);
    pieceContext.globalCompositeOperation = "destination-in";
    pieceContext.drawImage(stamp.canvas, 0, 0);
    context.drawImage(piece, x - radius, y - radius);
  }
  context.restore();
}


export function strokeTone(canvas, from, to, stamp, selection = null) {
  const context = context2d(canvas);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / stamp.spacing));
  context.save();
  clipToSelection(context, selection);
  context.globalCompositeOperation = "source-atop";
  context.imageSmoothingEnabled = true;
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    context.drawImage(stamp.canvas, x - stamp.canvas.width / 2, y - stamp.canvas.height / 2);
  }
  context.restore();
}

export function drawShape(context, shape) {
  const {
    tool,
    start,
    end,
    color = "#22d3ee",
    outlineColor = "#e9eefb",
    fill = true,
    outline = true,
    width = 4,
    opacity = 1,
    selection = null,
  } = shape;
  const thickness = Math.max(0, Number(width) || 0);
  context.save();
  clipToSelection(context, selection);
  context.globalAlpha = clamp(opacity, 0, 1);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  if (tool === "line") {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  } else {
    const rect = normalizeRect(start, end);
    if (tool === "ellipse") {
      context.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
    } else {
      context.rect(rect.x, rect.y, rect.w, rect.h);
    }
  }
  if (fill && tool !== "line") {
    context.fillStyle = rgbaString(color, 1);
    context.fill();
  }
  if (outline && thickness > 0) {
    context.lineWidth = thickness;
    context.strokeStyle = rgbaString(outlineColor, 1);
    context.stroke();
  }
  context.restore();
}

export function drawTextOn(context, { x, y, text, color = "#e9eefb", size = 48, weight = 600, family = "system", selection = null }) {
  const value = String(text ?? "");
  if (!value.trim()) return;
  const fontSize = Math.max(1, Math.round(size));
  context.save();
  clipToSelection(context, selection);
  context.fillStyle = color;
  context.font = `${weight} ${fontSize}px ${FONT_STACKS[family] ?? FONT_STACKS.system}`;
  context.textBaseline = "top";
  context.textAlign = "left";
  const lines = value.split(/\r?\n/);
  const lineHeight = fontSize * 1.22;
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  context.restore();
}

export function drawText(canvas, options) {
  drawTextOn(context2d(canvas), options);
}

export function drawGradient(context, shape) {
  const type = normalizeGradientType(shape.type);
  const radius = gradientRadius(shape.start, shape.end);
  const gradient =
    type === "radial"
      ? context.createRadialGradient(shape.start.x, shape.start.y, 0, shape.start.x, shape.start.y, radius)
      : context.createLinearGradient(shape.start.x, shape.start.y, shape.end.x, shape.end.y);
  for (const stop of gradientStops({ from: shape.from, to: shape.to, fade: shape.fade })) {
    gradient.addColorStop(stop.offset, rgbaString(stop.color, stop.alpha));
  }
  context.save();
  clipToSelection(context, shape.selection);
  context.globalAlpha = clamp(shape.opacity ?? 1, 0, 1);
  context.fillStyle = gradient;
  context.fillRect(0, 0, shape.width, shape.height);
  context.restore();
}

export function cropCanvas(source, rect) {
  const output = createCanvas(rect.w, rect.h);
  context2d(output).drawImage(source, -rect.x, -rect.y);
  return output;
}

export function scaleCanvas(source, width, height) {
  const output = createCanvas(width, height);
  const context = context2d(output);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

export function flipCanvas(source, axis = "horizontal") {
  const output = createCanvas(source.width, source.height);
  const context = context2d(output);
  context.save();
  if (axis === "vertical") {
    context.translate(0, source.height);
    context.scale(1, -1);
  } else {
    context.translate(source.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(source, 0, 0);
  context.restore();
  return output;
}

export function rotateCanvas(source) {
  const output = createCanvas(source.height, source.width);
  const context = context2d(output);
  context.save();
  context.translate(output.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(source, 0, 0);
  context.restore();
  return output;
}

export function shiftedCanvas(source, dx, dy) {
  const output = createCanvas(source.width, source.height);
  context2d(output).drawImage(source, Math.round(dx), Math.round(dy));
  return output;
}

export { cloneCanvas };

export function placeCanvas(source, width, height, x, y) {
  const output = createCanvas(width, height);
  context2d(output).drawImage(source, x, y);
  return output;
}
