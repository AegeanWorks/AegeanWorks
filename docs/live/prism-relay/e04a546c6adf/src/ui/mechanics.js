export function mechanicNotes(board) {
  const notes = [];
  if (board.splitters.length > 0) {
    notes.push({
      name: "Splitter",
      text: "The main beam passes through; a copy forks to the bright side.",
    });
  }
  if (board.portals.length > 0) {
    notes.push({
      name: "Portal",
      text: "Enter one gate, leave the twin in the same direction. Numbers pair the gates.",
    });
  }
  if (
    board.prisms.length > 0 &&
    board.splitters.length === 0 &&
    board.portals.length === 0
  ) {
    notes.push({
      name: "Prism",
      text: "The prism passes the beam through and splits copies to both perpendicular sides.",
    });
  }
  return notes;
}
