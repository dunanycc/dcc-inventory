import { decimalToMicros, microsToDecimal } from "./inventory-balances";

// A "season" is a calendar year. Within a year, an accepted count dated
// January-June is treated as that season's starting snapshot; one dated
// July-December is treated as that season's ending snapshot. This mirrors
// how the club actually operates (summer season, counted at open/close).
export function classifyCountDate(date: Date): {
  year: number;
  role: "start" | "end";
} {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return { year, role: month <= 5 ? "start" : "end" };
}

export type AcceptedCountLineInput = {
  countId: string;
  locationId: string;
  countDate: Date;
  countedQuantity: string;
};

export type SnapshotBucket = {
  quantity: string;
  countIds: string[];
};

// Combines accepted counts across every Location (whole-club) into one
// snapshot per (year, start|end) bucket, taking the latest count per
// Location within a bucket and summing across Locations. A Location with
// no count in a bucket simply contributes nothing to that bucket, rather
// than blocking the whole club-wide figure (the legacy 2025 workbook only
// ever covered the Bar; Starter Shack has no history to combine).
export function combineAcceptedSnapshots(
  lines: readonly AcceptedCountLineInput[],
): Map<string, SnapshotBucket> {
  const latestPerLocation = new Map<
    string,
    Map<string, { quantity: string; countId: string; countDate: Date }>
  >();
  for (const line of lines) {
    const { year, role } = classifyCountDate(line.countDate);
    const key = `${year}-${role}`;
    if (!latestPerLocation.has(line.locationId))
      latestPerLocation.set(line.locationId, new Map());
    const perLocation = latestPerLocation.get(line.locationId)!;
    const existing = perLocation.get(key);
    if (!existing || line.countDate > existing.countDate)
      perLocation.set(key, {
        quantity: line.countedQuantity,
        countId: line.countId,
        countDate: line.countDate,
      });
  }
  const buckets = new Map<
    string,
    { quantityMicros: bigint; countIds: string[] }
  >();
  for (const perLocation of latestPerLocation.values()) {
    for (const [key, snapshot] of perLocation) {
      if (!buckets.has(key))
        buckets.set(key, { quantityMicros: BigInt(0), countIds: [] });
      const bucket = buckets.get(key)!;
      bucket.quantityMicros += decimalToMicros(snapshot.quantity);
      bucket.countIds.push(snapshot.countId);
    }
  }
  return new Map(
    [...buckets].map(([key, value]) => [
      key,
      {
        quantity: microsToDecimal(value.quantityMicros),
        countIds: value.countIds,
      },
    ]),
  );
}

export type QuantitySource = "count" | "carry-forward" | "missing";

export type SeasonBoundary = {
  quantity: string | null;
  source: QuantitySource;
  countIds: string[];
};

// Starting quantity for a season prefers a direct count dated in that
// season's start window; failing that, it falls back to the prior
// season's ending count ("2025 ending inventory is also the 2026
// starting inventory"). Ending quantity only ever comes from a direct
// count dated in that season's end window — there is no sensible
// carry-forward for an ending balance.
export function resolveSeasonBoundaries(
  buckets: Map<string, SnapshotBucket>,
  year: number,
): { starting: SeasonBoundary; ending: SeasonBoundary } {
  const directStart = buckets.get(`${year}-start`);
  const priorEnd = buckets.get(`${year - 1}-end`);
  const starting: SeasonBoundary = directStart
    ? {
        quantity: directStart.quantity,
        source: "count",
        countIds: directStart.countIds,
      }
    : priorEnd
      ? {
          quantity: priorEnd.quantity,
          source: "carry-forward",
          countIds: priorEnd.countIds,
        }
      : { quantity: null, source: "missing", countIds: [] };
  const directEnd = buckets.get(`${year}-end`);
  const ending: SeasonBoundary = directEnd
    ? {
        quantity: directEnd.quantity,
        source: "count",
        countIds: directEnd.countIds,
      }
    : { quantity: null, source: "missing", countIds: [] };
  return { starting, ending };
}

export type ConsumptionResult = {
  consumedQuantity: string | null;
  incompleteReasons: string[];
};

// Consumption = Starting + Delivered - Ending, using exact BigInt-backed
// decimal arithmetic throughout (never JS floating point) so stock
// quantities never drift.
export function calculateConsumption(input: {
  startingQuantity: string | null;
  deliveredQuantity: string;
  endingQuantity: string | null;
}): ConsumptionResult {
  const reasons: string[] = [];
  if (input.startingQuantity === null)
    reasons.push("missing starting quantity");
  if (input.endingQuantity === null) reasons.push("missing ending quantity");
  if (reasons.length)
    return { consumedQuantity: null, incompleteReasons: reasons };
  const consumedMicros =
    decimalToMicros(input.startingQuantity!) +
    decimalToMicros(input.deliveredQuantity) -
    decimalToMicros(input.endingQuantity!);
  return {
    consumedQuantity: microsToDecimal(consumedMicros),
    incompleteReasons: [],
  };
}

export type YoyResult = {
  change: string | null;
  percent: number | null;
};

