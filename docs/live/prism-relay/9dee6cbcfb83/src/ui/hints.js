export function parHint(par) {
  const moves = Number.isInteger(par) && par > 0 ? par : 0;
  return `Par is ${moves} ${moves === 1 ? "move" : "moves"}. Every rotation counts.`;
}

export function postVictoryAction(result) {
  if (!result) {
    return null;
  }
  if (result.daily) {
    return { label: "Back to title", screen: "title" };
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

export function restartPrompt(levelName, moves) {
  const count = Number.isInteger(moves) && moves > 0 ? moves : 0;
  const chamber = typeof levelName === "string" && levelName.trim() ? levelName.trim() : "this chamber";
  return {
    title: "Discard this run?",
    body: `You have made ${count} ${count === 1 ? "move" : "moves"} in ${chamber}. Restarting returns every piece to its opening position.`,
  };
}
