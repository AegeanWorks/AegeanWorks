/**
 * The participant list: one editable row per person, with name, zone and
 * work hours, plus the live local clock updated on a timer.
 */

import { LABEL_MAX } from "../core/state.js";
import { wallClockFor } from "../core/time.js";
import { clockText } from "./format.js";
import { colorFor, el, hourSelect } from "./dom.js";

export function createPanel({ container, onChange, onRemove }) {
  let plan = null;

  function buildItem(participant, index) {
    const item = el("li", "participant");
    item.dataset.id = participant.id;

    const dot = el("span", "dot");
    dot.style.setProperty("--dot", colorFor(participant.id));

    const label = el("input", "p-label");
    label.type = "text";
    label.maxLength = LABEL_MAX;
    label.value = participant.label;
    label.autocomplete = "off";
    label.setAttribute("aria-label", `Name for participant ${index + 1}`);
    label.addEventListener("change", () => onChange(participant.id, { label: label.value }));

    const zone = el("input", "p-zone");
    zone.type = "text";
    zone.value = participant.zone;
    zone.autocomplete = "off";
    zone.spellcheck = false;
    zone.setAttribute("list", "zone-list");
    zone.setAttribute("aria-label", `Time zone for ${participant.label}`);
    zone.addEventListener("change", () => onChange(participant.id, { zone: zone.value }));

    const start = hourSelect(`Work day start for ${participant.label}`, participant.workStart);
    start.addEventListener("change", () =>
      onChange(participant.id, { workStart: Number(start.value) }),
    );
    const end = hourSelect(`Work day end for ${participant.label}`, participant.workEnd);
    end.addEventListener("change", () =>
      onChange(participant.id, { workEnd: Number(end.value) }),
    );
    const hours = el("span", "p-hours");
    hours.append(start, el("span", "p-hours-sep", "–"), end);

    const clock = el("span", "p-clock");
    clock.dataset.zone = participant.zone;

    const remove = el("button", "p-remove", "✕");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${participant.label}`);
    remove.addEventListener("click", () => onRemove(participant.id));

    item.append(dot, label, zone, hours, clock, remove);
    return item;
  }

  function render(nextPlan) {
    plan = nextPlan;
    const list = el("ul", "participants");
    plan.participants.forEach((participant, index) => list.append(buildItem(participant, index)));
    container.replaceChildren(list);
    updateClocks(Date.now());
  }

  function updateClocks(now = Date.now()) {
    if (!plan) return;
    for (const node of container.querySelectorAll(".p-clock")) {
      const clock = wallClockFor(now, node.dataset.zone);
      node.textContent = clockText(clock);
    }
  }

  return { render, updateClocks };
}
