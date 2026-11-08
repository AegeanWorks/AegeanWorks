export function starsMarkup(count) {
  return [1, 2, 3]
    .map((index) => {
      const earned = index <= count;
      return `<span class="star${earned ? " is-earned" : ""}" aria-hidden="true">${
        earned ? "★" : "☆"
      }</span>`;
    })
    .join("");
}

export function starLabel(count) {
  return count === 0 ? "No stars yet" : `${count} of 3 stars`;
}
