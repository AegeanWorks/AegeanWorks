export const BOARD_MAX_WIDTH = 640;
export const BOARD_MIN_WIDTH = 304;
export const MOBILE_MIN_CELL = 28;
export const TALL_MIN_CELL = 24;

function finite(value) {
  return Number.isFinite(value);
}

export function wideBoardNeedsPan({
  columns,
  rows,
  viewportWidth,
  minCell = MOBILE_MIN_CELL,
}) {
  if (
    !finite(columns) ||
    !finite(rows) ||
    !finite(viewportWidth) ||
    !finite(minCell) ||
    columns <= 0 ||
    rows <= 0 ||
    viewportWidth <= 0 ||
    minCell <= 0
  ) {
    return false;
  }
  return columns > rows && columns * minCell > viewportWidth;
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
