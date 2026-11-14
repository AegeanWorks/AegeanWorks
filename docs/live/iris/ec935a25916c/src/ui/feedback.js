/**
 * Pick the sound cues for one move from the receiver state before and after it.
 * A move can charge one receiver while uncharging another, so this compares the
 * exact set of charged cells instead of a net count.
 */

function cellKey(receiver) {
  return `${receiver.x},${receiver.y}`;
}

function chargedCells(trace) {
  return new Set(trace.receivers.filter((receiver) => receiver.charged).map(cellKey));
}

export function feedbackCues(before, after) {
  const wasCharged = chargedCells(before);
  const isCharged = chargedCells(after);
  const gained = [...isCharged].some((key) => !wasCharged.has(key));
  const lost = [...wasCharged].some((key) => !isCharged.has(key));
  const cues = [];
  if (gained) {
    cues.push("charge");
  }
  if (lost) {
    cues.push("uncharge");
  }
  return Object.freeze(cues);
}
