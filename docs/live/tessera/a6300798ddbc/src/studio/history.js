export const HISTORY_LIMIT = 30;

function capped(list) {
  return list.length > HISTORY_LIMIT ? list.slice(list.length - HISTORY_LIMIT) : list;
}

export function pushHistory(past, state) {
  return capped(past.concat(state));
}

export function stepBack(past, future, current) {
  if (!past.length) return null;
  return Object.freeze({
    state: past[past.length - 1],
    past: past.slice(0, -1),
    future: [current, ...future].slice(0, HISTORY_LIMIT),
  });
}

export function stepForward(past, future, current) {
  if (!future.length) return null;
  return Object.freeze({
    state: future[0],
    past: capped([...past, current]),
    future: future.slice(1),
  });
}
