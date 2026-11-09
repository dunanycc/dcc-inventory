import { prisma } from "@/lib/prisma";
import { orderRows } from "@/lib/purchase-order-queries";
import { executiveSources } from "@/lib/executive-report-query";
import { ExecutiveView } from "@/app/history/executive-view";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  HistoryWorkspace,
  type ProductHistory,
} from "@/app/history/history-client";
import { getSeasonalConsumptionReport } from "@/lib/seasonal-consumption";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string }>;
}) {
  await connection();
  await requireInventoryWorkspaceUser();
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Toronto",
      year: "numeric",
    }).format(new Date()),
  );
  const query = await searchParams;
  const year =
    /^\d{4}$/.test(query.year || "") &&
    Number(query.year) >= 1900 &&
    Number(query.year) <= 9998
      ? Number(query.year)
      : currentYear;
  const [executiveOrders, sources, vendors, orderYears] = await Promise.all([
    orderRows({ year }),
    executiveSources(year, currentYear),
    prisma.vendor.findMany({
      select: { id: true, name: true },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      distinct: ["year"],
      select: { year: true },
    }),
  ]);
  const years = [
    ...new Set([currentYear, year, ...orderYears.map((o) => o.year)]),
  ].sort((a, b) => b - a);
  const seasons = [currentYear - 1, currentYear];
  const rows = await getSeasonalConsumptionReport(seasons);

  const byProduct = new Map<string, ProductHistory>();
  for (const row of rows) {
    if (!byProduct.has(row.productId))
      byProduct.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        unitLabel: row.unitLabel,
        seasons: [],
      });
    byProduct.get(row.productId)!.seasons.push({
      season: row.season,
      startingQuantity: row.startingQuantity,
      startingSource: row.startingSource,
      deliveredQuantity: row.deliveredQuantity,
      endingQuantity: row.endingQuantity,
      endingSource: row.endingSource,
      consumedQuantity: row.consumedQuantity,
      incompleteReasons: row.incompleteReasons,
      yoyChange: row.yoyChange,
      yoyPercent: row.yoyPercent,
    });
  }
  // getSeasonalConsumptionReport already orders products by the same
  // Category/Product displayOrder used site-wide — preserve that order
  // rather than re-sorting alphabetically.
  const products = [...byProduct.values()];
  const categories = [...new Set(products.map((p) => p.categoryName))];

  return (
    <>
      <PageHeading
        eyebrow="Inventory"
        title="Stock History"
        description={`How much of each Product was consumed this season (Season ${seasons[1]}) compared with last season (Season ${seasons[0]}), using accepted counts and delivery history.`}
      />
      <HistoryWorkspace
        initialView={query.view}
        executive={
          <ExecutiveView
            orders={executiveOrders}
            products={sources.products}
            stocks={sources.stocks}
            vendors={vendors}
            year={year}
            years={years}
            currentYear={currentYear}
          />
        }
        categories={categories}
        products={products}
        seasons={seasons}
      />
    </>
  );
}
