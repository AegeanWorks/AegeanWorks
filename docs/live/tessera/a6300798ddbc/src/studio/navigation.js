const MOVES = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export function gridTargetIndex(index, columns, length, key) {
  if (!Number.isInteger(index) || !Number.isInteger(columns) || !Number.isInteger(length)) return null;
  if (columns < 1 || length < 1 || index < 0 || index >= length) return null;
  if (!MOVES.has(key)) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;

  const column = index % columns;
  if (key === "ArrowLeft") return column > 0 ? index - 1 : null;
  if (key === "ArrowRight") {
    return column < columns - 1 && index + 1 < length ? index + 1 : null;
  }
  if (key === "ArrowUp") return index - columns >= 0 ? index - columns : null;
  return index + columns < length ? index + columns : null;
}
