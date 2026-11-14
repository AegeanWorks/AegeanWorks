/*
 * Orrery live studio -- a sealed, dependency-free browser port of the Python
 * engine in orrery/sim.py, plus the in-page studio around it.
 *
 * The core below mirrors the Python code statement for statement so the
 * browser build and the terminal side produce the same trajectories:
 * - kick-drift-kick leapfrog `step` with the same arithmetic order,
 * - the same pairwise accumulation order in `accelerations` (i < j),
 * - Neumaier compensated summation standing in for `math.fsum`,
 * - 1PN general relativity, Coulomb force, inelastic merge and elastic bounce
 *   with the same guard conditions and resolution order.
 *
 * The studio section only boots when a DOM is present, so a Node harness can
 * load this file for parity tests through `globalThis.ORRERY_CORE`.
 */

"use strict";

/* ------------------------------------------------------------------ */
/* Core: numerics                                                      */
/* ------------------------------------------------------------------ */

function fsum(values) {
  // Neumaier's compensated summation, the practical stand-in for math.fsum
  // on the partial sums the core accumulates.
  let total = 0.0;
  let compensation = 0.0;
  for (const value of values) {
    const next = total + value;
    if (Math.abs(total) >= Math.abs(value)) {
      compensation += (total - next) + value;
    } else {
      compensation += (value - next) + total;
    }
    total = next;
  }
  return total + compensation;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}

/* ------------------------------------------------------------------ */
/* Core: bodies and forces                                             */
/* ------------------------------------------------------------------ */

function makeBody(spec) {
  return {
    name: spec.name,
    mass: spec.mass,
    x: spec.x,
    y: spec.y,
    vx: spec.vx,
    vy: spec.vy,
    symbol: spec.symbol || "o",
    color: spec.color || "white",
    charge: spec.charge || 0.0,
  };
}

function cloneBody(body) {
  return { ...body };
}

/**
 * Pairwise Newtonian/Coulomb acceleration on every body, with optional 1PN
 * general relativity. Mirrors `_accelerations` in orrery/sim.py, including
 * the accumulation order that keeps the floating-point sums comparable.
 */
function accelerations(bodies, g, c, k_e) {
  const count = bodies.length;
  const ax = new Array(count).fill(0.0);
  const ay = new Array(count).fill(0.0);
  const c2 = (c !== null && isFiniteNumber(c) && c > 0.0) ? c * c : null;
  for (let i = 0; i < count - 1; i++) {
    const first = bodies[i];
    for (let j = i + 1; j < count; j++) {
      const second = bodies[j];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const r2 = dx * dx + dy * dy;
      if (r2 <= 0.0) {
        continue;
      }
      const r = Math.sqrt(r2);
      const inverse_r3 = 1.0 / (r2 * r);
      const pull = g * inverse_r3;
      if (c2 !== null) {
        const dvx = first.vx - second.vx;
        const dvy = first.vy - second.vy;
        const v2 = dvx * dvx + dvy * dvy;
        const rv_dot = dx * dvx + dy * dvy;
        const phi = g * (first.mass + second.mass) / r;
        const factor_r = (4.0 * phi - v2) / c2;
        const factor_v = 4.0 * rv_dot / c2;
        ax[i] += pull * second.mass * (dx * (1.0 + factor_r) - dvx * factor_v);
        ay[i] += pull * second.mass * (dy * (1.0 + factor_r) - dvy * factor_v);
        ax[j] -= pull * first.mass * (dx * (1.0 + factor_r) - dvx * factor_v);
        ay[j] -= pull * first.mass * (dy * (1.0 + factor_r) - dvy * factor_v);
      } else {
        ax[i] += pull * second.mass * dx;
        ay[i] += pull * second.mass * dy;
        ax[j] -= pull * first.mass * dx;
        ay[j] -= pull * first.mass * dy;
      }
      if (k_e !== 0.0 && (first.charge !== 0.0 || second.charge !== 0.0)) {
        const coulomb_pull = k_e * (first.charge * second.charge) * inverse_r3;
        ax[i] -= (coulomb_pull / first.mass) * dx;
        ay[i] -= (coulomb_pull / first.mass) * dy;
        ax[j] += (coulomb_pull / second.mass) * dx;
        ay[j] += (coulomb_pull / second.mass) * dy;
      }
    }
  }
  return bodies.map((body, index) => ({ x: ax[index], y: ay[index] }));
}

/* ------------------------------------------------------------------ */
/* Core: the world                                                     */
/* ------------------------------------------------------------------ */

class World {
  constructor(bodies, g, options = {}) {
    const time = options.time ?? 0.0;
    const c = options.c ?? null;
    const k_e = options.k_e ?? 0.0;
    if (!isFiniteNumber(g) || g <= 0.0) {
      throw new RangeError("the gravitational constant must be a positive finite number");
    }
    if (c !== null && (!isFiniteNumber(c) || c <= 0.0)) {
      throw new RangeError("the speed of light must be a positive finite number");
    }
    if (!isFiniteNumber(k_e) || k_e < 0.0) {
      throw new RangeError("the Coulomb constant must be a non-negative finite number");
    }
    if (!bodies.length) {
      throw new RangeError("a world needs at least one body");
    }
    const names = new Set();
    for (const body of bodies) {
      if (!isFiniteNumber(body.mass) || body.mass <= 0.0) {
        throw new RangeError(`body '${body.name}' must have a positive finite mass`);
      }
      for (const value of [body.x, body.y, body.vx, body.vy]) {
        if (!isFiniteNumber(value)) {
          throw new RangeError(`body '${body.name}' has a non-finite state`);
        }
      }
      if (names.has(body.name)) {
        throw new RangeError(`duplicate body name '${body.name}'`);
      }
      names.add(body.name);
    }
    if (!isFiniteNumber(time)) {
      throw new RangeError("time must be finite");
    }
    this.bodies = bodies.map(cloneBody);
    this.g = g;
    this.time = time;
    this.c = c;
    this.k_e = k_e;
  }

  accelerations() {
    return accelerations(this.bodies, this.g, this.c, this.k_e);
  }

