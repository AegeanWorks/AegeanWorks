// Raster export orchestration. This module never touches the DOM: the caller
// supplies a canvas factory and an SVG image loader, which keeps the raster
// path testable in Node and the browser globals in the UI layer.
export const RASTER_LIMITS = Object.freeze({
  min: 64,
  max: 8192,
  maxPixels: 16777216,
});

function rasterSize(options = {}) {
  const width = Number(options.width);
  const height = Number(options.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("PNG width and height must be whole numbers.");
  }
  if (
    width < RASTER_LIMITS.min ||
    height < RASTER_LIMITS.min ||
    width > RASTER_LIMITS.max ||
    height > RASTER_LIMITS.max
  ) {
    throw new RangeError(`PNG sides must stay between ${RASTER_LIMITS.min} and ${RASTER_LIMITS.max} pixels.`);
  }
  if (width * height > RASTER_LIMITS.maxPixels) {
    throw new RangeError(`PNG output must stay under ${RASTER_LIMITS.maxPixels} pixels.`);
  }
  return { width, height };
}

export async function svgToPng(svgText, options = {}, environment = {}) {
  const { width, height } = rasterSize(options);
  const { createCanvas, loadImage } = environment;
  if (typeof createCanvas !== "function" || typeof loadImage !== "function") {
    throw new Error("PNG export needs a canvas and an image loader.");
  }
  const blob = new Blob([String(svgText ?? "")], { type: "image/svg+xml;charset=utf-8" });
  const source = await loadImage(blob);
  const canvas = createCanvas(width, height);
  const context = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!context) {
    throw new Error("This browser cannot provide a 2D canvas for PNG export.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return await new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("This browser cannot encode a PNG."));
      return;
    }
    canvas.toBlob((png) => {
      if (png) resolve(png);
      else reject(new Error("The browser could not encode the PNG."));
    }, "image/png");
  });
}
