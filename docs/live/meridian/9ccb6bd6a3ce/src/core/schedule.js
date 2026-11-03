/**
 * The day plan: 24 reference-zone hours laid out against every participant's
 * local clock, with overlap columns, best windows and slot scoring.
 */

import { compareDateISO, toDateISO, utcForWallClock, wallClockFor } from "./time.js";

export const DAY_HOURS = 24;
export const DEFAULT_WORK = Object.freeze({ start: 9, end: 17 });
export const AWAKE = Object.freeze({ start: 7, end: 22 });
export const MAX_SLOT_HOURS = 24;

export function workOf(participant) {
  return {
    start: participant?.workStart ?? DEFAULT_WORK.start,
    end: participant?.workEnd ?? DEFAULT_WORK.end,
  };
}

export function isWorkHour(hour, work = DEFAULT_WORK) {
  const { start, end } = work;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function hourCategory(hour, work = DEFAULT_WORK) {
  if (isWorkHour(hour, work)) return "work";
  if (hour >= 22 || hour < 6) return "night";
  if (hour < 8) return "early";
  if (hour < 17) return "day";
  return "evening";
}

export function overlapColumns(rows) {
  const work = [];
  const awake = [];
  for (let index = 0; index < DAY_HOURS; index += 1) {
    let allWork = true;
    let allAwake = true;
    for (const row of rows) {
      const cell = row.cells[index];
      if (cell.category !== "work") allWork = false;
      if (cell.hour < AWAKE.start || cell.hour >= AWAKE.end) allAwake = false;
    }
    work.push(allWork);
    awake.push(allAwake);
  }
  return { work, awake };
}

export function bestWindows(flags) {
  const windows = [];
  let start = -1;
  for (let index = 0; index <= flags.length; index += 1) {
    if (index < flags.length && flags[index]) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      windows.push({ start, end: index, hours: index - start });
      start = -1;
    }
  }
  return windows.sort((a, b) => b.hours - a.hours || a.start - b.start);
}

export function buildDayPlan({ date, participants, referenceZone }) {
  const columns = [];
  for (let hour = 0; hour < DAY_HOURS; hour += 1) {
    columns.push({ hour, startUtc: utcForWallClock(date, hour, 0, referenceZone) });
  }
  const rows = participants.map((participant) => ({
    participant,
    cells: columns.map((column) => {
      const clock = wallClockFor(column.startUtc, participant.zone);
      return {
        hour: clock.hour,
        minute: clock.minute,
        dayOffset: compareDateISO(toDateISO(clock), date),
        category: hourCategory(clock.hour, workOf(participant)),
      };
    }),
  }));
  const overlap = overlapColumns(rows);
  return {
    date,
    referenceZone,
    columns,
    rows,
    overlap,
    windows: {
      work: bestWindows(overlap.work),
      awake: bestWindows(overlap.awake),
    },
  };
}

export function slotQuality(dayPlan, startColumn, hours) {
  const offenders = [];
  let allWork = true;
  let allAwake = true;
  const last = Math.min(DAY_HOURS - 1, startColumn + hours - 1);
  for (const row of dayPlan.rows) {
    let rowWork = true;
    let rowAwake = true;
    for (let index = startColumn; index <= last; index += 1) {
      const cell = row.cells[index];
      if (cell.category !== "work") rowWork = false;
      if (cell.hour < AWAKE.start || cell.hour >= AWAKE.end) rowAwake = false;
    }
    if (!rowWork) {
      allWork = false;
      offenders.push(row.participant.label);
    }
    if (!rowAwake) allAwake = false;
  }
  const level = allWork ? "work" : allAwake ? "awake" : "mixed";
  return { level, offenders };
}

export function slotSummary(dayPlan, startColumn, hours) {
  const startUtc = dayPlan.columns[startColumn].startUtc;
  const endUtc = startUtc + hours * 3_600_000;
  const rows = dayPlan.rows.map((row) => {
    const from = wallClockFor(startUtc, row.participant.zone);
    const to = wallClockFor(endUtc, row.participant.zone);
    return {
      id: row.participant.id,
      label: row.participant.label,
      zone: row.participant.zone,
      from: {
        hour: from.hour,
        minute: from.minute,
        dayOffset: compareDateISO(toDateISO(from), dayPlan.date),
      },
      to: {
        hour: to.hour,
        minute: to.minute,
        dayOffset: compareDateISO(toDateISO(to), dayPlan.date),
      },
    };
  });
  return { start: startColumn, startUtc, endUtc, hours, rows, quality: slotQuality(dayPlan, startColumn, hours) };
}

export function bestSlotFor(dayPlan, preferredHours) {
  const window = dayPlan.windows.work[0] ?? dayPlan.windows.awake[0];
  if (!window) return null;
  const hours = Math.max(1, Math.min(preferredHours, window.hours, MAX_SLOT_HOURS));
  return { start: window.start, hours };
}
