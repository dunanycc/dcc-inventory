export type MovementSumRow = { productId: string; quantity: string };
const ZERO = BigInt(0);
const MICROS = BigInt(1_000_000);

function decimalToMicros(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error("INVALID_MOVEMENT_SUM");
  const magnitude = BigInt(match[2]) * MICROS + BigInt((match[3] ?? "").padEnd(6, "0"));
  return match[1] === "-" ? -magnitude : magnitude;
}

function microsToDecimal(value: bigint) {
  const negative = value < ZERO;
  const absolute = negative ? -value : value;
  const whole = absolute / MICROS;
  const fraction = String(absolute % MICROS).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function combineMovementSums(inbound: readonly MovementSumRow[], outbound: readonly MovementSumRow[]) {
  const balances = new Map<string, bigint>();
  for (const row of inbound) balances.set(row.productId, (balances.get(row.productId) ?? ZERO) + decimalToMicros(row.quantity));
  for (const row of outbound) balances.set(row.productId, (balances.get(row.productId) ?? ZERO) - decimalToMicros(row.quantity));
  return new Map([...balances].map(([productId, quantity]) => [productId, microsToDecimal(quantity)]));
}

export async function inventoryBalancesForLocation(locationId: string) {
  const { prisma } = await import("./prisma");
  const [inbound, outbound] = await Promise.all([
    prisma.inventoryMovement.groupBy({ by: ["productId"], where: { destinationLocationId: locationId }, _sum: { quantity: true } }),
    prisma.inventoryMovement.groupBy({ by: ["productId"], where: { sourceLocationId: locationId }, _sum: { quantity: true } }),
  ]);
  return combineMovementSums(
    inbound.map((row) => ({ productId: row.productId, quantity: row._sum.quantity?.toString() ?? "0" })),
    outbound.map((row) => ({ productId: row.productId, quantity: row._sum.quantity?.toString() ?? "0" })),
  );
}

export function formatStockQuantity(value: string, quantityScale: number) {
  const numeric = Number(value);
  return new Intl.NumberFormat("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: quantityScale }).format(numeric);
}
