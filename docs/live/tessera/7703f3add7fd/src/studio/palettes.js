function freezePalette(id, name, note, colors) {
  return Object.freeze({
    id,
    name,
    note,
    colors: Object.freeze(colors),
  });
}

export const PALETTES = Object.freeze({
  aegean: freezePalette("aegean", "Aegean", "Cyan and violet on deep sea glass.", {
    bg: "#070b14",
    ink: "#22d3ee",
    accent: "#a78bfa",
    highlight: "#f472b6",
    paper: "#e2e8f0",
  }),
  kilim: freezePalette("kilim", "Kilim", "Ember, saffron and woven cream.", {
    bg: "#1a0f0a",
    ink: "#f59e0b",
    accent: "#ef4444",
    highlight: "#fde68a",
    paper: "#f5e6c8",
  }),
  riso: freezePalette("riso", "Riso", "Warm paper with two-ink printing.", {
    bg: "#f4efe4",
    ink: "#1f2937",
    accent: "#ff5c8a",
    highlight: "#2f6f6a",
    paper: "#fffaf0",
  }),
  nocturne: freezePalette("nocturne", "Nocturne", "Lavender and ice after midnight.", {
    bg: "#0b0a1a",
    ink: "#c4b5fd",
    accent: "#67e8f9",
    highlight: "#f0abfc",
    paper: "#ede9fe",
  }),
  sage: freezePalette("sage", "Sage", "Moss, citrus and pale leaf.", {
    bg: "#0a0f0a",
    ink: "#86efac",
    accent: "#facc15",
    highlight: "#d9f99d",
    paper: "#f7fee7",
  }),
  ember: freezePalette("ember", "Ember", "Rose, amber and a low fire.", {
    bg: "#140b0b",
    ink: "#fb7185",
    accent: "#fbbf24",
    highlight: "#fda4af",
    paper: "#fff1f2",
  }),
  terra: freezePalette("terra", "Terra", "Clay, sage and sun-baked sand.", {
    bg: "#1c1210",
    ink: "#e07a5f",
    accent: "#81b29a",
    highlight: "#f2cc8f",
    paper: "#f4f1de",
  }),
  iris: freezePalette("iris", "Iris", "Teal, indigo and a thread of gold.", {
    bg: "#0a0f1e",
    ink: "#5eead4",
    accent: "#818cf8",
    highlight: "#fbbf24",
    paper: "#e0e7ff",
  }),
});

export const PALETTE_IDS = Object.freeze(Object.keys(PALETTES));

export function getPalette(id) {
  return PALETTES[id] || PALETTES.aegean;
}

export function paletteColor(palette, role) {
  const colors = (palette && palette.colors) || PALETTES.aegean.colors;
  return colors[role] || colors.ink || PALETTES.aegean.colors.ink;
}

export function paletteList() {
  return PALETTE_IDS.map((id) => PALETTES[id]);
}
