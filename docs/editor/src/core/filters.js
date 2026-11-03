import { clamp } from "./color.js";

export const DEFAULT_ADJUSTMENTS = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blur: 0,
});

const ADJUSTMENT_RANGES = Object.freeze({
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturation: [-100, 100],
  hue: [-180, 180],
  grayscale: [0, 100],
  sepia: [0, 100],
  invert: [0, 100],
  blur: [0, 20],
});

export function clampAdjustments(input = {}) {
  const result = { ...DEFAULT_ADJUSTMENTS };
  for (const [key, [min, max]] of Object.entries(ADJUSTMENT_RANGES)) {
    const number = Number(input[key] ?? DEFAULT_ADJUSTMENTS[key]);
    result[key] = Number.isFinite(number) ? clamp(number, min, max) : DEFAULT_ADJUSTMENTS[key];
  }
  return result;
}

export function isNeutralAdjustments(input = {}) {
  const values = clampAdjustments(input);
  return Object.keys(DEFAULT_ADJUSTMENTS).every((key) => values[key] === DEFAULT_ADJUSTMENTS[key]);
}

export function buildCssFilter(input = {}) {
  const values = clampAdjustments(input);
  const parts = [];
  if (values.brightness !== 0) parts.push(`brightness(${(1 + values.brightness / 100).toFixed(3)})`);
  if (values.contrast !== 0) parts.push(`contrast(${(1 + values.contrast / 100).toFixed(3)})`);
  if (values.saturation !== 0) parts.push(`saturate(${(1 + values.saturation / 100).toFixed(3)})`);
  if (values.hue !== 0) parts.push(`hue-rotate(${values.hue}deg)`);
  if (values.grayscale !== 0) parts.push(`grayscale(${(values.grayscale / 100).toFixed(3)})`);
  if (values.sepia !== 0) parts.push(`sepia(${(values.sepia / 100).toFixed(3)})`);
  if (values.invert !== 0) parts.push(`invert(${(values.invert / 100).toFixed(3)})`);
  if (values.blur !== 0) parts.push(`blur(${values.blur.toFixed(2)}px)`);
  return parts.length ? parts.join(" ") : "none";
}

export function clonePixels(pixels) {
  return {
    width: pixels.width,
    height: pixels.height,
    data: new Uint8ClampedArray(pixels.data),
  };
}

export function applySharpen(pixels, amount = 1) {
  const strength = clamp(amount, 0, 4);
  if (strength === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const center = 1 + strength * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out.set(data.subarray(index, index + 4), index);
        continue;
      }
      const above = ((y - 1) * width + x) * 4;
      const below = ((y + 1) * width + x) * 4;
      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          data[index + channel] * center -
          (data[above + channel] + data[below + channel] + data[left + channel] + data[right + channel]) * strength;
        out[index + channel] = clamp(value, 0, 255);
      }
      out[index + 3] = data[index + 3];
    }
  }
  return { width, height, data: out };
}

export function applyVignette(pixels, strength = 0.5) {
  const amount = clamp(strength, 0, 1);
  if (amount === 0) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDistance = Math.hypot(centerX, centerY) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
      const factor = clamp(1 - amount * distance * distance, 0, 1);
      out[index] = data[index] * factor;
      out[index + 1] = data[index + 1] * factor;
      out[index + 2] = data[index + 2] * factor;
      out[index + 3] = data[index + 3];
    }
  }
  return { width, height, data: out };
}

export function applyPixelate(pixels, blockSize = 8) {
  const size = Math.max(1, Math.round(blockSize));
  if (size <= 1) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  for (let blockY = 0; blockY < height; blockY += size) {
    for (let blockX = 0; blockX < width; blockX += size) {
      const maxY = Math.min(height, blockY + size);
      const maxX = Math.min(width, blockX + size);
      const totals = [0, 0, 0, 0];
      let count = 0;
      for (let y = blockY; y < maxY; y += 1) {
        for (let x = blockX; x < maxX; x += 1) {
          const index = (y * width + x) * 4;
          totals[0] += data[index];
          totals[1] += data[index + 1];
          totals[2] += data[index + 2];
          totals[3] += data[index + 3];
          count += 1;
        }
      }
      const average = totals.map((total) => Math.round(total / count));
      for (let y = blockY; y < maxY; y += 1) {
        for (let x = blockX; x < maxX; x += 1) {
          const index = (y * width + x) * 4;
          out[index] = average[0];
          out[index + 1] = average[1];
          out[index + 2] = average[2];
          out[index + 3] = average[3];
        }
      }
    }
  }
  return { width, height, data: out };
}

export function applyLevels(pixels, { black = 0, white = 255, gamma = 1 } = {}) {
  const low = clamp(Math.round(Number(black) || 0), 0, 254);
  const high = clamp(Math.round(Number(white) || 255), low + 1, 255);
  const power = clamp(Number(gamma) || 1, 0.1, 3);
  if (low === 0 && high === 255 && power === 1) return clonePixels(pixels);
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const range = high - low;
  const exponent = 1 / power;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = clamp((data[index + channel] - low) / range, 0, 1);
      out[index + channel] = Math.round(Math.pow(normalized, exponent) * 255);
    }
    out[index + 3] = data[index + 3];
  }
  return { width, height, data: out };
}