  /** Advance one kick-drift-kick leapfrog step of length `dt`. */
  step(dt) {
    if (!isFiniteNumber(dt) || dt === 0.0) {
      throw new RangeError("the time step must be a non-zero finite number");
    }
    const half = dt * 0.5;
    const start = this.accelerations();
    const drifted = this.bodies.map((body, index) => {
      const acc = start[index];
      return {
        ...body,
        x: body.x + (body.vx + acc.x * half) * dt,
        y: body.y + (body.vy + acc.y * half) * dt,
        vx: body.vx + acc.x * half,
        vy: body.vy + acc.y * half,
      };
    });
    const end = accelerations(drifted, this.g, this.c, this.k_e);
    this.bodies = drifted.map((body, index) => {
      const acc = end[index];
      return { ...body, vx: body.vx + acc.x * half, vy: body.vy + acc.y * half };
    });
    this.time += dt;
  }

  /** Inelastically merge bodies closer than merge_radius, conserving momentum. */
  resolveCollisions(mergeRadius = 0.01) {
    if (mergeRadius <= 0.0 || this.bodies.length <= 1) {
      return [];
    }
    const list = this.bodies.map(cloneBody);
    const events = [];
    let i = 0;
    while (i < list.length) {
      let j = i + 1;
      let mergedAny = false;
      while (j < list.length) {
        const b1 = list[i];
        const b2 = list[j];
        if (Math.hypot(b1.x - b2.x, b1.y - b2.y) <= mergeRadius) {
          const totalM = b1.mass + b2.mass;
          const pos = {
            x: (b1.x * b1.mass + b2.x * b2.mass) / totalM,
            y: (b1.y * b1.mass + b2.y * b2.mass) / totalM,
          };
          const vel = {
            x: (b1.vx * b1.mass + b2.vx * b2.mass) / totalM,
            y: (b1.vy * b1.mass + b2.vy * b2.mass) / totalM,
          };
          const [primary, secondary] = (b1.mass >= b2.mass) ? [b1, b2] : [b2, b1];
          list[i] = {
            name: primary.name,
            mass: totalM,
            x: pos.x,
            y: pos.y,
            vx: vel.x,
            vy: vel.y,
            symbol: primary.symbol,
            color: primary.color,
            charge: b1.charge + b2.charge,
          };
          list.splice(j, 1);
          events.push(`${primary.name} absorbed ${secondary.name}`);
          mergedAny = true;
        } else {
          j += 1;
        }
      }
      if (!mergedAny) {
        i += 1;
      }
    }
    if (events.length) {
      this.bodies = list;
    }
    return events;
  }

  /** Elastically bounce bodies closer than bounce_radius, conserving momentum. */
  resolveElasticCollisions(bounceRadius = 0.01, restitution = 1.0) {
    if (bounceRadius <= 0.0 || this.bodies.length <= 1) {
      return [];
    }
    const list = this.bodies.map(cloneBody);
    const events = [];
    for (let i = 0; i < list.length - 1; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const b1 = list[i];
        const b2 = list[j];
        const dx = b1.x - b2.x;
        const dy = b1.y - b2.y;
        const dist = Math.hypot(dx, dy);
        if (0.0 < dist && dist <= bounceRadius) {
          const nx = dx / dist;
          const ny = dy / dist;
          const v_normal = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;
          if (v_normal < 0.0) {
            const e = Math.max(0.0, Math.min(1.0, restitution));
            const impulse = -(1.0 + e) * v_normal / (1.0 / b1.mass + 1.0 / b2.mass);
            const overlap = bounceRadius - dist;
            const totalM = b1.mass + b2.mass;
            list[i] = {
              ...b1,
              x: b1.x + nx * (overlap * (b2.mass / totalM)),
              y: b1.y + ny * (overlap * (b2.mass / totalM)),
              vx: b1.vx + nx * (impulse / b1.mass),
              vy: b1.vy + ny * (impulse / b1.mass),
            };
            list[j] = {
              ...b2,
              x: b2.x - nx * (overlap * (b1.mass / totalM)),
              y: b2.y - ny * (overlap * (b1.mass / totalM)),
              vx: b2.vx - nx * (impulse / b2.mass),
              vy: b2.vy - ny * (impulse / b2.mass),
            };
            events.push(`${b1.name} bounced off ${b2.name}`);
          }
        }
      }
    }
    if (events.length) {
      this.bodies = list;
    }
    return events;
  }

  /** Integrate to `target`, ending with a shorter step when needed. */
  advanceTo(target, dt, mergeRadius = 0.0, bounceRadius = 0.0, restitution = 1.0) {
    const events = [];
    const resolve = (merge, bounce, rest) => {
      if (merge > 0.0) {
        events.push(...this.resolveCollisions(merge));
      }
      if (bounce > 0.0) {
        events.push(...this.resolveElasticCollisions(bounce, rest));
      }
    };
    if (dt > 0.0) {
      while (this.time < target - 1e-12) {
        const remaining = target - this.time;
        this.step(remaining > dt ? dt : remaining);
        resolve(mergeRadius, bounceRadius, restitution);
      }
    } else {
      while (this.time > target + 1e-12) {
        const remaining = target - this.time;
        this.step(remaining < dt ? dt : remaining);
        resolve(mergeRadius, bounceRadius, restitution);
      }
    }
    return events;
  }

  get totalMass() {
    return fsum(this.bodies.map((body) => body.mass));
  }

  momentum() {
    return {
      x: fsum(this.bodies.map((body) => body.mass * body.vx)),
      y: fsum(this.bodies.map((body) => body.mass * body.vy)),
    };
  }

  kineticEnergy() {
    return fsum(
      this.bodies.map((body) => 0.5 * body.mass * (body.vx * body.vx + body.vy * body.vy)),
    );
  }

  potentialEnergy() {
    const bodies = this.bodies;
    const terms = [];
    for (let i = 0; i < bodies.length - 1; i++) {
      const b1 = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b2 = bodies[j];
        const separation = Math.hypot(b1.x - b2.x, b1.y - b2.y);
        if (separation > 0.0) {
          terms.push(-this.g * b1.mass * b2.mass / separation);
          if (this.k_e !== 0.0 && (b1.charge !== 0.0 || b2.charge !== 0.0)) {
            terms.push(this.k_e * b1.charge * b2.charge / separation);
          }
        }
      }
    }
    return fsum(terms);
  }

  electrostaticEnergy() {
    if (this.k_e === 0.0) {
      return 0.0;
    }
    const bodies = this.bodies;
    const terms = [];
    for (let i = 0; i < bodies.length - 1; i++) {
      const b1 = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b2 = bodies[j];
        const separation = Math.hypot(b1.x - b2.x, b1.y - b2.y);
        if (separation > 0.0) {
          terms.push(this.k_e * b1.charge * b2.charge / separation);
        }
      }
    }
    return fsum(terms);
  }

  /**
   * Total relativistic energy, or null when no speed of light is set. A body
   * at or beyond c makes the special-relativistic energy undefined, so it
   * throws instead of reporting a wrong number.
   */
  relativisticEnergy() {
    if (this.c === null || this.c <= 0.0) {
      return null;
    }
    const c2 = this.c * this.c;
    let total = 0.0;
    for (const body of this.bodies) {
      const beta2 = (body.vx * body.vx + body.vy * body.vy) / c2;
      if (beta2 >= 1.0) {
        throw new RangeError(
          `body '${body.name}' reaches ${Math.hypot(body.vx, body.vy)} with c = ${this.c}; ` +
          "relativistic energy is undefined at or above the speed of light",
        );
      }
      const gamma = 1.0 / Math.sqrt(1.0 - beta2);
      total += gamma * body.mass * c2;
    }
    return total;
  }

  schwarzschildRadius() {
    if (this.c === null || this.c <= 0.0) {
      return null;
    }
    return 2.0 * this.g * this.totalMass / (this.c * this.c);
  }

  totalEnergy() {
    return this.kineticEnergy() + this.potentialEnergy();
  }

  angularMomentum() {
    return fsum(
      this.bodies.map((body) => body.mass * (body.x * body.vy - body.y * body.vx)),
    );
  }

  energyDrift(initialEnergy) {
    if (initialEnergy === 0.0) {
      return 0.0;
    }
    return (this.totalEnergy() - initialEnergy) / Math.abs(initialEnergy);
  }
}

