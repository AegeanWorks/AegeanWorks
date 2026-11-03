import { blendOperation } from "../core/document.js";
import { buildCssFilter } from "../core/filters.js";

const thumbnails = new WeakMap();

export function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(Number(width) || 1));
  canvas.height = Math.max(1, Math.round(Number(height) || 1));
  return canvas;
}

export function context2d(canvas, readable = false) {
  const context = canvas.getContext("2d", readable ? { willReadFrequently: true } : undefined);
  if (!context) throw new Error("This browser does not provide a 2D canvas context.");
  return context;
}

export function cloneCanvas(source) {
  const copy = createCanvas(source.width, source.height);
  context2d(copy).drawImage(source, 0, 0);
  return copy;
}

export function fillCanvas(canvas, color) {
  const context = context2d(canvas);
  context.save();
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function getPixels(canvas) {
  return context2d(canvas, true).getImageData(0, 0, canvas.width, canvas.height);
}

export function putPixels(canvas, pixels) {
  const context = context2d(canvas, true);
  const image = context.createImageData(pixels.width, pixels.height);
  image.data.set(pixels.data);
  context.putImageData(image, 0, 0);
}

export function drawLayerStack(context, doc, { background = null, moving = null, scratch = null } = {}) {
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, doc.width, doc.height);
  }
  let base = null;
  let baseId = null;
  let clipped = scratch;
  for (const layer of doc.layers) {
    if (!layer.visible || !layer.canvas) {
      if (!layer.clipToBelow) {
        base = null;
        baseId = null;
      }
      continue;
    }
    if (!layer.clipToBelow) {
      base = layer.canvas;
      baseId = layer.id;
    }
    let source = layer.canvas;
    let adjusted = false;
    if (layer.clipToBelow) {
      if (!base) continue;
      if (!clipped) clipped = createCanvas(doc.width, doc.height);
      const target = context2d(clipped, true);
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = 1;
      target.globalCompositeOperation = "source-over";
      target.filter = "none";
      target.clearRect(0, 0, clipped.width, clipped.height);
      target.filter = buildCssFilter(layer.adjustments);
      const layerDx = moving && moving.layerId === layer.id ? moving.dx : 0;
      const layerDy = moving && moving.layerId === layer.id ? moving.dy : 0;
      target.drawImage(layer.canvas, layerDx, layerDy);
      target.filter = "none";
      target.globalCompositeOperation = "destination-in";
      const baseDx = moving && moving.layerId === baseId ? moving.dx : 0;
      const baseDy = moving && moving.layerId === baseId ? moving.dy : 0;
      target.drawImage(base, baseDx, baseDy);
      target.globalCompositeOperation = "source-over";
      source = clipped;
      adjusted = true;
    }
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = blendOperation(layer.blendMode);
    if (!adjusted) {
      context.filter = buildCssFilter(layer.adjustments);
      if (moving && moving.layerId === layer.id) context.translate(moving.dx, moving.dy);
    }
    context.drawImage(source, 0, 0);
    context.restore();
  }
}

export function compositeDocument(doc, { background = null } = {}) {
  const output = createCanvas(doc.width, doc.height);
  drawLayerStack(context2d(output), doc, { background });
  return output;
}

export function layerThumbnail(canvas, maxWidth = 44, maxHeight = 34) {
  if (!canvas) return "";
  const cached = thumbnails.get(canvas);
  const key = `${maxWidth}x${maxHeight}`;
  if (cached && cached.key === key) return cached.url;
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const thumb = createCanvas(width, height);
  const context = context2d(thumb);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, 0, 0, width, height);
  const url = thumb.toDataURL("image/png");
  thumbnails.set(canvas, { key, url });
  return url;
}

export function imageToCanvas(image, width = image.naturalWidth || image.width, height = image.naturalHeight || image.height) {
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function samplePixel(canvas, x, y) {
  const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(y)));
  const data = context2d(canvas, true).getImageData(px, py, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode this image."))),
      type,
      quality,
    );
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be decoded."));
    image.src = source;
  });
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.readAsText(file);
  });
}

export function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
}
