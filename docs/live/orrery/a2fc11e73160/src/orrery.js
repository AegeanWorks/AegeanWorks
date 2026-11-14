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
};

/* ------------------------------------------------------------------ */
/* Studio: only boots inside a document                                */
/* ------------------------------------------------------------------ */

if (typeof document !== "undefined") {
  bootStudio(document);
}

function bootStudio(document_) {
  const scenarios = loadScenarios(globalThis.ORRERY_SCENARIOS);
  const canvas = document_.getElementById("stage");
  const context = canvas.getContext("2d");

  const elements = {
    scenario: document_.getElementById("scenario"),
    play: document_.getElementById("play"),
    step: document_.getElementById("step"),
    reset: document_.getElementById("reset"),
    speed: document_.getElementById("speed"),
    speedLabel: document_.getElementById("speed-label"),
    relativity: document_.getElementById("relativity"),
    cLight: document_.getElementById("c-light"),
    kCoulomb: document_.getElementById("k-coulomb"),
    merge: document_.getElementById("merge"),
    mergeRadius: document_.getElementById("merge-radius"),
    bounce: document_.getElementById("bounce"),
    bounceRadius: document_.getElementById("bounce-radius"),
    restitution: document_.getElementById("restitution"),
    telemetry: document_.getElementById("telemetry"),
    units: document_.getElementById("units"),
    description: document_.getElementById("description"),
    events: document_.getElementById("events"),
    trails: document_.getElementById("trails"),
    trailLength: document_.getElementById("trail-length"),
  };

  const state = {
    scenario: null,
    world: null,
    trails: new Map(),
    playing: false,
    speed: 1.0,
    energy0: 0.0,
    totalSteps: 0,
    raf: 0,
  };

  function resetWorld() {
    const option = state.scenario;
    let useC = null;
    if (elements.relativity.checked) {
      const cValue = elements.cLight.value.trim();
      const cOver = cValue === "" ? null : Number(cValue);
      useC = (cOver !== null && Number.isFinite(cOver) && cOver > 0.0) ? cOver : option.c;
    }
    const kValue = elements.kCoulomb.value.trim();
    const kOver = kValue === "" ? null : Number(kValue);
    const useK = (kOver !== null && Number.isFinite(kOver) && kOver >= 0.0) ? kOver : option.k_e;
    state.world = new World(option.bodies, option.g, { c: useC, k_e: useK });
    state.trails = new Map(option.bodies.map((body) => [body.name, []]));
    state.energy0 = state.world.totalEnergy();
    logEvent(`loaded ${option.key} (t = 0)`);
  }

  function logEvent(message) {
    const row = document_.createElement("li");
    row.textContent = message;
    elements.events.prepend(row);
    while (elements.events.childElementCount > 6) {
      elements.events.lastChild.remove();
    }
  }

  function selectScenario(key) {
    const fresh = !state.scenario || state.scenario.key !== key;
    state.scenario = scenarios.find((option) => option.key === key) || scenarios[0];
    elements.description.textContent = state.scenario.description;
    elements.units.textContent =
      `dt = ${state.scenario.dt} ${state.scenario.timeUnit} · ` +
      `span = ${state.scenario.span} ${state.scenario.distanceUnit} · ` +
      `speeds in ${state.scenario.speedUnit}`;
    if (fresh) {
      // Default the physics inputs from the scenario only on a scenario
      // switch; a restart must keep the user's own toggles intact.
      elements.relativity.checked = state.scenario.c !== null;
      elements.cLight.value = state.scenario.c === null ? "" : String(state.scenario.c);
      elements.kCoulomb.value = String(state.scenario.k_e);
      elements.trailLength.value = String(Math.min(state.scenario.trailLength, 4000));
    }
    resetWorld();
    draw();
  }

  function worldToScreen(width, height) {
    const [ex, ey] = state.scenario.extent;
    const scale = Math.min(width / (2 * ex), height / (2 * ey));
    const offsetX = width / 2;
    const offsetY = height / 2;
    return (x, y) => [offsetX + x * scale, offsetY - y * scale];
  }

  function draw() {
    const ratio = globalThis.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0b1220");
    gradient.addColorStop(1, "#06060b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (!state.world) {
      return;
    }
    const project = worldToScreen(width, height);
    if (elements.trails.checked) {
      context.lineWidth = 1;
      context.globalAlpha = 0.4;
      for (const body of state.world.bodies) {
        const trail = state.trails.get(body.name);
        if (!trail || trail.length < 2) {
          continue;
        }
        context.strokeStyle = body.color;
        context.beginPath();
        const [sx, sy] = project(trail[0][0], trail[0][1]);
        context.moveTo(sx, sy);
        for (let index = 1; index < trail.length; index++) {
          const [tx, ty] = project(trail[index][0], trail[index][1]);
          context.lineTo(tx, ty);
        }
        context.stroke();
      }
      context.globalAlpha = 1.0;
    }
    const maxMass = Math.max(...state.world.bodies.map((body) => body.mass));
    for (const body of state.world.bodies) {
      const [sx, sy] = project(body.x, body.y);
      const radius = 2.5 + 8.0 * Math.sqrt(body.mass / maxMass);
      context.beginPath();
      context.arc(sx, sy, radius, 0, 2 * Math.PI);
      context.fillStyle = body.color;
      context.fill();
    }
    telemetry();
  }

  function telemetry() {
    const world = state.world;
    const drift = world.energyDrift(state.energy0);
    const format = (value) => {
      if (!Number.isFinite(value)) {
        return String(value);
      }
      const magnitude = Math.abs(value);
      if (magnitude !== 0.0 && (magnitude < 1e-3 || magnitude >= 1e6)) {
        return value.toExponential(4);
      }
      return value.toFixed(Math.max(0, 6 - Math.floor(Math.log10(magnitude || 1))));
    };
    const lNorm = world.momentum();
    const rows = [
      `t = ${format(world.time)} ${state.scenario.timeUnit}`,
      `bodies = ${world.bodies.length}`,
      `E = ${format(world.totalEnergy())}`,
      `dE/E = ${format(drift)}`,
      `|p| = ${format(Math.hypot(lNorm.x, lNorm.y))}`,
      `L = ${format(world.angularMomentum())}`,
    ];
    const cLabel = world.c === null ? "Newtonian" : `1PN (c = ${world.c})`;
    rows.push(cLabel);
    elements.telemetry.textContent = rows.join("  ·  ");
  }

  function recordTrails(stepCount) {
    if (!elements.trails.checked) {
      return;
    }
    const every = state.scenario.recordEvery;
    if (stepCount % every !== 0) {
      return;
    }
    const limit = Number(elements.trailLength.value) || state.scenario.trailLength;
    for (const body of state.world.bodies) {
      let trail = state.trails.get(body.name);
      if (!trail) {
        trail = [];
        state.trails.set(body.name, trail);
      }
      trail.push([body.x, body.y]);
      if (trail.length > limit) {
        trail.splice(0, trail.length - limit);
      }
    }
  }

  function tick() {
    if (!state.playing || !state.world) {
      return;
    }
    const steps = Math.max(1, Math.round(state.scenario.stepsPerFrame * state.speed));
    const baseStep = state.totalSteps;
    for (let index = 0; index < steps; index++) {
      state.world.step(state.scenario.dt);
      state.totalSteps = baseStep + index + 1;
      recordTrails(state.totalSteps);
      const mergeRadius = elements.merge.checked ? Number(elements.mergeRadius.value) : 0.0;
      const bounceRadius = elements.bounce.checked ? Number(elements.bounceRadius.value) : 0.0;
      const restitution = Number(elements.restitution.value);
      if (mergeRadius > 0.0) {
        for (const event of state.world.resolveCollisions(mergeRadius)) {
          logEvent(event);
        }
      }
      if (bounceRadius > 0.0) {
        for (const event of state.world.resolveElasticCollisions(bounceRadius, restitution)) {
          logEvent(event);
        }
      }
    }
    draw();
    state.raf = requestAnimationFrame(tick);
  }

  function setPlaying(next) {
    state.playing = next;
    elements.play.textContent = next ? "Pause" : "Play";
    if (next) {
      state.raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(state.raf);
    }
  }

  for (const option of scenarios) {
    const item = document_.createElement("option");
    item.value = option.key;
    item.textContent = option.title;
    elements.scenario.append(item);
  }

  elements.scenario.addEventListener("change", () => {
    setPlaying(false);
    selectScenario(elements.scenario.value);
  });
  elements.play.addEventListener("click", () => setPlaying(!state.playing));
  elements.step.addEventListener("click", () => {
    setPlaying(false);
    if (state.world) {
      state.world.step(state.scenario.dt);
      state.totalSteps += 1;
      recordTrails(state.totalSteps);
      draw();
    }
  });
  elements.reset.addEventListener("click", () => {
    setPlaying(false);
    selectScenario(elements.scenario.value);
  });
  elements.speed.addEventListener("input", () => {
    state.speed = Number(elements.speed.value);
    elements.speedLabel.textContent = `${state.speed.toFixed(2)}x`;
  });
  elements.relativity.addEventListener("change", () => {
    setPlaying(false);
    selectScenario(elements.scenario.value);
  });
  elements.merge.addEventListener("change", () => {
    elements.mergeRadius.disabled = !elements.merge.checked;
  });
  elements.bounce.addEventListener("change", () => {
    elements.bounceRadius.disabled = !elements.bounce.checked;
    elements.restitution.disabled = !elements.bounce.checked;
  });
  [elements.cLight, elements.kCoulomb, elements.restitution].forEach((input) => {
    input.addEventListener("change", () => {
      setPlaying(false);
      selectScenario(elements.scenario.value);
    });
  });
  globalThis.addEventListener("resize", draw);

  selectScenario(scenarioFromKeyOrFirst(scenarios));
  setPlaying(true);
}

function scenarioFromKeyOrFirst(scenarios) {
  const wanted = new URLSearchParams(location.search).get("world");
  return (wanted && scenarios.find((option) => option.key === wanted))
    ? wanted
    : scenarios[0].key;
}