/**
 * Osculating elements of `body` around `primary` (null conic when unbound).
 * Mirrors `orbital_elements` in orrery/sim.py, Coulomb parameter included.
 */
function orbitalElements(primary, body, g, k_e = 0.0) {
  const rx = body.x - primary.x;
  const ry = body.y - primary.y;
  const vx = body.vx - primary.vx;
  const vy = body.vy - primary.vy;
  const radius = hypot2(rx, ry);
  let mu = g * (primary.mass + body.mass);
  if (k_e !== 0.0 && primary.charge !== 0.0 && body.charge !== 0.0) {
    mu -= k_e * primary.charge * body.charge * (1.0 / primary.mass + 1.0 / body.mass);
  }
  if (radius <= 0.0 || mu <= 0.0) {
    return { semiMajor: null, eccentricity: null, period: null };
  }
  const speedSq = vx * vx + vy * vy;
  const specificEnergy = 0.5 * speedSq - mu / radius;
  const energyScale = mu / radius;
  let semiMajor = null;
  if (specificEnergy < -1e-12 * energyScale) {
    semiMajor = -mu / (2.0 * specificEnergy);
  }
  const dot = rx * vx + ry * vy;
  const ex = rx * (speedSq / mu - 1.0 / radius) - vx * (dot / mu);
  const ey = ry * (speedSq / mu - 1.0 / radius) - vy * (dot / mu);
  const eccentricity = hypot2(ex, ey);
  let period = null;
  if (semiMajor !== null && semiMajor > 0.0) {
    period = 2.0 * Math.PI * Math.sqrt(semiMajor ** 3 / mu);
  }
  return { semiMajor, eccentricity, period };
}

/* ------------------------------------------------------------------ */
/* Core: scenario loading                                              */
/* ------------------------------------------------------------------ */

function scenarioFromDocument(document_) {
  return {
    key: document_.key,
    title: document_.title,
    description: document_.description,
    g: Number(document_.g),
    dt: Number(document_.dt),
    span: Number(document_.span),
    extent: document_.extent.map(Number),
    stepsPerFrame: document_.steps_per_frame,
    trailLength: document_.trail_length,
    recordEvery: document_.record_every,
    defaultFrames: document_.default_frames,
    timeUnit: document_.time_unit,
    distanceUnit: document_.distance_unit,
    massUnit: document_.mass_unit,
    speedUnit: document_.speed_unit,
    speedScale: Number(document_.speed_scale),
    c: document_.c === null ? null : Number(document_.c),
    k_e: Number(document_.k_e),
    // The dump stores full-precision decimal strings that round-trip through
    // Number() to the Python doubles; convert them at load time.
    bodies: document_.bodies.map((entry) => makeBody({
      ...entry,
      mass: Number(entry.mass),
      x: Number(entry.x),
      y: Number(entry.y),
      vx: Number(entry.vx),
      vy: Number(entry.vy),
      charge: Number(entry.charge),
    })),
  };
}

function loadScenarios(raw) {
  if (!raw || raw.schema !== 1 || !Array.isArray(raw.scenarios)) {
    throw new Error("the embedded scenario data does not match schema 1");
  }
  return raw.scenarios.map(scenarioFromDocument);
}

/* Custom scenario validation, mirroring orrery/custom.py so the sealed build
 * accepts exactly the files the server-side loader accepts, with the same
 * Error/Why/Fix messages and the same defaults. */
const MAX_SCENARIO_BYTES = 1048576;
const MAX_BODIES = 64;
const SCENARIO_COLORS = [
  "blue", "cyan", "gold", "gray", "green", "magenta", "orange", "red", "white", "yellow",
];

function scenarioError(message, why, fix) {
  return {
    message,
    why: why || "a custom scenario must be a finite, self-contained JSON description.",
    fix: fix || (
      "see the Custom Scenarios section in README.md, or start from " +
      "examples/custom-two-body.json in the repository."
    ),
  };
}

function fail(message, why, fix) {
  throw scenarioError(message, why, fix);
}

function requireNumber(raw, field, positive = false) {
  if (typeof raw === "boolean" || typeof raw !== "number" || !Number.isFinite(raw)) {
    fail(`${field} must be a number.`, `${field} was missing or had the wrong type.`);
  }
  if (positive && raw <= 0.0) {
    fail(`${field} must be greater than zero.`);
  }
  return raw;
}

