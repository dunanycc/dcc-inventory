import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  HistoryWorkspace,
  type ProductHistory,
} from "@/app/history/history-client";
import { getSeasonalConsumptionReport } from "@/lib/seasonal-consumption";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function HistoryPage() {
  await connection();
  await requireInventoryWorkspaceUser();
  const currentYear = new Date().getUTCFullYear();
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
        categories={categories}
        products={products}
        seasons={seasons}
      />
    </>
  );
}