// change is exact decimal arithmetic; percent is a derived display value
// (not itself a stock quantity), so ordinary number division is fine here.
export function calculateYoy(
  current: string | null,
  prior: string | null,
): YoyResult {
  if (current === null || prior === null)
    return { change: null, percent: null };
  const changeMicros = decimalToMicros(current) - decimalToMicros(prior);
  const priorMicros = decimalToMicros(prior);
  const percent =
    priorMicros === BigInt(0)
      ? null
      : (Number(changeMicros) / Number(priorMicros)) * 100;
  return { change: microsToDecimal(changeMicros), percent };
}

export type ProductSeasonConsumption = {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  unitLabel: string;
  quantityScale: number;
  season: number;
  startingQuantity: string | null;
  startingSource: QuantitySource;
  deliveredQuantity: string;
  endingQuantity: string | null;
  endingSource: QuantitySource;
  consumedQuantity: string | null;
  incompleteReasons: string[];
  priorYearConsumed: string | null;
  yoyChange: string | null;
  yoyPercent: number | null;
};

function sumDecimals(values: readonly string[]) {
  return microsToDecimal(
    values.reduce((total, value) => total + decimalToMicros(value), BigInt(0)),
  );
}

// Reusable server-side seasonal-consumption service. Reads accepted counts
// (never draft/cancelled) and RECEIPT movements — the only two sources of
// truth currently in the database — and combines them whole-club (every
// Location summed) so internal Bar<->Starter Shack transfers, which are
// never RECEIPT movements, simply never enter the calculation.
export async function getSeasonalConsumptionReport(
  seasons?: readonly number[],
): Promise<ProductSeasonConsumption[]> {
  const { prisma } = await import("./prisma");
  const [products, countLines, receipts] = await Promise.all([
    prisma.product.findMany({
      // A deactivated Product is no longer being tracked going forward, so
      // it has nothing left to review here — matching how Counts and
      // Inventory already scope everything to active Products.
      where: { active: true },
      select: {
        id: true,
        name: true,
        stockUnit: true,
        stockUnitLabel: true,
        quantityScale: true,
        category: { select: { id: true, name: true, displayOrder: true } },
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { displayOrder: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.inventoryCountLine.findMany({
      where: {
        inventoryCount: { status: "ACCEPTED" },
        countedQuantity: { not: null },
      },
      select: {
        productId: true,
        countedQuantity: true,
        inventoryCount: {
          select: { id: true, locationId: true, countDate: true },
        },
      },
    }),
    prisma.inventoryMovement.findMany({
      where: { type: "RECEIPT" },
      select: { productId: true, quantity: true, occurredAt: true },
    }),
  ]);

  const countLinesByProduct = new Map<string, AcceptedCountLineInput[]>();
  for (const line of countLines) {
    if (!countLinesByProduct.has(line.productId))
      countLinesByProduct.set(line.productId, []);
    countLinesByProduct.get(line.productId)!.push({
      countId: line.inventoryCount.id,
      locationId: line.inventoryCount.locationId,
      countDate: line.inventoryCount.countDate,
      countedQuantity: line.countedQuantity!.toString(),
    });
  }
  const receiptsByProductYear = new Map<string, string[]>();
  const yearsWithData = new Set<number>();
  for (const movement of receipts) {
    const year = movement.occurredAt.getUTCFullYear();
    yearsWithData.add(year);
    const key = `${movement.productId}-${year}`;
    if (!receiptsByProductYear.has(key)) receiptsByProductYear.set(key, []);
    receiptsByProductYear.get(key)!.push(movement.quantity.toString());
  }
  for (const line of countLines)
    yearsWithData.add(line.inventoryCount.countDate.getUTCFullYear());

  const now = new Date();
  yearsWithData.add(now.getUTCFullYear());
  yearsWithData.add(now.getUTCFullYear() - 1);
  const allYears = [...yearsWithData].sort((a, b) => a - b);
  const requestedYears = seasons ? new Set(seasons) : null;

  const results: ProductSeasonConsumption[] = [];
  for (const product of products) {
    const unitLabel =
      product.stockUnit === "OTHER"
        ? (product.stockUnitLabel ?? "Other")
        : product.stockUnit;
    const buckets = combineAcceptedSnapshots(
      countLinesByProduct.get(product.id) ?? [],
    );
    const consumedByYear = new Map<number, string | null>();
    for (const year of allYears) {
      const { starting, ending } = resolveSeasonBoundaries(buckets, year);
      const delivered = sumDecimals(
        receiptsByProductYear.get(`${product.id}-${year}`) ?? [],
      );
      const { consumedQuantity, incompleteReasons } = calculateConsumption({
        startingQuantity: starting.quantity,
        deliveredQuantity: delivered,
        endingQuantity: ending.quantity,
      });
      consumedByYear.set(year, consumedQuantity);
      if (requestedYears && !requestedYears.has(year)) continue;
      const priorYearConsumed = consumedByYear.get(year - 1) ?? null;
      const { change, percent } = calculateYoy(
        consumedQuantity,
        priorYearConsumed,
      );
      results.push({
        productId: product.id,
        productName: product.name,
        categoryId: product.category.id,
        categoryName: product.category.name,
        unitLabel,
        quantityScale: product.quantityScale,
        season: year,
        startingQuantity: starting.quantity,
        startingSource: starting.source,
        deliveredQuantity: delivered,
        endingQuantity: ending.quantity,
        endingSource: ending.source,
        consumedQuantity,
        incompleteReasons,
        priorYearConsumed,
        yoyChange: change,
        yoyPercent: percent,
      });
    }
  }
  return results;
}
