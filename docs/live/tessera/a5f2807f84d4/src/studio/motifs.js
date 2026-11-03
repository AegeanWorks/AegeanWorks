const LINE = Object.freeze({
  fill: "none",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
});

function stroke(role, width, opacity = 1) {
  return { ...LINE, stroke: role, "stroke-width": width, opacity };
}

function dot(cx, cy, radius, role, opacity = 0.8) {
  return { tag: "circle", cx, cy, r: radius, fill: role, opacity };
}

function wavePath(y, amplitude) {
  const a = amplitude;
  return (
    `M0 ${y} C 8 ${y - a} 17 ${y - a} 25 ${y} ` +
    `C 33 ${y + a} 42 ${y + a} 50 ${y} ` +
    `C 58 ${y - a} 67 ${y - a} 75 ${y} ` +
    `C 83 ${y + a} 92 ${y + a} 100 ${y}`
  );
}

function buildWave({ random, weight, warp }) {
  const elements = [];
  const amplitude = 2.5 + warp * 9.5;
  const width = 0.55 + weight * 0.55;
  for (let row = 0; row < 4; row += 1) {
    const y = 12.5 + row * 25;
    const phase = random() < 0.5 ? -1 : 1;
    const role = row % 2 === 0 ? "ink" : "accent";
    elements.push({
      tag: "path",
      d: wavePath(y, amplitude * phase),
      ...stroke(role, width, 0.92),
    });
    if (warp > 0.18) {
      elements.push(dot(25, y - amplitude * phase, 0.8 + weight * 0.12, "highlight", 0.72));
      elements.push(dot(75, y + amplitude * phase, 0.8 + weight * 0.12, "highlight", 0.72));
    }
  }
  return elements;
}

function ridgePath(y, amplitude, high) {
  if (high) {
    return `M0 ${y - amplitude} L25 ${y} L50 ${y - amplitude} L75 ${y} L100 ${y - amplitude}`;
  }
  return `M0 ${y} L25 ${y - amplitude} L50 ${y} L75 ${y - amplitude} L100 ${y}`;
}

function buildRidge({ random, weight, warp }) {
  const elements = [];
  const amplitude = 3.5 + warp * 8.5;
  const width = 0.5 + weight * 0.5;
  for (let row = 0; row < 4; row += 1) {
    const y = 12.5 + row * 25;
    const high = random() < 0.5;
    const role = row % 2 === 0 ? "accent" : "ink";
    elements.push({
      tag: "path",
      d: ridgePath(y, amplitude, high),
      ...stroke(role, width, 0.9),
    });
    const peakY = high ? y - amplitude : y + amplitude;
    const troughY = high ? y + amplitude : y - amplitude;
    elements.push(dot(25, peakY, 0.9 + weight * 0.12, "highlight", 0.65));
    elements.push(dot(75, troughY, 0.9 + weight * 0.12, "highlight", 0.65));
  }
  return elements;
}

function hexPath(cx, cy, radius) {
  const height = (Math.sqrt(3) / 2) * radius;
  return (
    `M${cx + radius} ${cy} ` +
    `L${cx + radius / 2} ${cy + height} ` +
    `L${cx - radius / 2} ${cy + height} ` +
    `L${cx - radius} ${cy} ` +
    `L${cx - radius / 2} ${cy - height} ` +
    `L${cx + radius / 2} ${cy - height} Z`
  );
}

function buildComb({ random, weight, warp }) {
  const elements = [];
  const radius = 30;
  const height = (Math.sqrt(3) / 2) * radius;
  const width = 0.45 + weight * 0.45;
  const centers = [];
  for (let column = 0; column < 3; column += 1) {
    const x = column * 45;
    if (column % 2 === 0) {
      centers.push({ x, y: 0 }, { x, y: height * 2 });
    } else {
      centers.push({ x, y: height });
    }
  }
  centers.forEach((center, index) => {
    const fill = random() < 0.16 + warp * 0.16 ? "highlight" : "none";
    elements.push({
      tag: "path",
      d: hexPath(center.x, center.y, radius),
      fill,
      "fill-opacity": fill === "none" ? undefined : 0.14,
      ...stroke(index % 2 === 0 ? "ink" : "accent", width, 0.9),
    });
    if (random() < 0.42) {
      elements.push(dot(center.x, center.y, 0.8 + weight * 0.2, "paper", 0.55));
    }
  });
  return elements;
}

