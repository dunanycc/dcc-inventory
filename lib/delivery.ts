import { Prisma } from "@/app/generated/prisma/client";
import { normalizeStockQuantity } from "./inventory-movement";

export type DeliveryProduct = {
  allowFractionalStock: boolean;
  quantityScale: number;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: { toString(): string } | string | null;
};
export function calculateDeliveryQuantity(
  entryQuantity: string,
  product: DeliveryProduct,
) {
  let entry: Prisma.Decimal;
  try {
    entry = new Prisma.Decimal(entryQuantity);
  } catch {
    throw new Error("INVALID_QUANTITY");
  }
  if (!entry.isPositive()) throw new Error("INVALID_QUANTITY");
  const actual =
    product.purchaseUnit && product.unitsPerPurchaseUnit
      ? entry.mul(product.unitsPerPurchaseUnit.toString())
      : entry;
  return {
    entryQuantity: entry.toString(),
    stockQuantity: normalizeStockQuantity(actual.toString(), product).quantity,
    purchaseUnit: product.purchaseUnit,
    unitsPerPurchaseUnit: product.unitsPerPurchaseUnit?.toString() ?? null,
  };
}
