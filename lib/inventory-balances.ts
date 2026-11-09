export type MovementSumRow = { productId: string; quantity: string };
import { decimalToMicros, microsToDecimal } from "./decimal-quantity";
export { decimalToMicros, microsToDecimal } from "./decimal-quantity";
const ZERO = BigInt(0);

export function combineMovementSums(
  inbound: readonly MovementSumRow[],
  outbound: readonly MovementSumRow[],
) {
  const balances = new Map<string, bigint>();
  for (const row of inbound)
    balances.set(
      row.productId,
      (balances.get(row.productId) ?? ZERO) + decimalToMicros(row.quantity),
    );
  for (const row of outbound)
    balances.set(
      row.productId,
      (balances.get(row.productId) ?? ZERO) - decimalToMicros(row.quantity),
    );
  return new Map(
    [...balances].map(([productId, quantity]) => [
      productId,
      microsToDecimal(quantity),
    ]),
  );
}

export async function inventoryBalancesForLocation(locationId: string) {
  const { prisma } = await import("./prisma");
  const [inbound, outbound] = await Promise.all([
    prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { destinationLocationId: locationId },
      _sum: { quantity: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { sourceLocationId: locationId },
      _sum: { quantity: true },
    }),
  ]);
  return combineMovementSums(
    inbound.map((row) => ({
      productId: row.productId,
      quantity: row._sum.quantity?.toString() ?? "0",
    })),
    outbound.map((row) => ({
      productId: row.productId,
      quantity: row._sum.quantity?.toString() ?? "0",
    })),
  );
}

export function formatStockQuantity(value: string, quantityScale: number) {
  const numeric = Number(value);
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(2, quantityScale),
  }).format(numeric);
}
