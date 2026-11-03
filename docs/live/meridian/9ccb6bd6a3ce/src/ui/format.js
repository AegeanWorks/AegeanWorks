/**
 * Presentation helpers: time text, day offsets, slot summaries and quality
 * wording. Pure functions so the Node test suite can check them directly.
 */

import { wallClockFor, utcForWallClock, zoneOffsetMinutes, formatOffset } from "../core/time.js";
import { zoneLabel } from "../core/zones.js";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CATEGORY_TEXT = Object.freeze({
  night: "night",
  early: "early morning",
  day: "daytime",
  work: "work hours",
  evening: "evening",
});

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function clockText({ hour, minute = 0 }) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function hourText(hour) {
  return `${pad2(hour)}:00`;
}

export function dayOffsetText(offset) {
  if (offset > 0) return `+${offset}d`;
  if (offset < 0) return `${offset}d`;
  return "";
}

export function offsetText(instant, zone) {
  return formatOffset(zoneOffsetMinutes(instant, zone));
}

export function weekdayOf(dateISO, zone) {
  const noon = utcForWallClock(dateISO, 12, 0, zone);
  if (noon === null) return "";
  return wallClockFor(noon, zone).weekday;
}

export function dateLabel(dateISO, zone) {
  const noon = utcForWallClock(dateISO, 12, 0, zone);
  if (noon === null) return dateISO;
  const clock = wallClockFor(noon, zone);
  const weekday = WEEKDAYS[new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay()];
  return `${weekday}, ${clock.day} ${MONTHS[clock.month - 1]} ${clock.year}`;
}

export function rangeText(slot) {
  return `${hourText(slot.start)}–${hourText(slot.start + slot.hours)}`;
}

export function qualityText(quality) {
  if (quality.level === "work") return "Everyone inside work hours";
  if (quality.level === "awake") return "Everyone awake, outside work hours";
  return "Someone would be asleep";
}

export function qualityShort(quality) {
  if (quality.level === "work") return "All in work hours";
  if (quality.level === "awake") return "All awake";
  return "Some asleep";
}

export function summaryLines(slot) {
  return slot.rows.map((row) => {
    const from = `${clockText(row.from)}${row.from.dayOffset ? ` ${dayOffsetText(row.from.dayOffset)}` : ""}`;
    const to = `${clockText(row.to)}${row.to.dayOffset ? ` ${dayOffsetText(row.to.dayOffset)}` : ""}`;
    return `${row.label} (${zoneLabel(row.zone)}) ${from}–${to}`;
  });
}

export function slotTitle(plan, slot) {
  return `Meeting · ${dateLabel(plan.date, plan.referenceZone)} · ${rangeText(slot)} ${zoneLabel(plan.referenceZone)}`;
}

export function summaryText(plan, slot) {
  return [slotTitle(plan, slot), ...summaryLines(slot)].join("\n");
}
