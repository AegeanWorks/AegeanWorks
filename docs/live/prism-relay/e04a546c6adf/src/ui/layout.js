export const BOARD_MAX_WIDTH = 640;
export const BOARD_MIN_WIDTH = 304;

function finite(value) {
  return Number.isFinite(value);
}

export function fitBoardWidth({
  columns,
  rows,
  availableHeight,
  paddingX = 0,
  paddingY = 0,
  minWidth = BOARD_MIN_WIDTH,
  maxWidth = BOARD_MAX_WIDTH,
}) {
  if (
    !finite(columns) ||
    !finite(rows) ||
    !finite(availableHeight) ||
    !finite(paddingX) ||
    !finite(paddingY) ||
    !finite(minWidth) ||
    !finite(maxWidth) ||
    columns <= 0 ||
    rows <= 0
  ) {
    return minWidth;
  }
  const contentHeight = Math.max(0, availableHeight - paddingY);
  const wanted = (contentHeight * columns) / rows + paddingX;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, wanted)));
}
