import {
  inventoryQuantityScale,
  type InventoryQuantityConfig,
} from "./quantity-policy";
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

// Season opening entries are stored as their own already-ACCEPTED
// InventoryCount, identified by this deterministic source key rather than
// by id, so re-saving a season's figures updates the same record instead of
// piling up duplicates.
export const SEASON_OPENING_SOURCE_SYSTEM = "season-opening-entry";

export function seasonOpeningSourceId(locationCode: string, year: number) {
  return `${locationCode}-${year}-start`;
}

export function isValidSeasonYear(year: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

export function normalizeSeasonYear(value: string) {
  const year = Number(value);
  if (!isValidSeasonYear(year)) throw new InventoryCountError("INVALID_INPUT");
  return year;
}

// classifyCountDate (lib/seasonal-consumption.ts) treats Jan-Jun as a
// season's "start" window and takes the latest count per Location within
// it. Anchoring a manually-set opening figure to the last day of that
// window (rather than today) means it always outranks an earlier physical
// count from the same season, so an explicit correction here is never
// silently shadowed by a routine count entered earlier in the year.
export function seasonOpeningCountDate(year: number) {
  return new Date(Date.UTC(year, 5, 30));
}

// A physical count reading may legitimately be zero, unlike a movement
// quantity, so this intentionally does not reuse normalizeStockQuantity
// (which rejects zero) and never accepts a negative sign.
export function normalizeCountedQuantity(
  value: string,
  product: InventoryQuantityConfig,
) {
  const input = value.trim();
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(input);
  if (!match) throw new InventoryCountError("INVALID_INPUT");
  const fractionalDigits = match[2]?.length ?? 0;
  if (
    fractionalDigits > inventoryQuantityScale(product) ||
    (!product.allowFractionalStock && fractionalDigits > 0)
  )
    throw new InventoryCountError("INVALID_INPUT");
  return `${match[1]}.${(match[2] ?? "").padEnd(inventoryQuantityScale(product), "0")}`.replace(
    /\.$/,
    "",
  );
}

// Draft entries may be left blank (not yet counted); blank normalizes to
// null rather than throwing, so a partially-completed draft can be saved.
export function normalizeDraftCountedQuantity(
  value: string,
  product: InventoryQuantityConfig,
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
