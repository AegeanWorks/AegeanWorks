/**
 * Wall-clock time in any IANA zone, without a timezone library.
 *
 * Everything meridian knows about zones comes from the platform's Intl
 * database: offsets are read back from formatted parts and never hard-coded,
 * so daylight-saving transitions behave exactly as the host platform does.
 */

const MINUTE_MS = 60_000;

const formatters = new Map();

function partsFormatter(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function wallClockFor(instant, timeZone) {
  const parts = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

export function zoneOffsetMinutes(instant, timeZone) {
  const truncated = Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  const clock = wallClockFor(truncated, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
  return Math.round((asUtc - truncated) / MINUTE_MS);
}

export function utcForWallClock(dateISO, hour, minute, timeZone) {
  const parsed = parseDateISO(dateISO);
  if (!parsed) return null;
  const naive = Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute);
  const firstOffset = zoneOffsetMinutes(naive, timeZone);
  const candidateA = naive - firstOffset * MINUTE_MS;
  const secondOffset = zoneOffsetMinutes(candidateA, timeZone);
  const candidateB = naive - secondOffset * MINUTE_MS;
  const matchesA = wallAsNaive(candidateA, timeZone) === naive;
  const matchesB = wallAsNaive(candidateB, timeZone) === naive;
  if (matchesA && matchesB) return Math.min(candidateA, candidateB);
  if (matchesA) return candidateA;
  if (matchesB) return candidateB;
  return Math.max(candidateA, candidateB);
}

function wallAsNaive(instant, timeZone) {
  const clock = wallClockFor(instant, timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function currentZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(zone) ? zone : "UTC";
}

export function parseDateISO(dateISO) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function toDateISO(clock) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

export function localDateISO(instant, timeZone) {
  return toDateISO(wallClockFor(instant, timeZone));
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (value) => String(value).padStart(2, "0");
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function compareDateISO(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