function pathFromPoints(points) {
  return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]} L${points[2][0]} ${points[2][1]} Z`;
}

function triangle(a, b, c, role, opacity) {
  return {
    tag: "path",
    d: pathFromPoints([a, b, c]),
    fill: role,
    "fill-opacity": opacity,
    stroke: role,
    "stroke-width": 0.4,
    "stroke-linejoin": "round",
    opacity: 0.9,
  };
}

function buildPinwheel({ random, weight, warp }) {
  const center = [50, 50];
  const top = [50, 10];
  const right = [90, 50];
  const bottom = [50, 90];
  const left = [10, 50];
  const roles = ["ink", "accent", "highlight", "accent"];
  const offset = Math.floor(random() * roles.length);
  const elements = [];
  const opacity = 0.13 + warp * 0.12;
  [
    [center, top, right],
    [center, right, bottom],
    [center, bottom, left],
    [center, left, top],
  ].forEach((shape, index) => {
    elements.push(triangle(shape[0], shape[1], shape[2], roles[(index + offset) % 4], opacity));
  });
  const inner = 4.5 + warp * 5;
  elements.push({
    tag: "circle",
    cx: 50,
    cy: 50,
    r: inner,
    fill: "bg",
    stroke: "ink",
    "stroke-width": 0.4 + weight * 0.3,
    opacity: 0.96,
  });
  elements.push(dot(50, 50, 1.2 + weight * 0.16, "paper", 0.9));
  const corner = 5 + weight * 0.4;
  [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
  ].forEach(([x, y]) => {
    elements.push({
      tag: "path",
      d: `M${x} ${y} L${x + corner} ${y + corner * 0.7} L${x} ${y + corner * 1.4} L${x - corner} ${y + corner * 0.7} Z`,
      fill: "highlight",
      "fill-opacity": 0.12,
      stroke: "highlight",
      "stroke-width": 0.35,
      opacity: 0.8,
    });
  });
  return elements;
}

function buildArcade({ random, weight, warp }) {
  const elements = [];
  const radius = 24 + warp * 12;
  const width = 0.45 + weight * 0.45;
  const centers = [
    [0, 0],
    [100, 0],
    [0, 100],
    [100, 100],
    [50, 50],
  ];
  centers.forEach(([cx, cy], index) => {
    const role = index % 2 === 0 ? "ink" : "accent";
    const echo = role === "ink" ? "highlight" : "paper";
    elements.push({
      tag: "circle",
      cx,
      cy,
      r: radius,
      ...stroke(role, width, 0.82),
    });
    elements.push({
      tag: "circle",
      cx,
      cy,
      r: radius * (0.42 + random() * 0.12),
      ...stroke(echo, width * 0.6, 0.48),
    });
    elements.push(dot(cx, cy, 1.1 + weight * 0.18, "paper", 0.75));
  });
  return elements;
}

function buildMosaic({ random, weight, warp }) {
  const elements = [];
  const cells = 5;
  const size = 100 / cells;
  const roles = ["ink", "accent", "highlight", "paper"];
  const grout = 0.35 + weight * 0.4;
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const x = column * size;
      const y = row * size;
      const diagonal = random() < 0.5 + (warp - 0.5) * 0.16;
      const first = roles[Math.floor(random() * roles.length)];
      let second = roles[Math.floor(random() * roles.length)];
      if (second === first) second = roles[(roles.indexOf(first) + 1) % roles.length];
      const opacityA = 0.14 + random() * 0.22;
      const opacityB = 0.14 + random() * 0.22;
      const triangles = diagonal
        ? [
            [[x, y], [x + size, y], [x + size, y + size]],
            [[x, y], [x, y + size], [x + size, y + size]],
          ]
        : [
            [[x, y], [x + size, y], [x, y + size]],
            [[x + size, y], [x + size, y + size], [x, y + size]],
          ];
      elements.push(
        {
          tag: "path",
          d: pathFromPoints(triangles[0]),
          fill: first,
          "fill-opacity": opacityA,
          stroke: "bg",
          "stroke-width": grout,
          "stroke-linejoin": "round",
        },
        {
          tag: "path",
          d: pathFromPoints(triangles[1]),
          fill: second,
          "fill-opacity": opacityB,
          stroke: "bg",
          "stroke-width": grout,
          "stroke-linejoin": "round",
        },
      );
      if (random() < 0.2) {
        elements.push(dot(x + size / 2, y + size / 2, 1 + weight * 0.24, "paper", 0.62));
      }
    }
  }
  return elements;
}

function buildLoom({ random, weight, warp }) {
  const elements = [];
  const lanes = 4;
  const step = 100 / lanes;
  const band = 8 + warp * 4;
  const half = band / 2;
  const lineWidth = 0.45 + weight * 0.4;
  const fillOpacity = 0.08 + warp * 0.07;
  const phase = random() < 0.5 ? 0 : 1;
  for (let index = 0; index < lanes; index += 1) {
    const center = index * step + step / 2;
    const role = index % 2 === 0 ? "ink" : "accent";
    const crossRole = index % 2 === 0 ? "accent" : "ink";

    elements.push({
      tag: "rect",
      x: 0,
      y: center - half,
      width: 100,
      height: band,
      fill: role,
      "fill-opacity": fillOpacity,
    });
    for (let cross = 0; cross < lanes; cross += 1) {
      if ((index + cross + phase) % 2 !== 0) continue;
      const x0 = cross * step;
      elements.push({
        tag: "path",
        d: `M${x0} ${center - half} H${x0 + step} M${x0} ${center + half} H${x0 + step}`,
        ...stroke(role, lineWidth, 0.76),
      });
    }

    elements.push({
      tag: "rect",
      x: center - half,
      y: 0,
      width: band,
      height: 100,
      fill: crossRole,
      "fill-opacity": fillOpacity,
    });
    for (let cross = 0; cross < lanes; cross += 1) {
      if ((index + cross + phase) % 2 !== 1) continue;
      const y0 = cross * step;
      elements.push({
        tag: "path",
        d: `M${center - half} ${y0} V${y0 + step} M${center + half} ${y0} V${y0 + step}`,
        ...stroke(crossRole, lineWidth, 0.76),
      });
    }

    for (let cross = 0; cross < lanes; cross += 1) {
      if ((index + cross + phase) % 2 !== 0) continue;
      elements.push(
        dot(cross * step + step / 2, center, 0.8 + weight * 0.18, "paper", 0.55),
      );
    }
  }
  return elements;
}

function buildDrift({ random, weight, warp }) {
  const elements = [];
  const rows = 5;
  const amplitude = 3 + warp * 7;
  const lineWidth = 0.5 + weight * 0.5;
  const dash = 1 + weight * 0.35;
  const gap = 4 + warp * 4;
  for (let row = 0; row < rows; row += 1) {
    const base = (row + 0.5) * (100 / rows);
    const phase = random() * Math.PI * 2;
    const direction = random() < 0.5 ? -1 : 1;
    const points = [];
    for (let x = 0; x <= 100; x += 4) {
      const y = base + amplitude * direction * Math.sin((x / 100) * Math.PI * 2 + phase);
      points.push(`${x} ${y.toFixed(2)}`);
    }
    elements.push({
      tag: "path",
      d: `M${points.join(" L")}`,
      ...stroke(row % 2 === 0 ? "ink" : "accent", lineWidth, 0.82),
      "stroke-dasharray": `${dash.toFixed(2)} ${gap.toFixed(2)}`,
      "stroke-dashoffset": (row * 2.5).toFixed(2),
    });
  }
  for (let index = 0; index < 4; index += 1) {
    elements.push(
      dot(random() * 100, random() * 100, 0.5 + weight * 0.16, "highlight", 0.5),
    );
  }
  return elements;
}

function motif(id, name, note, build, tile = { width: 100, height: 100 }) {
  return Object.freeze({
    id,
    name,
    note,
    tile: Object.freeze(tile),
    build,
  });
}

export const MOTIFS = Object.freeze({
  wave: motif("wave", "Wave", "Layered sine lines with a hand-drawn swing.", buildWave),
  ridge: motif("ridge", "Ridge", "A zigzag lattice with stitched peaks.", buildRidge),
  comb: motif(
    "comb",
    "Comb",
    "A flat-top honeycomb that locks together.",
    buildComb,
    { width: 90, height: (2 / Math.sqrt(3)) * 90 },
  ),
  pinwheel: motif("pinwheel", "Pinwheel", "Four folded sails around a bright core.", buildPinwheel),
  arcade: motif("arcade", "Arcade", "Concentric rings on a diamond lattice.", buildArcade),
  mosaic: motif("mosaic", "Mosaic", "A seeded tessera field with visible grout.", buildMosaic),
  loom: motif("loom", "Loom", "A woven lattice of over-and-under bands.", buildLoom),
  drift: motif("drift", "Drift", "Dotted currents on a sine field.", buildDrift),
});

export const MOTIF_IDS = Object.freeze(Object.keys(MOTIFS));

export function getMotif(id) {
  return MOTIFS[id] || MOTIFS.wave;
}

export function motifList() {
  return MOTIF_IDS.map((id) => MOTIFS[id]);
}
