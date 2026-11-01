export function seedToInt(seed) {
  const value = Number(seed);
  if (!Number.isFinite(value)) return 1;
  const integer = Math.trunc(value) % 1000003;
  return integer > 0 ? integer : integer + 1000003;
}

export function createRandom(seed) {
  let state = seedToInt(seed) >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(list, random) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

export function between(min, max, random) {
  return min + (max - min) * random();
}

export function integerBetween(min, max, random) {
  return Math.floor(between(min, max + 1, random));
}
