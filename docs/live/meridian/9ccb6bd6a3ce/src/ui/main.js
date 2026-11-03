/**
 * Meridian bootstrap: owns the plan and the chosen slot, wires every control
 * to the core modules and keeps the URL hash in step with the plan.
 */

import { buildIcsCalendar } from "../core/ics.js";
import { bestSlotFor, buildDayPlan, slotSummary } from "../core/schedule.js";
import {
  LABEL_MAX,
  MAX_PARTICIPANTS,
  decodePlan,
  defaultPlan,
  encodePlan,
  planEquals,
  shareUrl,
} from "../core/state.js";
import { isValidTimeZone, localDateISO } from "../core/time.js";
import { allTimeZones, zoneLabel } from "../core/zones.js";
import { copyText } from "./clipboard.js";
import { dateLabel, pad2, qualityShort, rangeText, summaryLines, summaryText } from "./format.js";
import { createGrid } from "./grid.js";
import { createPanel } from "./panel.js";
import { el } from "./dom.js";

const byId = (id) => document.getElementById(id);

const ui = {
  datePrev: byId("date-prev"),
  dateNext: byId("date-next"),
  dateToday: byId("date-today"),
  dateInput: byId("date-input"),
  dateHeading: byId("date-heading"),
  referenceZone: byId("reference-zone"),
  zoneList: byId("zone-list"),
  addLabel: byId("participant-label"),
  addZone: byId("participant-zone"),
  addStart: byId("participant-start"),
  addEnd: byId("participant-end"),
  addButton: byId("participant-add"),
  planReset: byId("plan-reset"),
  participants: byId("participants"),
  grid: byId("grid"),
  duration: byId("duration"),
  bestSlot: byId("best-slot"),
  copyLink: byId("copy-link"),
  downloadIcs: byId("download-ics"),
  copySummary: byId("copy-summary"),
  summary: byId("summary"),
  summaryBadge: byId("summary-badge"),
  summaryTitle: byId("summary-title"),
  summaryLines: byId("summary-lines"),
  status: byId("status"),
};

const state = {
  plan: null,
  slot: null,
  slotData: null,
  duration: 1,
};

let dayPlan = null;
let grid = null;
let panel = null;
let statusTimer = 0;

function say(message, tone = "ok") {
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    ui.status.textContent = "";
    delete ui.status.dataset.tone;
  }, 4000);
}

function writeHash() {
  const next = encodePlan(state.plan);
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", next);
  }
}

