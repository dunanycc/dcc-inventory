import {
  inventoryQuantityScale,
  type InventoryQuantityConfig,
} from "./quantity-policy";
import { Prisma } from "@/app/generated/prisma/client";
import { normalizeStockQuantity } from "./inventory-movement";

export type DeliveryProduct = InventoryQuantityConfig & {
  allowFractionalStock: boolean;
  quantityScale: number;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: { toString(): string } | string | null;
};
export function calculateDeliveryQuantity(
  entryQuantity: string,
  product: DeliveryProduct,
) {
  const scale =
    product.purchaseUnit && product.unitsPerPurchaseUnit
      ? 0
      : inventoryQuantityScale(product);
  if (!(scale ? /^\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}$/).test(entryQuantity))
    throw new Error("INVALID_QUANTITY");
  let entry: Prisma.Decimal;
  try {
    entry = new Prisma.Decimal(entryQuantity);
  } catch {
    throw new Error("INVALID_QUANTITY");
  }
  if (!entry.greaterThan(0)) throw new Error("INVALID_QUANTITY");
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
