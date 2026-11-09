import type { OrderRow } from "./purchase-order-queries";
import { decimalToMicros, microsToDecimal } from "./decimal-quantity";
import { compareHistoryProducts } from "./purchase-order-history";

export type ExecutiveProduct = {
  id: string;
  name: string;
  vendorId: string | null;
  categoryName: string;
  unit: string;
  active: boolean;
  historyCategoryOrder: number;
  historyProductOrder: number;
};
export type ExecutiveStock = {
  productId: string;
  opening: string | null;
  remaining: string | null;
  receivedForConsumption?: string;
};
export type ExecutiveRow = {
  key: string;
  productId: string | null;
  name: string;
  categoryName: string;
  unit: string;
  isPrivate: boolean;
  orders: string[];
  ordered: string;
  received: string;
  opening: string | null;
  remaining: string | null;
  consumed: string | null;
  knownCost: string;
  totalCost: string | null;
  averageCost: string | null;
  missingPrices: number;
  historyCategoryOrder: number;
  historyProductOrder: number;
};
const SCALE = 1_000_000n;
function units(quantity: string, factor: string) {
  return (decimalToMicros(quantity) * decimalToMicros(factor)) / SCALE;
}
function roundDivide(a: bigint, b: bigint) {
  return (a + b / 2n) / b;
}
function money(cents: bigint) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/** Purchases respect vendor toggles; stock/consumption remain whole-club product measures. */
export function executiveRows(
  orders: OrderRow[],
  products: ExecutiveProduct[],
  stocks: ExecutiveStock[],
  selected: string[],
): ExecutiveRow[] {
  const catalog = new Map(products.map((p) => [p.id, p]));
  const stock = new Map(stocks.map((s) => [s.productId, s]));
  const eligible = orders.filter(
    (o) => o.status !== "CANCELLED" && !o.mergedIntoId,
  );
  const allReceived = new Map<string, bigint>();
  for (const o of eligible.filter((o) => !o.isPrivate))
    for (const l of o.lines)
      if (l.productId && l.receivedQuantity !== null)
        allReceived.set(
          l.productId,
          (allReceived.get(l.productId) || 0n) +
            units(l.receivedQuantity, l.unitsPerEntry),
        );
  type Build = {
    row: ExecutiveRow;
    ordered: bigint;
    received: bigint;
    cost: bigint;
  };
  const builds = new Map<string, Build>();
  function ensure(
    key: string,
    p: ExecutiveProduct | null,
    line: OrderRow["lines"][number] | null,
    isPrivate: boolean,
  ) {
    if (!builds.has(key)) {
      const balance = p && !isPrivate ? stock.get(p.id) : null;
      const opening = balance?.opening ?? null,
        remaining = balance?.remaining ?? null;
      const consumed =
        opening !== null && remaining !== null
          ? microsToDecimal(
              decimalToMicros(opening) +
                (balance?.receivedForConsumption !== undefined
                  ? decimalToMicros(balance.receivedForConsumption)
                  : allReceived.get(p!.id) || 0n) -
                decimalToMicros(remaining),
            )
          : null;
      builds.set(key, {
        row: {
          key,
          productId: p?.id ?? null,
          name: p?.name ?? line!.historyName,
          categoryName: p?.categoryName ?? line!.categoryName,
          unit: (
            p?.unit ?? (line!.unitsPerEntry !== "1" ? "units" : line!.unit)
          )
            .trim()
            .toUpperCase(),
          isPrivate,
          orders: [],
          ordered: "0",
          received: "0",
          opening,
          remaining,
          consumed,
          knownCost: "0.00",
          totalCost: "0.00",
          averageCost: null,
          missingPrices: 0,
          historyCategoryOrder:
            p?.historyCategoryOrder ?? line!.historyCategoryOrder,
          historyProductOrder:
            p?.historyProductOrder ?? line!.historyProductOrder,
        },
        ordered: 0n,
        received: 0n,
        cost: 0n,
      });
    }
    return builds.get(key)!;
  }
  for (const o of eligible.filter((o) =>
    selected.includes(o.isPrivate ? "private" : o.vendorId),
  )) {
    for (const l of o.lines) {
      const p =
        !o.isPrivate && l.productId ? (catalog.get(l.productId) ?? null) : null;
      const key = p
        ? p.id
        : JSON.stringify([
            o.isPrivate ? "private" : "archived",
            l.productName,
            l.categoryName,
            l.unit,
            l.unitsPerEntry,
          ]);
      const b = ensure(key, p, l, o.isPrivate);
      if (
        (decimalToMicros(l.orderedQuantity) > 0n ||
          (l.receivedQuantity !== null &&
            decimalToMicros(l.receivedQuantity) > 0n)) &&
        !b.row.orders.includes(o.id)
      )
        b.row.orders.push(o.id);
      b.ordered += units(l.orderedQuantity, l.unitsPerEntry);
      if (l.receivedQuantity !== null) {
        const quantity = decimalToMicros(l.receivedQuantity);
        b.received += units(l.receivedQuantity, l.unitsPerEntry);
        if (quantity > 0n) {
          if (l.unitPrice === null) b.row.missingPrices++;
          else
            b.cost += roundDivide(
              quantity * decimalToMicros(l.unitPrice) * 100n,
              SCALE * SCALE,
            );
        }
      }
    }
  }
  for (const p of products)
    if (
      (p.active ||
        Number(stock.get(p.id)?.opening || 0) !== 0 ||
        Number(stock.get(p.id)?.remaining || 0) !== 0) &&
      p.vendorId &&
      selected.includes(p.vendorId)
    )
      ensure(p.id, p, null, false);
  return [...builds.values()]
    .map((b) => ({
      ...b.row,
      ordered: microsToDecimal(b.ordered),
      received: microsToDecimal(b.received),
      knownCost: money(b.cost),
      totalCost: b.row.missingPrices ? null : money(b.cost),
      averageCost:
        b.received > 0n && !b.row.missingPrices
          ? money(roundDivide(b.cost * SCALE, b.received))
          : null,
    }))
    .sort(
      (a, b) =>
        Number(a.isPrivate) - Number(b.isPrivate) ||
        compareHistoryProducts(
          { ...a, historySortName: a.name, historyName: a.name },
          { ...b, historySortName: b.name, historyName: b.name },
        ),
    );
}

