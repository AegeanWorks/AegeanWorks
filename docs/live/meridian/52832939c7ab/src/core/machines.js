/**
 * The explicit contract for Meridian's state machines: states, initial state,
 * allowed transitions and the live source. Read-only data; tests keep it equal
 * to the runtime vocabularies and the UI exposes it as `meridian.machines`.
 */

import { STATE_VERSION } from "./state.js";

const DEFINITIONS = {
  "plan-version": {
    title: "Plan schema version",
    states: ["missing", "current", "unsupported"],
    initial: "missing",
    transitions: {
      missing: ["current", "unsupported"],
      current: [],
      unsupported: [],
    },
    current: STATE_VERSION,
    source: "src/core/state.js normalizePlan/decodePlan",
  },
  "hash-read": {
    title: "Share-hash read outcome",
    states: ["empty", "valid", "invalid"],
    initial: "empty",
    transitions: {
      empty: ["valid", "invalid"],
      valid: ["empty", "invalid"],
      invalid: ["empty", "valid"],
    },
    source: "src/core/state.js readShareHash; src/ui/main.js init/hashchange",
  },
  "plan-mutation": {
    title: "Plan mutation source",
    states: ["default", "decoded", "edited"],
    initial: "default",
    transitions: {
      default: ["decoded", "edited"],
      decoded: ["default", "edited"],
      edited: ["default", "decoded"],
    },
    source: "src/ui/main.js applyPlan/resetPlan/init",
  },
  "url-sync": {
    title: "URL fragment ownership",
    states: ["clean", "dirty", "foreign"],
    initial: "clean",
    transitions: {
      clean: ["dirty", "foreign"],
      dirty: ["clean", "foreign"],
      foreign: ["clean", "dirty"],
    },
    source: "src/ui/main.js writeHash; index.html skip link",
  },
  slot: {
    title: "Selected slot",
    states: ["none", "selected"],
    initial: "none",
    transitions: {
      none: ["selected"],
      selected: ["none", "selected"],
    },
    source: "src/core/schedule.js normalizeSlot; src/ui/main.js setSlot",
  },
  duration: {
    title: "Meeting length preference",
    states: ["preset", "custom"],
    initial: "preset",
    transitions: {
      preset: ["preset", "custom"],
      custom: ["preset", "custom"],
    },
    source: "src/core/schedule.js normalizeDuration/nextDuration; src/ui/main.js syncDuration",
  },
  participants: {
    title: "Participant set",
    states: ["single", "plural", "full"],
    initial: "single",
    transitions: {
      single: ["single", "plural"],
      plural: ["single", "plural", "full"],
      full: ["full", "plural"],
    },
    source: "src/ui/main.js addParticipant/removeParticipant/resetPlan",
  },
  zone: {
    title: "Zone input validity",
    states: ["candidate", "valid", "invalid"],
    initial: "candidate",
    transitions: {
      candidate: ["valid", "invalid"],
      valid: ["candidate"],
      invalid: ["candidate"],
    },
    source: "src/core/zones.js canonicalZone; src/ui/main.js setters",
  },
  "work-day": {
    title: "Work-day shape",
    states: ["open", "zero-length", "wrap-around"],
    initial: "open",
    transitions: {
      open: ["open", "zero-length", "wrap-around"],
      "zero-length": ["open", "wrap-around"],
      "wrap-around": ["open", "zero-length"],
    },
    source: "src/core/schedule.js isWorkHour; src/core/state.js normalizeWorkHour",
  },
  "cell-category": {
    title: "Cell hour category",
    states: ["night", "early", "day", "work", "evening"],
    initial: "night",
    transitions: {},
    source: "src/core/schedule.js hourCategory",
  },
  "overlap-band": {
    title: "Column overlap band",
    states: ["work", "awake", "none"],
    initial: "none",
    transitions: {},
    source: "src/core/schedule.js overlapColumns",
  },
  "slot-quality": {
    title: "Slot quality",
    states: ["work", "awake", "mixed"],
    initial: "mixed",
    transitions: {},
    source: "src/core/schedule.js slotQuality",
  },
  "best-slot": {
    title: "Best-slot outcome",
    states: ["work", "awake", "none"],
    initial: "none",
    transitions: {},
    source: "src/core/schedule.js bestSlotFor",
  },
  "zone-catalog": {
    title: "Zone catalog source",
    states: ["platform", "curated"],
    initial: "platform",
    transitions: {
      platform: ["curated"],
      curated: ["platform"],
    },
    source: "src/core/zones.js allTimeZones",
  },
  drag: {
    title: "Grid drag gesture",
    states: ["idle", "dragging"],
    initial: "idle",
    transitions: {
      idle: ["dragging"],
      dragging: ["idle"],
    },
    source: "src/ui/grid.js pointer handlers",
  },
  clock: {
    title: "Live clock and now marker",
    states: ["ticking", "today", "other-day"],
    initial: "ticking",
    transitions: {
      ticking: ["today", "other-day"],
      today: ["today", "other-day"],
      "other-day": ["today", "other-day"],
    },
    source: "src/ui/grid.js updateNow; src/ui/main.js timer",
  },
  toast: {
    title: "Status toast",
    states: ["idle", "ok", "error"],
    initial: "idle",
    transitions: {
      idle: ["ok", "error"],
      ok: ["idle", "ok", "error"],
      error: ["idle", "ok", "error"],
    },
    source: "src/ui/main.js say",
  },
  "calendar-action": {
    title: "Calendar action availability",
    states: ["disabled", "enabled"],
    initial: "disabled",
    transitions: {
      disabled: ["enabled"],
      enabled: ["disabled", "enabled"],
    },
    source: "src/ui/main.js paintSummary",
  },
  clipboard: {
    title: "Clipboard outcome",
    states: ["pending", "copied", "failed"],
    initial: "pending",
    transitions: {
      pending: ["copied", "failed"],
      copied: ["pending"],
      failed: ["pending"],
    },
    source: "src/ui/clipboard.js copyText",
  },
  request: {
    title: "HTTP request outcome",
    states: ["served", "not-found", "method-not-allowed", "traversal-refused"],
    initial: "served",
    transitions: {},
    source: "scripts/serve.mjs safePath/handle",
  },
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export const MACHINES = deepFreeze(
  Object.fromEntries(
    Object.entries(DEFINITIONS).map(([name, definition]) => [name, { name, ...definition }]),
  ),
);

export const MACHINE_NAMES = deepFreeze(Object.keys(MACHINES));

export function canTransition(name, from, to) {
  const machine = MACHINES[name];
  if (!machine) throw new RangeError(`unknown machine: ${name}`);
  const targets = machine.transitions[from];
  return Array.isArray(targets) ? targets.includes(to) : false;
}
