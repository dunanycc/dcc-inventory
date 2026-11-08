// Money is calculated in integer cents; quantities use six decimal places.
export function quantity(value: string) {
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(value))
    throw new Error("Enter a valid non-negative quantity.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function money(value: string) {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter a valid non-negative amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function amount(cents: bigint) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function receiptTotals(
  lines: { quantity: string; price: string | null }[],
  taxIncluded: boolean,
  gst = "0",
  pst = "0",
) {
  const gstCents = taxIncluded ? 0n : money(gst);
  const pstCents = taxIncluded ? 0n : money(pst);
  let subtotal = 0n;
  let missing = false;
  for (const line of lines) {
    const qty = quantity(line.quantity);
    if (!qty) continue;
    if (line.price == null || line.price === "") {
      missing = true;
      continue;
    }
    subtotal += (qty * money(line.price) + 500_000n) / 1_000_000n;
  }
  return {
    subtotal: missing ? null : amount(subtotal),
    gst: amount(gstCents),
    pst: amount(pstCents),
    total: missing ? null : amount(subtotal + gstCents + pstCents),
  };
}
export function orderDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Choose a valid date.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (
    isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getUTCFullYear() < 1900
  )
    throw new Error("Choose a valid date.");
  return date;
}
export function reordered(ids: string[], moving: string, target: string) {
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes(moving) ||
    !ids.includes(target)
  )
    throw new Error("Invalid order position.");
  const result = ids.filter((id) => id !== moving);
  result.splice(ids.indexOf(target), 0, moving);
  return result;
}
export function historicalVendor(category: string) {
  const name = category.trim().toLowerCase().replace(/\s+/g, " ");
  if (["wine", "hard liquor"].includes(name)) return "SAQ";
  if (
    [
      "beer",
      "beer kegs",
      "non-alcohol beer",
      "non alcohol beer",
      "mixed drinks",
    ].includes(name)
  )
    return "Beer";
  if (name === "mixers & misc") return "Groceries";
  return null;
}