export function executiveSubtotal(rows: ExecutiveRow[]) {
  const sum = (
    field: "ordered" | "received" | "opening" | "remaining" | "consumed",
  ) => {
    const totals = new Map<string, bigint>();
    let missing = false;
    for (const row of rows) {
      if (row[field] === null) {
        missing = true;
        continue;
      }
      totals.set(
        row.unit,
        (totals.get(row.unit) || 0n) + decimalToMicros(row[field]!),
      );
    }
    return {
      total: microsToDecimal(
        [...totals.values()].reduce((sum, value) => sum + value, 0n),
      ),
      values: [...totals].map(([unit, n]) => ({
        unit,
        quantity: microsToDecimal(n),
      })),
      missing,
    };
  };
  const cost = rows.reduce(
    (n, row) => n + decimalToMicros(row.knownCost) / 10000n,
    0n,
  );
  const received = rows.reduce(
    (n, row) => n + decimalToMicros(row.received),
    0n,
  );
  const missing = rows.some((row) => row.totalCost === null);
  return {
    orders: new Set(rows.flatMap((row) => row.orders)).size,
    ordered: sum("ordered"),
    received: sum("received"),
    opening: sum("opening"),
    remaining: sum("remaining"),
    consumed: sum("consumed"),
    knownCost: money(cost),
    totalCost: missing ? null : money(cost),
    averageCost:
      !missing && received > 0n && new Set(rows.map((r) => r.unit)).size === 1
        ? money(roundDivide(cost * SCALE, received))
        : null,
  };
}

/** Unknown inventory boundaries remain visible for review rather than being assumed zero. */
export function hasExecutiveValues(row: ExecutiveRow) {
  if (row.orders.length || row.missingPrices) return true;
  if (
    !row.isPrivate &&
    [row.opening, row.remaining, row.consumed].some((value) => value === null)
  )
    return true;
  return [
    row.ordered,
    row.received,
    row.opening,
    row.remaining,
    row.consumed,
    row.knownCost,
    row.totalCost,
  ].some((value) => value !== null && decimalToMicros(value) !== 0n);
}
