import { decimalToMicros, microsToDecimal } from "./inventory-balances";
import { hasPermission, type AppRole } from "./authorization";
import type { MovementProduct } from "./inventory-movement";

export type CountActor = {
  id: string;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
};

export class InventoryCountError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "NOT_DRAFT"
      | "NOT_ELIGIBLE"
      | "INCOMPLETE"
      | "ALREADY_ACTIVE"
      | "CONFLICT",
  ) {
    super(code);
  }
}

export function requireDraftPermission(actor: CountActor) {
  if (
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "operations:draft")
  )
    throw new InventoryCountError("FORBIDDEN");
}

export function requireAcceptPermission(actor: CountActor) {
  if (
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "operations:post")
  )
    throw new InventoryCountError("FORBIDDEN");
}

// A physical count reading may legitimately be zero, unlike a movement
// quantity, so this intentionally does not reuse normalizeStockQuantity
// (which rejects zero) and never accepts a negative sign.
export function normalizeCountedQuantity(
  value: string,
  product: Pick<MovementProduct, "allowFractionalStock" | "quantityScale">,
) {
  const input = value.trim();
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(input);
  if (!match) throw new InventoryCountError("INVALID_INPUT");
  const fractionalDigits = match[2]?.length ?? 0;
  if (
    fractionalDigits > product.quantityScale ||
    (!product.allowFractionalStock && fractionalDigits > 0)
  )
    throw new InventoryCountError("INVALID_INPUT");
  return `${match[1]}.${(match[2] ?? "").padEnd(product.quantityScale, "0")}`.replace(
    /\.$/,
    "",
  );
}

// Draft entries may be left blank (not yet counted); blank normalizes to
// null rather than throwing, so a partially-completed draft can be saved.
export function normalizeDraftCountedQuantity(
  value: string,
  product: Pick<MovementProduct, "allowFractionalStock" | "quantityScale">,
) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeCountedQuantity(trimmed, product);
}

export type AcceptanceLine = {
  id: string;
  productId: string;
  expectedQuantity: string;
  countedQuantity: string | null;
  product: Pick<MovementProduct, "allowFractionalStock" | "quantityScale">;
};

export type AcceptanceResult = {
  lineId: string;
  productId: string;
  countedQuantity: string;
  difference: string;
  differenceIsZero: boolean;
};

export function calculateCountAcceptance(
  actor: CountActor,
  countStatus: string,
  lines: readonly AcceptanceLine[],
): AcceptanceResult[] {
  requireAcceptPermission(actor);
  if (countStatus !== "DRAFT") throw new InventoryCountError("NOT_DRAFT");
  if (!lines.length) throw new InventoryCountError("INVALID_INPUT");
  return lines.map((line) => {
    if (line.countedQuantity === null)
      throw new InventoryCountError("INCOMPLETE");
    const counted = normalizeCountedQuantity(
      line.countedQuantity,
      line.product,
    );
    const differenceMicros =
      decimalToMicros(counted) - decimalToMicros(line.expectedQuantity);
    return {
      lineId: line.id,
      productId: line.productId,
      countedQuantity: counted,
      difference: microsToDecimal(differenceMicros),
      differenceIsZero: differenceMicros === BigInt(0),
    };
  });
}
