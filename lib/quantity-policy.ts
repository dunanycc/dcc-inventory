export type InventoryQuantityConfig = {
  allowFractionalStock: boolean;
  quantityScale: number;
  category?: { name: string };
  categoryName?: string;
};
/** Only Hard Liquor stock updates may use decimals, capped at two places. */
export function inventoryQuantityScale(product: InventoryQuantityConfig) {
  const category = product.category?.name ?? product.categoryName;
  if (category && category.trim().toLowerCase() !== "hard liquor") return 0;
  if (!product.allowFractionalStock) return 0;
  return category ? 2 : Math.min(2, Math.max(0, product.quantityScale));
}
export function wholeQuantity(value: string) {
  if (!/^\d{1,12}$/.test(value.trim()))
    throw new Error("Use whole-number quantities.");
  return value.trim();
}
export function receivedQuantityScale(
  line: {
    categoryName: string;
    unitsPerEntry: string | { toString(): string };
    quantityScale?: number;
  },
  isPrivate: boolean,
) {
  return line.quantityScale !== 0 &&
    !isPrivate &&
    line.categoryName.trim().toLowerCase() === "hard liquor" &&
    Number(line.unitsPerEntry.toString()) === 1
    ? 2
    : 0;
}
export function validateReceivedQuantity(
  value: string,
  line: {
    categoryName: string;
    unitsPerEntry: string | { toString(): string };
    quantityScale?: number;
  },
  isPrivate: boolean,
) {
  if (!receivedQuantityScale(line, isPrivate)) return wholeQuantity(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Hard Liquor inventory quantities allow at most two decimal places.",
    );
  return value.trim();
}
