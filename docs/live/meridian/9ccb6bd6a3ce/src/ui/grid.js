/**
 * The timeline grid: reference-zone hours across, one local clock per
 * participant down, with overlap bands, a "now" marker and slot selection.
 */

import { DAY_HOURS } from "../core/schedule.js";
import { localDateISO, wallClockFor, zoneOffsetMinutes, formatOffset } from "../core/time.js";
import { zoneLabel } from "../core/zones.js";
import { CATEGORY_TEXT, clockText, dayOffsetText, hourText, pad2 } from "./format.js";
import { colorFor, el } from "./dom.js";

export function createGrid({ container, onSlotChange, slotHours = () => 1 }) {
  const scroll = el("div", "grid-scroll");
  const table = el("table", "grid-table");
  const nowLine = el("div", "now-line");
  nowLine.hidden = true;
  scroll.append(table, nowLine);
  container.replaceChildren(scroll);

  let dayPlan = null;
  let slot = null;
  let headCells = [];
  let dragging = false;
  let anchor = -1;

  function build() {
    const thead = el("thead");
    const headRow = el("tr");
    const corner = el("th", "corner");
    corner.scope = "col";
    corner.append(el("span", "sr-only", "Participant"));
    headRow.append(corner);

    headCells = dayPlan.columns.map((column, index) => {
      const th = el("th", "hour-head", pad2(column.hour));
      th.scope = "col";
      th.dataset.col = String(index);
      if (dayPlan.overlap.work[index]) th.classList.add("band-work");
      else if (dayPlan.overlap.awake[index]) th.classList.add("band-awake");
      headRow.append(th);
      return th;
    });
    thead.append(headRow);

    const tbody = el("tbody");
    for (const row of dayPlan.rows) {
      const tr = el("tr", "participant-row");
      tr.dataset.id = row.participant.id;

      const head = el("th", "row-head");
      head.scope = "row";
      const dot = el("span", "dot");
      dot.style.setProperty("--dot", colorFor(row.participant.id));
      const text = el("span", "row-text");
      text.append(
        el("span", "row-name", row.participant.label),
        el("span", "row-zone"),
      );
      text.lastChild.dataset.zone = row.participant.zone;
      const clock = el("span", "row-clock");
      clock.dataset.zone = row.participant.zone;
      head.append(dot, text, clock);

      tr.append(head);
      row.cells.forEach((cell, index) => {
        const wrap = el("td", "cell-wrap");
        if (dayPlan.overlap.work[index]) wrap.classList.add("band-work");
        else if (dayPlan.overlap.awake[index]) wrap.classList.add("band-awake");

        const button = el("button", `cell cat-${cell.category}`);
        button.type = "button";
        button.dataset.col = String(index);
        button.dataset.id = row.participant.id;
        button.append(el("span", "cell-hour", pad2(cell.hour)));
        if (cell.dayOffset) button.append(el("span", "cell-day", dayOffsetText(cell.dayOffset)));
        const dayNote = cell.dayOffset ? (cell.dayOffset > 0 ? ", next day" : ", previous day") : "";
        button.setAttribute(
          "aria-label",
          `${row.participant.label}, ${hourText(cell.hour)} local time, ${CATEGORY_TEXT[cell.category]}${dayNote}`,
        );
        wrap.append(button);
        tr.append(wrap);
      });
      tbody.append(tr);
    }

    table.replaceChildren(thead, tbody);
    updateNow(Date.now());
  }

  function select(nextSlot) {
    slot = nextSlot;
    const start = slot?.start ?? -1;
    const end = slot ? slot.start + slot.hours - 1 : -2;
    for (const node of scroll.querySelectorAll("[data-col]")) {
      const column = Number(node.dataset.col);
      const inside = column >= start && column <= end;
      node.classList.toggle("sel", inside);
      node.classList.toggle("sel-start", column === start);
      node.classList.toggle("sel-end", column === end);
    }
  }

  function updateNow(now = Date.now()) {
    if (!dayPlan) return;
    const zone = dayPlan.referenceZone;
    for (const node of scroll.querySelectorAll(".row-clock")) {
      const clock = wallClockFor(now, node.dataset.zone);
      node.textContent = clockText(clock);
    }
    for (const node of scroll.querySelectorAll(".row-zone")) {
      const offset = formatOffset(zoneOffsetMinutes(now, node.dataset.zone));
      node.textContent = `${zoneLabel(node.dataset.zone)} · ${offset}`;
    }
    const today = localDateISO(now, zone) === dayPlan.date;
    if (!today || !headCells.length) {
      nowLine.hidden = true;
      return;
    }
    const clock = wallClockFor(now, zone);
    const fraction = (clock.hour + clock.minute / 60) / DAY_HOURS;
    const cellRect = headCells[0].getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const left = cellRect.left - scrollRect.left + scroll.scrollLeft + fraction * cellRect.width * DAY_HOURS;
    nowLine.style.left = `${Math.round(left)}px`;
    nowLine.style.height = `${table.offsetHeight}px`;
    nowLine.hidden = false;
  }

  function cellAt(id, column) {
    return scroll.querySelector(`button.cell[data-id="${id}"][data-col="${column}"]`);
  }

  function focusCell(column, rowId = null) {
    const row = rowId
      ? scroll.querySelector(`tbody tr[data-id="${rowId}"]`)
      : scroll.querySelector("tbody tr");
    if (!row) return;
    const button = cellAt(row.dataset.id, column);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function scrollToColumn(column) {
    focusCell(column);
  }

  function selectRange(from, to) {
    onSlotChange({ start: Math.max(0, from), hours: Math.min(DAY_HOURS, to - from + 1) });
  }

  function preferredHours(column) {
    const wanted = Math.max(1, Number(slotHours()) || 1);
    return Math.min(wanted, DAY_HOURS - column);
  }

  scroll.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest?.("button.cell");
    if (!cell) return;
    dragging = true;
    anchor = Number(cell.dataset.col);
    onSlotChange({ start: anchor, hours: preferredHours(anchor) });
  });

  scroll.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("button.cell");
    if (!node) return;
    const column = Number(node.dataset.col);
    selectRange(Math.min(anchor, column), Math.max(anchor, column));
  });

  window.addEventListener("pointerup", () => {
    dragging = false;
    anchor = -1;
  });

  scroll.addEventListener("keydown", (event) => {
    const cell = event.target.closest?.("button.cell");
    if (!cell) return;
    const column = Number(cell.dataset.col);
    const current = slot ?? { start: column, hours: 1 };
    const keep = { hours: current.hours };
    let next = null;
    if (event.key === "ArrowLeft") next = { start: Math.max(0, current.start - 1), ...keep };
    else if (event.key === "ArrowRight") {
      next = { start: Math.min(DAY_HOURS - 1, current.start + 1), ...keep };
    } else if (event.key === "Home") next = { start: 0, ...keep };
    else if (event.key === "End") {
      next = { start: Math.max(0, DAY_HOURS - current.hours), ...keep };
    } else if (event.key === "Enter" || event.key === " ") {
      next = { start: column, hours: preferredHours(column) };
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const rows = [...scroll.querySelectorAll("tbody tr")];
      const index = rows.findIndex((row) => row.dataset.id === cell.dataset.id);
      const target = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (target) cellAt(target.dataset.id, column)?.focus({ preventScroll: true });
      return;
    } else {
      return;
    }
    event.preventDefault();
    onSlotChange(next);
    focusCell(next.start, cell.dataset.id);
  });

  return {
    element: scroll,
    render(nextPlan) {
      dayPlan = nextPlan;
      build();
      select(slot);
    },
    select,
    updateNow,
    scrollToColumn,
  };
}
