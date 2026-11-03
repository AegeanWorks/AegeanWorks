/**
 * Plan state: what meridian remembers, normalized from any input, plus its
 * compact encoding in the URL hash so a shared link rebuilds the same plan.
 */

import { currentZone, isValidTimeZone, localDateISO, parseDateISO } from "./time.js";
import { DEFAULT_WORK } from "./schedule.js";
import { zoneLabel } from "./zones.js";

export const STATE_VERSION = 1;
export const MAX_PARTICIPANTS = 12;
export const LABEL_MAX = 40;
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

function clampHour(value, fallback) {
  const parsed = Number(value);
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
  const zone = isValidTimeZone(raw.zone) ? raw.zone : null;
  if (!zone) return null;
  const label = String(raw.label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
  return {
    id: assignId(raw, index, used),
    label: label || zoneLabel(zone),
    zone,
    workStart: clampHour(raw.workStart, DEFAULT_WORK.start),
    workEnd: clampHour(raw.workEnd, DEFAULT_WORK.end),
  };
}

export function normalizePlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!parseDateISO(raw.date)) return null;
  if (!isValidTimeZone(raw.referenceZone)) return null;
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
    referenceZone: raw.referenceZone,
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
  return normalizePlan({ date: payload?.d, referenceZone: payload?.r, participants: entries });
}

export const DEFAULT_GUEST_ZONES = Object.freeze([
  "America/New_York",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/Los_Angeles",
  "Asia/Singapore",
]);

export function defaultPlan(now = Date.now(), zone = currentZone()) {
  const referenceZone = isValidTimeZone(zone) ? zone : "UTC";
  const guestZone = DEFAULT_GUEST_ZONES.find((candidate) => candidate !== referenceZone);
  const participants = [{ label: "You", zone: referenceZone }];
  if (guestZone) participants.push({ label: zoneLabel(guestZone), zone: guestZone });
  return normalizePlan({
    date: localDateISO(now, referenceZone),
    referenceZone,
    participants,
  });
}

export function planEquals(a, b) {
  return encodePlan(a) === encodePlan(b);
}

export function shareUrl(plan, base) {
  return `${String(base ?? "").split("#")[0]}${encodePlan(plan)}`;
}