function requireInteger(raw, field, minimum, maximum) {
  if (typeof raw === "boolean" || !Number.isInteger(raw)) {
    fail(`${field} must be an integer.`, `${field} was missing or had the wrong type.`);
  }
  if (raw < minimum || raw > maximum) {
    fail(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return raw;
}

function requireString(raw, field, maximum) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    fail(`${field} must be a non-empty string.`, `${field} was missing or empty.`);
  }
  if (raw.length > maximum) {
    fail(`${field} is longer than ${maximum} characters.`);
  }
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) {
      fail(
        `${field} must not contain control characters.`,
        "names, titles and units are rendered directly in the terminal.",
      );
    }
  }
  return raw;
}

function requireVector(raw, field) {
  if (!Array.isArray(raw) || raw.length !== 2) {
    fail(`${field} must be a two-number array.`, `${field} should look like [x, y].`);
  }
  return [
    requireNumber(raw[0], `${field}[0]`),
    requireNumber(raw[1], `${field}[1]`),
  ];
}

function requiredBody(raw, index) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(`bodies[${index}] must be an object.`);
  }
  const name = requireString(raw.name, `bodies[${index}].name`, 80);
  const mass = requireNumber(raw.mass, `bodies[${index}].mass`, true);
  const position = requireVector(raw.position, `bodies[${index}].position`);
  const velocity = requireVector(raw.velocity, `bodies[${index}].velocity`);
  const symbol = requireString(raw.symbol, `bodies[${index}].symbol`, 1);
  if (symbol.length !== 1 || !/[\x21-\x7e]/.test(symbol)) {
    fail(
      `bodies[${index}].symbol must be one printable, non-space ASCII character.`,
      "the renderer places one character per body.",
      "use a single letter or digit such as E or 4.",
    );
  }
  const color = raw.color === undefined ? "white" : raw.color;
  if (typeof color !== "string" || !SCENARIO_COLORS.includes(color)) {
    fail(
      `bodies[${index}].color is not a known colour.`,
      "the palette is fixed so colour output stays portable.",
      `use one of: ${SCENARIO_COLORS.join(", ")}.`,
    );
  }
  const charge = raw.charge === undefined ? 0.0 : requireNumber(raw.charge, `bodies[${index}].charge`);
  return { name, mass, position, velocity, symbol, color, charge };
}

function requiredUnits(raw) {
  if (raw === undefined || raw === null) {
    return { time: "t", distance: "u", mass: "m", speed: "u/t", speed_scale: 1.0 };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail("units must be an object.");
  }
  return {
    time: raw.time === undefined ? "t" : requireString(raw.time, "units.time", 16),
    distance: raw.distance === undefined ? "u" : requireString(raw.distance, "units.distance", 16),
    mass: raw.mass === undefined ? "m" : requireString(raw.mass, "units.mass", 16),
    speed: raw.speed === undefined ? "u/t" : requireString(raw.speed, "units.speed", 16),
    speed_scale: raw.speed_scale === undefined
      ? 1.0
      : requireNumber(raw.speed_scale, "units.speed_scale", true),
  };
}

/**
 * Validate one custom scenario JSON document exactly like the server loader.
 * `text` is the raw file content; returns { valid: true, entry } with a
 * studio-ready scenario entry, or { valid: false, error } with the full
 * Error/Why/Fix text. `MAX_FILE_BYTES` requests mirror orrery/custom.py.
 */
function validateScenarioDocument(text) {
  let size = 0;
  try {
    size = new globalThis.TextEncoder().encode(text).length;
  } catch (error) {
    size = text.length;
  }
  if (size > MAX_SCENARIO_BYTES) {
    const detail = scenarioError(
      `the uploaded scenario is larger than ${MAX_SCENARIO_BYTES.toLocaleString("en-US")} bytes.`,
      "a scenario description should contain only a small amount of data.",
    );
    return { valid: false, error: `${detail.message}\nWhy: ${detail.why}\nFix: ${detail.fix}` };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const detail = scenarioError("the uploaded scenario is not valid JSON.", "the file did not parse as JSON.");
    return { valid: false, error: `${detail.message}\nWhy: ${detail.why}\nFix: ${detail.fix}` };
  }
  try {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      fail("the top-level JSON value must be an object.");
    }
    const g = requireNumber(data.g, "g", true);
    const dt = requireNumber(data.dt, "dt", true);
    const span = requireNumber(data.span, "span", true);
    if (!Array.isArray(data.extent) || data.extent.length !== 2) {
      fail("extent must be a two-number array.", "extent should look like [half_x, half_y].");
    }
    const extent = [
      requireNumber(data.extent[0], "extent[0]", true),
      requireNumber(data.extent[1], "extent[1]", true),
    ];
    if (!Array.isArray(data.bodies) || data.bodies.length < 1 || data.bodies.length > MAX_BODIES) {
      fail(
        `bodies must be an array with 1-${MAX_BODIES} entries.`,
        "the O(N^2) gravity loop and the terminal need a bounded body count.",
      );
    }
    const bodies = data.bodies.map(requiredBody);
    const names = bodies.map((body) => body.name);
    if (new Set(names).size !== names.length) {
      fail("body names must be unique.");
    }
    const symbols = bodies.map((body) => body.symbol);
    if (new Set(symbols).size !== symbols.length) {
      fail("body symbols must be unique.", "the legend and frame need one symbol per body.");
    }
    const key = data.key === undefined ? "custom" : requireString(data.key, "key", 64);
    const title = data.title === undefined ? key : requireString(data.title, "title", 200);
    const description = data.description === undefined
      ? "Custom scenario uploaded in the browser."
      : requireString(data.description, "description", 2000);
    const units = requiredUnits(data.units);
    const stepsPerFrame = data.steps_per_frame === undefined
      ? 1
      : requireInteger(data.steps_per_frame, "steps_per_frame", 1, 100000);
    const trailLength = data.trail_length === undefined
      ? 1000
      : requireInteger(data.trail_length, "trail_length", 1, 200000);
    const recordEvery = data.record_every === undefined
      ? 1
      : requireInteger(data.record_every, "record_every", 1, 100000);
    const defaultFrames = data.default_frames === undefined
      ? 120
      : requireInteger(data.default_frames, "default_frames", 1, 1000000);
    const c = ("c" in data) && data.c !== null ? requireNumber(data.c, "c", true) : null;
    const k_e = data.k_e === undefined ? 0.0 : requireNumber(data.k_e, "k_e");
    if (k_e < 0.0) {
      fail("k_e must be a non-negative number.");
    }
    for (const body of bodies) {
      if (Math.abs(body.position[0]) > extent[0] || Math.abs(body.position[1]) > extent[1]) {
        fail(
          `the scenario is inconsistent: scenario '${key}' body '${body.name}' lies outside its extent`,
          "one of the ranges, symbols or extents does not agree with the bodies.",
        );
      }
    }
    const entry = scenarioFromDocument({
      key,
      title,
      description,
      g,
      dt,
      span,
      extent,
      steps_per_frame: stepsPerFrame,
      trail_length: trailLength,
      record_every: recordEvery,
      default_frames: defaultFrames,
      time_unit: units.time,
      distance_unit: units.distance,
      mass_unit: units.mass,
      speed_unit: units.speed,
      speed_scale: units.speed_scale,
      c,
      k_e,
      bodies: bodies.map((body) => ({
        name: body.name,
        mass: body.mass,
        x: body.position[0],
        y: body.position[1],
        vx: body.velocity[0],
        vy: body.velocity[1],
        symbol: body.symbol,
        color: body.color,
        charge: body.charge,
      })),
    });
    return { valid: true, key: entry.key, title: entry.title, bodies: entry.bodies.length, entry };
  } catch (error) {
    const detail = error && error.why !== undefined
      ? error
      : scenarioError(String(error && error.message ? error.message : error));
    return { valid: false, error: `${detail.message}\nWhy: ${detail.why}\nFix: ${detail.fix}` };
  }
}

