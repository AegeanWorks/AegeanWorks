export function parHint(par) {
  const moves = Number.isInteger(par) && par > 0 ? par : 0;
  return `Par is ${moves} ${moves === 1 ? "move" : "moves"}. Every rotation counts.`;
}

export function postVictoryAction(result) {
  if (!result) {
    return null;
  }
  if (result.next) {
    return { label: "Next chamber →", levelId: result.next };
  }
  return { label: "Episode index", screen: "chambers" };
}

export function saveStatusMessage(saved, success) {
  return saved ? success : "Changes are not being stored.";
}

export function relayCtaLabel(completed, total) {
  return total > 0 && completed >= total ? "Replay the relay" : "Enter the relay";
}
