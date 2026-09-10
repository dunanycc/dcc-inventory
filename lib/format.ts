function pluralize(word: string) {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** Formats a unit label (e.g. "Bottle", "case") to match the given quantity. */
export function pluralizeUnit(quantity: number | string, unit: string) {
  const amount = Number(quantity);
  const singular = !Number.isFinite(amount) || Math.abs(amount) === 1;
  if (singular || unit.toLowerCase() === "each") return unit;
  return pluralize(unit);
}
