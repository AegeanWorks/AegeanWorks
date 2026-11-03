/**
 * Small DOM helpers shared by the grid and the participant panel, plus the
 * stable per-participant accent colour.
 */

const PARTICIPANT_COLORS = [
  "#38d9c3",
  "#7aa2ff",
  "#ffb454",
  "#ff7ab2",
  "#a7e05a",
  "#c792ff",
  "#5fd0e8",
  "#ff8f6b",
  "#8ee6a2",
  "#e8d75f",
  "#6ea8ff",
  "#ff6f91",
];

export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function colorFor(id) {
  let hash = 0;
  for (const character of String(id)) {
    hash = (hash * 31 + character.codePointAt(0)) % 99991;
  }
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length];
}

export function hourSelect(ariaLabel, value) {
  const select = el("select", "p-hour");
  select.setAttribute("aria-label", ariaLabel);
  for (let hour = 0; hour < 24; hour += 1) {
    const option = el("option", "", `${String(hour).padStart(2, "0")}:00`);
    option.value = String(hour);
    if (hour === value) option.selected = true;
    select.append(option);
  }
  return select;
}
