import { hasPermission, type AppRole } from "./authorization";
import { normalizeStockQuantity } from "./inventory-movement";

export type RequestActor = {
  id: string;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
};
export type RequestProduct = {
  id: string;
  active: boolean;
  starterShackRequestEligible: boolean;
  allowFractionalStock: boolean;
  quantityScale: number;
  barEligible: boolean;
  shackEligible: boolean;
};
export type RequestLineState = {
  id: string;
  productId: string;
  requestedQuantity: string;
  quantityGiven: string;
  product: Pick<RequestProduct, "allowFractionalStock" | "quantityScale">;
};

export class StockRequestError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "NOT_ELIGIBLE"
      | "NOT_FOUND"
      | "NOT_OPEN"
      | "OVER_FULFILLMENT"
      | "INSUFFICIENT_STOCK",
  ) {
    super(code);
  }
}

function micros(value: string) {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new StockRequestError("INVALID_INPUT");
  return (
    BigInt(match[1]) * BigInt(1_000_000) +
    BigInt((match[2] ?? "").padEnd(6, "0"))
  );
}

export function requestProductEligible(product: RequestProduct) {
  return (
    product.active &&
    product.starterShackRequestEligible &&
    product.barEligible &&
    product.shackEligible
  );
}

export function validateRequestSubmission(
  actor: RequestActor,
  items: Array<{ productId: string; quantity: string }>,
  products: Map<string, RequestProduct>,
) {
  if (
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "operations:draft")
  )
    throw new StockRequestError("FORBIDDEN");
  if (
    !items.length ||
    new Set(items.map((item) => item.productId)).size !== items.length
  )
    throw new StockRequestError("INVALID_INPUT");
  return items.map((item) => {
    const product = products.get(item.productId);
    if (!product || !requestProductEligible(product))
      throw new StockRequestError("NOT_ELIGIBLE");
    return {
      productId: product.id,
      quantity: normalizeStockQuantity(item.quantity, product).quantity,
    };
  });
}

export function deriveRequestStatus(
  lines: Array<{ requestedQuantity: string; quantityGiven: string }>,
) {
  const requested = lines.reduce(
    (total, line) => total + micros(line.requestedQuantity),
    BigInt(0),
  );
  const given = lines.reduce(
    (total, line) => total + micros(line.quantityGiven),
    BigInt(0),
  );
  if (given === BigInt(0)) return "SUBMITTED" as const;
  return given === requested
    ? ("GIVEN" as const)
    : ("PARTIALLY_GIVEN" as const);
}

export function validateFulfillment(
  actor: RequestActor,
  requestStatus: string,
  entries: ReadonlyArray<{ lineId: string; quantity: string }>,
  lines: Map<string, RequestLineState>,
  products: Map<string, RequestProduct>,
  barBalances: Map<string, string>,
) {
  if (
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "operations:post")
  )
    throw new StockRequestError("FORBIDDEN");
  if (!["SUBMITTED", "PARTIALLY_GIVEN"].includes(requestStatus))
    throw new StockRequestError("NOT_OPEN");
  if (
    !entries.length ||
    new Set(entries.map((entry) => entry.lineId)).size !== entries.length
  )
    throw new StockRequestError("INVALID_INPUT");
  const remainingByProduct = new Map(
    [...barBalances].map(([id, value]) => [
      id,
      value.startsWith("-") ? -micros(value.slice(1)) : micros(value),
    ]),
  );
  return entries.map((entry) => {
    const line = lines.get(entry.lineId);
    if (!line) throw new StockRequestError("NOT_FOUND");
    const product = products.get(line.productId);
    if (!product || !requestProductEligible(product))
      throw new StockRequestError("NOT_ELIGIBLE");
    const quantity = normalizeStockQuantity(entry.quantity, product).quantity;
    const amount = micros(quantity);
    if (amount > micros(line.requestedQuantity) - micros(line.quantityGiven))
      throw new StockRequestError("OVER_FULFILLMENT");
    const balance = remainingByProduct.get(product.id) ?? BigInt(0);
    if (amount > balance) throw new StockRequestError("INSUFFICIENT_STOCK");
    remainingByProduct.set(product.id, balance - amount);
    return { lineId: line.id, productId: product.id, quantity };
  });
}