function dateStep(dateISO, delta) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function nextParticipantId(plan) {
  const used = new Set(plan.participants.map((participant) => participant.id));
  for (let index = 1; index <= MAX_PARTICIPANTS; index += 1) {
    const candidate = `p${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `p${Date.now().toString(36)}`;
}

function clampSlot() {
  if (!state.slot) return;
  const start = Math.max(0, Math.min(23, state.slot.start));
  const hours = Math.max(1, state.slot.hours);
  state.slot = { start, hours: Math.min(hours, 24 - start) };
}

function syncDuration() {
  for (const option of ui.duration.querySelectorAll("option[data-custom]")) option.remove();
  const value = String(state.duration);
  if (![...ui.duration.options].some((option) => option.value === value)) {
    const option = el("option", "", `${value} h`);
    option.value = value;
    option.dataset.custom = "1";
    ui.duration.append(option);
  }
  ui.duration.value = value;
}

function paintSummary() {
  if (!state.slot) {
    state.slotData = null;
    ui.summary.hidden = true;
    ui.downloadIcs.disabled = true;
    ui.copySummary.disabled = true;
    return;
  }
  const slot = slotSummary(dayPlan, state.slot.start, state.slot.hours);
  state.slotData = slot;
  ui.summary.hidden = false;
  ui.downloadIcs.disabled = false;
  ui.copySummary.disabled = false;
  ui.summaryBadge.textContent = qualityShort(slot.quality);
  ui.summaryBadge.dataset.level = slot.quality.level;
  ui.summaryTitle.textContent =
    `${dateLabel(state.plan.date, state.plan.referenceZone)} · ` +
    `${rangeText(state.slot)} ${zoneLabel(state.plan.referenceZone)}`;
  ui.summaryLines.replaceChildren(
    ...summaryLines(slot).map((line) => el("li", "", line)),
  );
}

function syncControls() {
  ui.dateInput.value = state.plan.date;
  ui.referenceZone.value = state.plan.referenceZone;
  ui.dateHeading.textContent = dateLabel(state.plan.date, state.plan.referenceZone);
  syncDuration();
  ui.addButton.disabled = state.plan.participants.length >= MAX_PARTICIPANTS;
  ui.addButton.textContent =
    state.plan.participants.length >= MAX_PARTICIPANTS
      ? `${MAX_PARTICIPANTS} people is the limit`
      : "Add person";
}

function applyPlan(next, { hash = true } = {}) {
  state.plan = next;
  dayPlan = buildDayPlan(next);
  clampSlot();
  panel.render(next);
  grid.render(dayPlan);
  grid.select(state.slot);
  paintSummary();
  syncControls();
  if (hash) writeHash();
}

function setSlot(slot) {
  state.slot = slot;
  clampSlot();
  if (state.slot && state.slot.hours !== state.duration && state.slot.hours <= 12) {
    state.duration = state.slot.hours;
  }
  syncDuration();
  grid.select(state.slot);
  paintSummary();
}

function changeParticipant(id, patch) {
  const target = state.plan.participants.find((participant) => participant.id === id);
  if (!target) return;
  const updated = { ...target };
  if ("label" in patch) {
    const label = String(patch.label ?? "").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
    updated.label = label || zoneLabel(updated.zone);
  }
  if ("zone" in patch) {
    const zone = String(patch.zone ?? "").trim();
    if (!isValidTimeZone(zone)) {
      say(`"${zone}" is not a known time zone; the previous zone is kept.`, "error");
      panel.render(state.plan);
      return;
    }
    updated.zone = zone;
  }
  if ("workStart" in patch) updated.workStart = Number(patch.workStart);
  if ("workEnd" in patch) updated.workEnd = Number(patch.workEnd);
  const participants = state.plan.participants.map((participant) =>
    participant.id === id ? updated : participant,
  );
  applyPlan({ ...state.plan, participants });
}

function removeParticipant(id) {
  if (state.plan.participants.length === 1) {
    say("Keep at least one participant, or press Reset.", "error");
    return;
  }
  const participants = state.plan.participants.filter((participant) => participant.id !== id);
  applyPlan({ ...state.plan, participants });
}

function addParticipant(entry) {
  if (state.plan.participants.length >= MAX_PARTICIPANTS) {
    say(`A plan holds at most ${MAX_PARTICIPANTS} people.`, "error");
    return false;
  }
  const zone = String(entry.zone ?? "").trim();
  if (!isValidTimeZone(zone)) {
    say(`"${zone}" is not a known time zone.`, "error");
    return false;
  }
  const label =
    String(entry.label ?? "").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX) || zoneLabel(zone);
  const participant = {
    id: nextParticipantId(state.plan),
    label,
    zone,
    workStart: Number.isInteger(entry.workStart) ? entry.workStart : 9,
    workEnd: Number.isInteger(entry.workEnd) ? entry.workEnd : 17,
  };
  applyPlan({ ...state.plan, participants: [...state.plan.participants, participant] });
  say(`${label} added.`);
  return true;
}

function resetPlan() {
  state.slot = null;
  applyPlan(defaultPlan(Date.now(), state.plan.referenceZone));
  say("Plan reset to the example for today.");
}

function setDate(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO))) return false;
  applyPlan({ ...state.plan, date: dateISO });
  return true;
}

function setReferenceZone(zone) {
  const value = String(zone ?? "").trim();
  if (!isValidTimeZone(value)) {
    say(`"${value}" is not a known time zone; the previous zone is kept.`, "error");
    syncControls();
    return false;
  }
  applyPlan({ ...state.plan, referenceZone: value });
  return true;
}

function downloadIcs() {
  if (!state.slotData) return;
  const slot = state.slotData;
  const text = buildIcsCalendar({
    summary: `${dateLabel(state.plan.date, state.plan.referenceZone)} · ${rangeText(state.slot)} ${zoneLabel(state.plan.referenceZone)}`,
    description: summaryLines(slot).join("\n"),
    startUtc: slot.startUtc,
    endUtc: slot.endUtc,
  });
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meridian-${state.plan.date}-${pad2(state.slot.start)}00.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  say("Calendar file downloaded.");
}

function fillHourSelect(select, value) {
  for (let hour = 0; hour < 24; hour += 1) {
    const option = el("option", "", `${pad2(hour)}:00`);
    option.value = String(hour);
    if (hour === value) option.selected = true;
    select.append(option);
  }
}

function bindEvents() {
  ui.datePrev.addEventListener("click", () => setDate(dateStep(state.plan.date, -1)));
  ui.dateNext.addEventListener("click", () => setDate(dateStep(state.plan.date, 1)));
  ui.dateToday.addEventListener("click", () =>
    setDate(localDateISO(Date.now(), state.plan.referenceZone)),
  );
  ui.dateInput.addEventListener("change", () => {
    if (!setDate(ui.dateInput.value)) {
      say("That date could not be read.", "error");
      syncControls();
    }
  });
  ui.referenceZone.addEventListener("change", () => setReferenceZone(ui.referenceZone.value));

  ui.addButton.addEventListener("click", () => {
    const added = addParticipant({
      label: ui.addLabel.value,
      zone: ui.addZone.value,
      workStart: Number(ui.addStart.value),
      workEnd: Number(ui.addEnd.value),
    });
    if (added) {
      ui.addLabel.value = "";
      ui.addLabel.focus();
    }
  });
  for (const input of [ui.addLabel, ui.addZone]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") ui.addButton.click();
    });
  }

  ui.planReset.addEventListener("click", resetPlan);

  ui.duration.addEventListener("change", () => {
    state.duration = Number(ui.duration.value) || 1;
    if (state.slot) setSlot({ start: state.slot.start, hours: state.duration });
  });

  ui.bestSlot.addEventListener("click", () => {
    const best = bestSlotFor(dayPlan, state.duration);
    if (!best) {
      say("No hour works for everyone on this date; try the next day.", "error");
      return;
    }
    setSlot(best);
    grid.scrollToColumn(best.start);
    say(
      dayPlan.windows.work.length
        ? "Best shared work window selected."
        : "No shared work window; the best shared awake window is selected.",
    );
  });

  ui.copyLink.addEventListener("click", async () => {
    writeHash();
    const ok = await copyText(shareUrl(state.plan, window.location.href));
    say(ok ? "Share link copied." : "Copy failed; select the address bar instead.", ok ? "ok" : "error");
  });

  ui.copySummary.addEventListener("click", async () => {
    if (!state.slotData) return;
    const ok = await copyText(summaryText(state.plan, state.slotData));
    say(ok ? "Summary copied." : "Copy failed.", ok ? "ok" : "error");
  });

  ui.downloadIcs.addEventListener("click", downloadIcs);

  window.addEventListener("hashchange", () => {
    const plan = decodePlan(window.location.hash);
    if (plan && !planEquals(plan, state.plan)) applyPlan(plan, { hash: false });
  });

  window.addEventListener("resize", () => grid.updateNow(Date.now()));
}

function init() {
  const zones = allTimeZones();
  ui.zoneList.replaceChildren(
    ...zones.map((zone) => {
      const option = document.createElement("option");
      option.value = zone;
      option.label = zoneLabel(zone);
      return option;
    }),
  );
  fillHourSelect(ui.addStart, 9);
  fillHourSelect(ui.addEnd, 17);

  const fromHash = decodePlan(window.location.hash);
  state.plan = fromHash ?? defaultPlan();
  if (!fromHash) writeHash();

  const localZone = state.plan.referenceZone;
  ui.addZone.value = localZone;
  ui.referenceZone.value = localZone;

  grid = createGrid({
    container: ui.grid,
    onSlotChange: setSlot,
    slotHours: () => state.duration,
  });
  panel = createPanel({
    container: ui.participants,
    onChange: changeParticipant,
    onRemove: removeParticipant,
  });

  applyPlan(state.plan, { hash: false });
  bindEvents();

  window.setInterval(() => {
    const now = Date.now();
    grid.updateNow(now);
    panel.updateClocks(now);
  }, 20000);
}

globalThis.meridian = {
  get plan() {
    return state.plan;
  },
  get slot() {
    return state.slot;
  },
  get slotData() {
    return state.slotData;
  },
  get dayPlan() {
    return dayPlan;
  },
  setSlot,
  setDate,
  setReferenceZone,
  addParticipant,
  removeParticipant,
  resetPlan,
  bestSlot: () => {
    const best = bestSlotFor(dayPlan, state.duration);
    if (best) setSlot(best);
    return best;
  },
};

init();
