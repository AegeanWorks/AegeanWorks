/**
 * Plan state: what meridian remembers, normalized from any input, plus its
 * compact encoding in the URL hash so a shared link rebuilds the same plan.
 */

import { currentZone, localDateISO, parseDateISO } from "./time.js";
import { DEFAULT_WORK, buildDayPlan } from "./schedule.js";
import { canonicalZone, zoneLabel } from "./zones.js";

export const STATE_VERSION = 1;
export const MAX_PARTICIPANTS = 12;
export const LABEL_MAX = 40;
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

export function normalizeWorkHour(value, fallback) {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) return fallback;
  return parsed;
}

function assignId(raw, index, used) {
  const candidate =
    typeof raw?.id === "string" && ID_PATTERN.test(raw.id) ? raw.id : `p${index + 1}`;
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let suffix = 2;
  while (used.has(`${candidate}-${suffix}`)) suffix += 1;
  const id = `${candidate}-${suffix}`;
  used.add(id);
  return id;
}

export function normalizeParticipant(raw, index, used) {
  if (!raw || typeof raw !== "object") return null;
  const zone = canonicalZone(raw.zone);
  if (!zone) return null;
  const label = String(raw.label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
  return {
    id: assignId(raw, index, used),
    label: label || zoneLabel(zone),
    zone,
    workStart: normalizeWorkHour(raw.workStart, DEFAULT_WORK.start),
    workEnd: normalizeWorkHour(raw.workEnd, DEFAULT_WORK.end),
  };
}

export function normalizePlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== undefined && raw.version !== STATE_VERSION) return null;
  if (!parseDateISO(raw.date)) return null;
  const referenceZone = canonicalZone(raw.referenceZone);
  if (!referenceZone) return null;
  const used = new Set();
  const participants = [];
  const entries = Array.isArray(raw.participants) ? raw.participants : [];
  for (const entry of entries) {
    if (participants.length >= MAX_PARTICIPANTS) break;
    const participant = normalizeParticipant(entry, participants.length, used);
    if (participant) participants.push(participant);
  }
  if (!participants.length) return null;
  return {
    version: STATE_VERSION,
    date: raw.date,
    referenceZone,
    participants,
  };
}

function planPayload(plan) {
  return {
    v: STATE_VERSION,
    d: plan.date,
    r: plan.referenceZone,
    p: plan.participants.map((participant) => [
      participant.label,
      participant.zone,
      participant.workStart,
      participant.workEnd,
    ]),
  };
}

export function encodePlan(plan) {
  return `#p=${encodeURIComponent(JSON.stringify(planPayload(plan)))}`;
}

export function decodePlan(hash) {
  const match = /[#&]p=([^&]*)/.exec(String(hash ?? ""));
  if (!match) return null;
  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
  const entries = Array.isArray(payload?.p)
    ? payload.p.map((entry) =>
        Array.isArray(entry)
          ? { label: entry[0], zone: entry[1], workStart: entry[2], workEnd: entry[3] }
          : entry,
      )
    : [];
  return normalizePlan({
    version: payload?.v,
    date: payload?.d,
    referenceZone: payload?.r,
    participants: entries,
  });
}

export const HASH_STATUS = Object.freeze({
  EMPTY: "empty",
  VALID: "valid",
  INVALID: "invalid",
});

export function readShareHash(hash) {
  const text = String(hash ?? "");
  if (!/[#&]p=/.test(text)) return { status: HASH_STATUS.EMPTY, plan: null };
  const plan = decodePlan(text);
  return plan
    ? { status: HASH_STATUS.VALID, plan }
    : { status: HASH_STATUS.INVALID, plan: null };
}

export const DEFAULT_GUEST_ZONES = Object.freeze([
  "America/New_York",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/Los_Angeles",
  "Asia/Singapore",
]);

function guestZoneFor(referenceZone, date) {
  let guestZone = null;
  let bestRank = -1;
  for (const candidate of DEFAULT_GUEST_ZONES) {
    if (candidate === referenceZone) continue;
    const day = buildDayPlan({
      date,
      referenceZone,
      participants: [
        { id: "p1", label: "You", zone: referenceZone },
        { id: "p2", label: zoneLabel(candidate), zone: candidate },
      ],
    });
    const rank = day.windows.work.length ? 2 : day.windows.awake.length ? 1 : 0;
    if (rank > bestRank) {
      bestRank = rank;
      guestZone = candidate;
    }
    if (rank === 2) break;
  }
  return guestZone;
}

export function defaultPlan(now = Date.now(), zone = currentZone()) {
  const referenceZone = canonicalZone(zone) ?? "UTC";
  const date = localDateISO(now, referenceZone);
  const guestZone = guestZoneFor(referenceZone, date);
  const participants = [{ label: "You", zone: referenceZone }];
  if (guestZone) participants.push({ label: zoneLabel(guestZone), zone: guestZone });
  return normalizePlan({ date, referenceZone, participants });
}

export function planEquals(a, b) {
  return encodePlan(a) === encodePlan(b);
}

export function shareUrl(plan, base) {
  return `${String(base ?? "").split("#")[0]}${encodePlan(plan)}`;
}