/** Catalogue rows for the world selector, mirroring web.py's /api/scenarios. */
function scenarioCatalogue(scenarios) {
  return scenarios.map((scenario) => ({
    key: scenario.key,
    title: scenario.title,
    description: scenario.description,
    bodies: scenario.bodies.length,
    span: `${gFormat(scenario.span)} ${scenario.distanceUnit}`,
    c: scenario.c,
    k_e: scenario.k_e,
  }));
}

function gFormat(value) {
  const rounded = Number(value.toPrecision(12));
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  const text = String(rounded);
  return text.includes("e") ? text : String(parseFloat(text));
}

/* ------------------------------------------------------------------ */
/* Public core surface                                                 */
/* ------------------------------------------------------------------ */

globalThis.ORRERY_CORE = {
  fsum,
  makeBody,
  accelerations,
  World,
  orbitalElements,
  scenarioFromDocument,
  loadScenarios,
  validateScenarioDocument,
  scenarioCatalogue,
};

/* ------------------------------------------------------------------ */
/* Studio: the full Web Studio UI on the parity engine                 */
/* ------------------------------------------------------------------ */

/* Orrery studio: the full Web Studio UI from orrery/web.py, driven by the
 * sealed ORRERY_CORE engine so the browser world reproduces the Python
 * trajectories statement for statement. Boots only inside a document. */

const COLOR_PALETTE = {
  yellow: "#ffd700",
  red: "#ff3366",
  blue: "#00e5ff",
  cyan: "#00ffff",
  magenta: "#e040fb",
  gold: "#ffb300",
  green: "#00e676",
  orange: "#ff8700",
  gray: "#a0aab8",
  white: "#f5f7fa",
};

if (typeof document !== "undefined") {
  bootStudio(document);
}

function bootStudio(document_) {
  const scenarios = loadScenarios(globalThis.ORRERY_SCENARIOS);
  const canvas = document_.getElementById("orrery-canvas");
  const context = canvas.getContext("2d");
  const energyCanvas = document_.getElementById("energy-chart");
  const energyContext = energyCanvas.getContext("2d");

  const el = {};
  for (const id of [
    "scenario-select", "btn-play", "btn-step-back", "btn-step-fwd", "btn-reverse",
    "btn-warp-down", "btn-warp-up", "warp-label", "btn-reset", "btn-toggle-hud",
    "hud-panel", "btn-upload", "file-input", "scenario-desc", "units-badge",
    "slider-dt", "label-dt", "check-relativity", "slider-c", "label-c",
    "check-coulomb", "slider-ke", "label-ke", "select-collision", "slider-trail",
    "label-trail", "select-dot-style", "select-tracking", "bodies-tbody",
    "time-readout", "val-drift", "val-virial", "val-ke", "val-pe",
  ]) {
    el[id] = document_.getElementById(id);
  }

  const state = {
    scenario: null,
    world: null,
    trails: [],
    paused: false,
    dt: 0.01,
    maxTrails: 800,
    timeDirection: 1.0,
    timeWarp: 1.0,
    initialEnergy: 0.0,
    driftHistory: [],
    trackingIndex: -1,
    pan: { x: 0, y: 0 },
    zoom: 1.0,
    collisionMode: "bounce",
    bounceRadius: 0.06,
    restitution: 0.95,
    mergeRadius: 0.04,
    dotStyle: "line",
  };

  // Clamp a slider by widening its range, so overrides outside the default
  // bounds are shown and used instead of being silently snapped.
  function setSliderValue(slider, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return;
    }
    slider.min = String(Math.min(parseFloat(slider.min), number));
    slider.max = String(Math.max(parseFloat(slider.max), number));
    slider.value = String(number);
    return number;
  }

  function rebuildWorld(scenario, preserveWorld) {
    const previous = preserveWorld ? state.world : null;
    state.world = new World(
      previous ? previous.bodies.map(cloneBody) : scenario.bodies,
      scenario.g,
      {
        c: documentRelativityC(scenario),
        k_e: documentCoulombK(scenario),
        time: previous ? previous.time : 0.0,
      },
    );
    if (!preserveWorld) {
      state.trails = scenario.bodies.map(() => []);
    }
    if (!preserveWorld) {
      state.initialEnergy = state.world.totalEnergy();
      state.driftHistory = [0.0];
      state.pan = { x: 0, y: 0 };
      state.zoom = 1.0;
      state.trackingIndex = -1;
    }
  }

  function documentRelativityC(scenario) {
    if (!el["check-relativity"].checked) {
      return null;
    }
    const raw = el["slider-c"].value;
    const override = raw === "" ? null : Number(raw);
    if (override === null) {
      return scenario.c;
    }
    return Number.isFinite(override) && override > 0.0 ? override : scenario.c;
  }

  function documentCoulombK(scenario) {
    if (!el["check-coulomb"].checked) {
      return 0.0;
    }
    const override = Number(el["slider-ke"].value);
    if (Number.isFinite(override) && override >= 0.0) {
      return override;
    }
    return scenario.k_e;
  }

  function loadScenario(scenario) {
    state.scenario = scenario;
    state.dt = scenario.dt;
    state.maxTrails = scenario.trailLength || 800;

    setSliderValue(el["slider-trail"], state.maxTrails);
    el["label-trail"].textContent = String(state.maxTrails);
    el["scenario-desc"].textContent = scenario.description;
    el["units-badge"].textContent = `${scenario.distanceUnit}, ${scenario.timeUnit}`;
    setSliderValue(el["slider-dt"], scenario.dt);
    el["label-dt"].textContent = String(scenario.dt);
    el["check-relativity"].checked = scenario.c !== null;
    if (scenario.c !== null) {
      setSliderValue(el["slider-c"], scenario.c);
    }
    el["check-coulomb"].checked = scenario.k_e > 0.0;
    if (scenario.k_e) {
      setSliderValue(el["slider-ke"], scenario.k_e);
    }
    el["label-ke"].textContent = "ke=" + String(scenario.k_e);
    const cLabel = scenario.c !== null ? String(scenario.c) : el["slider-c"].value;
    el["label-c"].textContent = "c=" + cLabel;

    // The sealed build has no /api/config, so ?key=value query overrides
    // (rate, reverse, c, ke, dt, collision) re-apply on every load, matching
    // web.py's applyWebOptions before the world is rebuilt from the controls.
    applyUrlOptions();

    rebuildWorld(scenario, false);
    updateTrackingSelect();
    el["select-tracking"].value = "-1";
    el["select-collision"].value = state.collisionMode;
  }

  function applyUrlOptions() {
    if (typeof URLSearchParams !== "function" || !globalThis.location
        || typeof globalThis.location.search !== "string") {
      return;
    }
    const op = new URLSearchParams(globalThis.location.search);
    const optionNumber = (key) => {
      const raw = op.get(key);
      return raw === null ? null : Number(raw);
    };
    const dt = optionNumber("dt");
    if (dt !== null && Number.isFinite(dt) && dt > 0.0) {
      state.dt = dt;
      setSliderValue(el["slider-dt"], dt);
      el["label-dt"].textContent = String(dt);
    }
    const rate = optionNumber("rate");
    if (rate !== null && Number.isFinite(rate) && rate > 0.0) {
      state.timeWarp = Math.min(50.0, rate);
      el["warp-label"].textContent = state.timeWarp + "x";
    }
    if (op.get("reverse")) {
      state.timeDirection = -1.0;
      el["btn-reverse"].textContent = "REVERSE";
      el["btn-reverse"].className = "badge badge-reverse";
    }
    if (op.get("relativity") === "0") {
      el["check-relativity"].checked = false;
      el["label-c"].textContent = "c=" + el["slider-c"].value;
    }
    const cLight = optionNumber("c");
    if (cLight !== null && Number.isFinite(cLight) && cLight > 0.0) {
      setSliderValue(el["slider-c"], cLight);
      el["check-relativity"].checked = true;
      el["label-c"].textContent = "c=" + cLight;
    }
    const kCoulomb = optionNumber("ke");
    if (kCoulomb !== null && Number.isFinite(kCoulomb) && kCoulomb >= 0.0) {
      setSliderValue(el["slider-ke"], kCoulomb);
      el["check-coulomb"].checked = true;
      el["label-ke"].textContent = "ke=" + kCoulomb;
    }
    const collision = op.get("collision");
    if (collision === "off" || collision === "bounce" || collision === "merge") {
      state.collisionMode = collision;
    }
  }

  function updateTrackingSelect() {
    const select = el["select-tracking"];
    while (select.firstChild) {
      select.firstChild.remove();
    }
    const free = document_.createElement("option");
    free.value = "-1";
    free.textContent = "Barycentre (Free)";
    select.appendChild(free);
    state.world.bodies.forEach((body, index) => {
      const option = document_.createElement("option");
      option.value = String(index);
      option.textContent = `${body.name} (${body.symbol})`;
      select.appendChild(option);
    });
    if (state.trackingIndex >= 0 && state.trackingIndex < state.world.bodies.length) {
      select.value = String(state.trackingIndex);
    } else {
      state.trackingIndex = -1;
      select.value = "-1";
    }
  }

  function stepWorld(dt) {
    state.world.step(dt);
    if (state.collisionMode === "bounce") {
      state.world.resolveElasticCollisions(state.bounceRadius, state.restitution);
    } else if (state.collisionMode === "merge") {
      const before = state.world.bodies.length;
      state.world.resolveCollisions(state.mergeRadius);
      if (state.world.bodies.length !== before) {
        // A merge drops one body at an arbitrary index; splicing keeps the
        // wrong history and draws a spurious line across the scene.
        // Reseed every trail from the current positions (mirrors ADR-014).
        state.trails = state.world.bodies.map((body) => [{ x: body.x, y: body.y }]);
        if (state.trackingIndex >= state.world.bodies.length) {
          state.trackingIndex = -1;
        }
        updateTrackingSelect();
      }
    }
  }

  // Interactive pan and zoom
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  canvas.addEventListener("mousedown", (event) => {
    isDragging = true;
    dragStart = { x: event.clientX, y: event.clientY };
  });
  globalThis.addEventListener("mouseup", () => {
    isDragging = false;
  });
  canvas.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    dragStart = { x: event.clientX, y: event.clientY };
    const worldScale = (state.scenario.span * state.zoom)
      / Math.min(canvas.clientWidth, canvas.clientHeight);
    state.pan.x -= dx * worldScale;
    state.pan.y += dy * worldScale;
    state.trackingIndex = -1;
    el["select-tracking"].value = "-1";
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.15 : 0.85;
    state.zoom = Math.max(0.02, Math.min(50.0, state.zoom * factor));
  });

  // UI button bindings
  el["btn-play"].addEventListener("click", () => {
    state.paused = !state.paused;
    el["btn-play"].textContent = state.paused ? "\u25B6" : "\u23F8";
  });
  el["btn-reverse"].addEventListener("click", () => {
    state.timeDirection *= -1.0;
    el["btn-reverse"].textContent = state.timeDirection > 0 ? "FORWARD" : "REVERSE";
    el["btn-reverse"].className = state.timeDirection > 0
      ? "badge badge-forward"
      : "badge badge-reverse";
  });
  el["btn-step-fwd"].addEventListener("click", () => stepWorld(state.dt));
  el["btn-step-back"].addEventListener("click", () => stepWorld(-state.dt));
  el["btn-warp-up"].addEventListener("click", () => {
    state.timeWarp = Math.min(50.0, +(state.timeWarp * 1.5).toFixed(2));
    el["warp-label"].textContent = state.timeWarp + "x";
  });
  el["btn-warp-down"].addEventListener("click", () => {
    state.timeWarp = Math.max(0.05, +(state.timeWarp / 1.5).toFixed(2));
    el["warp-label"].textContent = state.timeWarp + "x";
  });
  el["btn-reset"].addEventListener("click", () => {
    loadScenario(state.scenario);
  });
  el["btn-toggle-hud"].addEventListener("click", () => {
    el["hud-panel"].classList.toggle("collapsed");
  });
  el["slider-dt"].addEventListener("input", (event) => {
    state.dt = parseFloat(event.target.value);
    el["label-dt"].textContent = String(state.dt);
  });
  el["slider-c"].addEventListener("input", (event) => {
    el["label-c"].textContent = "c=" + event.target.value;
    if (el["check-relativity"].checked) {
      rebuildWorld(state.scenario, true);
    }
  });
  el["slider-ke"].addEventListener("input", (event) => {
    el["label-ke"].textContent = "ke=" + event.target.value;
    if (el["check-coulomb"].checked) {
      rebuildWorld(state.scenario, true);
    }
  });
  el["check-relativity"].addEventListener("change", () => {
    rebuildWorld(state.scenario, true);
  });
  el["check-coulomb"].addEventListener("change", () => {
    rebuildWorld(state.scenario, true);
  });
  el["slider-trail"].addEventListener("input", (event) => {
    state.maxTrails = parseInt(event.target.value, 10);
    el["label-trail"].textContent = String(state.maxTrails);
  });
  el["select-collision"].addEventListener("change", (event) => {
    state.collisionMode = event.target.value;
  });
  el["select-dot-style"].addEventListener("change", (event) => {
    state.dotStyle = event.target.value;
  });
  el["select-tracking"].addEventListener("change", (event) => {
    state.trackingIndex = parseInt(event.target.value, 10);
  });
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("resize", resizeCanvases);
    // Keyboard: Space toggles play/pause, R resets the world. Ignored while a
    // form control holds focus so sliders and selectors keep their keys.
    globalThis.addEventListener("keydown", (event_) => {
      const name = (event_.target && event_.target.tagName || "").toLowerCase();
      if (event_.repeat || name === "input" || name === "select" || name === "textarea") {
        return;
      }
      if (event_.code === "Space") {
        event_.preventDefault();
        el["btn-play"].click();
      } else if (event_.code === "KeyR") {
        el["btn-reset"].click();
      }
    });
  }

  function resizeCanvases() {
    canvas.width = canvas.clientWidth * (globalThis.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (globalThis.devicePixelRatio || 1);
    energyCanvas.width = energyCanvas.clientWidth * (globalThis.devicePixelRatio || 1);
    energyCanvas.height = energyCanvas.clientHeight * (globalThis.devicePixelRatio || 1);
  }
  resizeCanvases();

  // Collapsing the HUD panel changes the canvas layout box without a window
  // resize, so the backings must re-fit from a layout observer. Without one,
  // the HUD toggle click re-fits on the next frame instead.
  if (typeof globalThis.ResizeObserver === "function") {
    const layoutObserver = new globalThis.ResizeObserver(resizeCanvases);
    layoutObserver.observe(canvas);
    layoutObserver.observe(energyCanvas);
  } else {
    el["btn-toggle-hud"].addEventListener("click", () => {
      globalThis.setTimeout(resizeCanvases, 0);
    });
  }

  // Custom scenario upload: validated in-process by the same rules the server
  // loader applies (mirrors orrery/custom.py), so the sealed build needs no
  // backend for uploads.
  el["btn-upload"].addEventListener("click", () => {
    el["file-input"].click();
  });
  el["file-input"].addEventListener("change", (event) => {
    const file = event.target.files
      ? event.target.files[0]
      : (event.target.filesProxy ? event.target.filesProxy[0] : null);
    if (!file) {
      return;
    }
    const reader = new globalThis.FileReader();
    reader.onload = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch (error) {
        globalThis.alert("Invalid JSON file");
        return;
      }
      const result = validateScenarioDocument(JSON.stringify(parsed));
      if (result.valid) {
        const select = el["scenario-select"];
        if (!Array.from(select.children).some((option) => option.value === result.key)) {
          const option = document_.createElement("option");
          option.value = result.key;
          option.textContent = `${result.title} (${result.bodies} bodies)`;
          select.appendChild(option);
        }
        select.value = result.key;
        state.scenario = result.entry;
        loadScenario(result.entry);
        globalThis.alert(`Loaded custom scenario: ${result.title}`);
      } else {
        globalThis.alert(`Validation error: ${result.error}`);
      }
    };
    reader.readAsText(file);
  });

  // World selector bootstrapping
  for (const item of scenarioCatalogue(scenarios)) {
    const option = document_.createElement("option");
    option.value = item.key;
    option.textContent = `${item.title} (${item.bodies} bodies)`;
    el["scenario-select"].appendChild(option);
  }
  let initial = "solar";
  if (typeof URLSearchParams === "function" && globalThis.location
      && typeof globalThis.location.search === "string") {
    const wanted = new URLSearchParams(globalThis.location.search).get("world");
    if (wanted && scenarios.some((scenario) => scenario.key === wanted)) {
      initial = wanted;
    }
  }
  el["scenario-select"].value = initial;
  loadScenario(scenarios.find((scenario) => scenario.key === initial) || scenarios[0]);

  el["scenario-select"].addEventListener("change", (event) => {
    const wanted = scenarios.find((scenario) => scenario.key === event.target.value);
    if (wanted) {
      loadScenario(wanted);
    }
  });

  // Render & animation loop
  let frameCount = 0;
  function animate() {
    state.raf = globalThis.requestAnimationFrame(animate);

    if (!state.paused) {
      const stepsToRun = Math.max(1, Math.round(state.timeWarp));
      const subDt = (state.dt * state.timeDirection * state.timeWarp) / stepsToRun;
      for (let index = 0; index < stepsToRun; index++) {
        stepWorld(subDt);
      }
      for (let index = 0; index < state.world.bodies.length; index++) {
        if (!state.trails[index]) {
          state.trails[index] = [];
        }
        const body = state.world.bodies[index];
        state.trails[index].push({ x: body.x, y: body.y });
        if (state.trails[index].length > state.maxTrails) {
          state.trails[index].shift();
        }
      }
    }

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    let centerX = state.pan.x;
    let centerY = state.pan.y;
    if (state.trackingIndex >= 0 && state.trackingIndex < state.world.bodies.length) {
      centerX = state.world.bodies[state.trackingIndex].x + state.pan.x;
      centerY = state.world.bodies[state.trackingIndex].y + state.pan.y;
    }

    const viewSpan = state.scenario.span * state.zoom;
    const scale = Math.min(width, height) / viewSpan;
    const originX = width * 0.5;
    const originY = height * 0.5;

    function toScreen(x, y) {
      return {
        x: originX + (x - centerX) * scale,
        y: originY - (y - centerY) * scale,
      };
    }

    // Draw orbit trails
    for (let index = 0; index < state.world.bodies.length; index++) {
      const trail = state.trails[index];
      if (!trail || trail.length < 2) {
        continue;
      }
      const color = COLOR_PALETTE[state.world.bodies[index].color] || "#ffffff";

      if (state.dotStyle === "line") {
        context.beginPath();
        for (let point = 0; point < trail.length; point++) {
          const pt = toScreen(trail[point].x, trail[point].y);
          if (point === 0) {
            context.moveTo(pt.x, pt.y);
          } else {
            context.lineTo(pt.x, pt.y);
          }
        }
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.globalAlpha = 0.45;
        context.stroke();
        context.globalAlpha = 1.0;
      } else {
        context.fillStyle = color;
        context.strokeStyle = color;
        for (let point = 0; point < trail.length; point += 2) {
          const pt = toScreen(trail[point].x, trail[point].y);
          context.globalAlpha = 0.2 + 0.8 * (point / trail.length);
          context.beginPath();
          if (state.dotStyle === "circle" || state.dotStyle === "ring") {
            context.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            context.stroke();
          } else {
            context.arc(pt.x, pt.y, 2.0, 0, Math.PI * 2);
            context.fill();
          }
        }
        context.globalAlpha = 1.0;
      }
    }

    // Draw celestial bodies
    const fontFamily = typeof globalThis.getComputedStyle === "function" && document_.body
      ? globalThis.getComputedStyle(document_.body).fontFamily
      : "sans-serif";
    for (const body of state.world.bodies) {
      const pt = toScreen(body.x, body.y);
      const color = COLOR_PALETTE[body.color] || "#ffffff";

      // Glow halo
      const gradient = context.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, 14);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
      context.fill();

      // Body core
      context.fillStyle = color;
      context.beginPath();
      context.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      context.fill();

      // Name & symbol
      context.font = "11px " + fontFamily;
      context.fillStyle = "#ffffff";
      context.fillText(`${body.name} (${body.symbol})`, pt.x + 8, pt.y - 6);
    }

    // Update HUD metrics every 4 frames
    frameCount++;
    if (frameCount === 1) {
      // Live-page boot handshake: the first painted animation frame proves
      // the studio actually started (the AegeanWorks watchdog reads
      // body[data-screen] instead of guessing from the title).
      document_.body.dataset.screen = "studio";
    }
    if (frameCount % 4 === 0) {
      const world = state.world;
      el["time-readout"].textContent =
        `t = ${world.time.toFixed(2)} ${state.scenario.timeUnit}`;
      const kinetic = world.kineticEnergy();
      const potential = world.potentialEnergy();
      const total = kinetic + potential;
      const drift = state.initialEnergy !== 0.0
        ? (total - state.initialEnergy) / Math.abs(state.initialEnergy)
        : 0.0;
      state.driftHistory.push(drift);
      if (state.driftHistory.length > 80) {
        state.driftHistory.shift();
      }

      el["val-drift"].textContent = (drift >= 0 ? "+" : "") + drift.toExponential(2);
      el["val-virial"].textContent = (2.0 * kinetic + potential).toExponential(2);
      el["val-ke"].textContent = kinetic.toExponential(2);
      el["val-pe"].textContent = potential.toExponential(2);

      // Render the energy-drift sparkline
      energyContext.clearRect(0, 0, energyCanvas.width, energyCanvas.height);
      if (state.driftHistory.length > 1) {
        const chartWidth = energyCanvas.width;
        const chartHeight = energyCanvas.height;
        const minVal = Math.min(...state.driftHistory);
        const maxVal = Math.max(...state.driftHistory);
        const range = Math.max(1e-12, maxVal - minVal);
        energyContext.beginPath();
        for (let index = 0; index < state.driftHistory.length; index++) {
          const hx = (index / (state.driftHistory.length - 1)) * chartWidth;
          const hy = chartHeight
            - ((state.driftHistory[index] - minVal) / range) * (chartHeight - 8) - 4;
          if (index === 0) {
            energyContext.moveTo(hx, hy);
          } else {
            energyContext.lineTo(hx, hy);
          }
        }
        energyContext.strokeStyle = "#00e5ff";
        energyContext.lineWidth = 2.0;
        energyContext.stroke();
      }

      // Update the bodies table
      const tbody = el["bodies-tbody"];
      while (tbody.firstChild) {
        tbody.firstChild.remove();
      }
      for (const body of state.world.bodies) {
        const row = document_.createElement("tr");
        const speedCell = document_.createElement("td");
        const marker = document_.createElement("span");
        const color = COLOR_PALETTE[body.color] || "#ffffff";
        marker.setAttribute("style", `color: ${color}`);
        marker.textContent = "\u25CF " + body.name;
        const massCell = document_.createElement("td");
        massCell.textContent = body.mass.toExponential(1);
        const velocityCell = document_.createElement("td");
        velocityCell.textContent = Math.hypot(body.vx, body.vy).toFixed(2);
        const distanceCell = document_.createElement("td");
        distanceCell.textContent = Math.hypot(body.x, body.y).toFixed(2);
        speedCell.appendChild(marker);
        row.append(speedCell, massCell, velocityCell, distanceCell);
        tbody.appendChild(row);
      }
    }
  }

  globalThis.requestAnimationFrame(animate);
}
