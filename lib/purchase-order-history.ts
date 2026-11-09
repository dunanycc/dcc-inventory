export function caseHistoryCategory(category: string) {
  return ["beer", "non-alcohol beer", "mixed drinks"].includes(
    category.trim().toLowerCase(),
  );
}

type HistorySortRow = {
  categoryName: string;
  historyCategoryOrder: number;
  historyProductOrder: number;
  historySortName: string;
  productId: string | null;
  historyName: string;
};

/** Match the catalog's category/product ordering; archived labels follow mapped products. */
export function compareHistoryProducts(a: HistorySortRow, b: HistorySortRow) {
  return (
    a.historyCategoryOrder - b.historyCategoryOrder ||
    a.categoryName.localeCompare(b.categoryName) ||
    a.historyProductOrder - b.historyProductOrder ||
    a.historySortName.localeCompare(b.historySortName) ||
    (a.productId ?? "").localeCompare(b.productId ?? "") ||
    a.historyName.localeCompare(b.historyName)
  );
}

type HistoryLine = {
  productId: string | null;
  productName: string;
  categoryName: string;
  unit: string;
  unitsPerEntry: string;
  receivedQuantity: string | null;
  historyCaseSize: string | null;
};

export function historyLineKey(line: HistoryLine) {
  if (line.productId && line.historyCaseSize)
    return JSON.stringify([line.productId, "Case", line.historyCaseSize]);
  return JSON.stringify([line.productName, line.categoryName, line.unit]);
}

/** Convert stock-unit snapshots to cases once; case-based snapshots retain their value. */
export function historyReceivedQuantity(line: HistoryLine) {
  if (line.receivedQuantity === null) return null;
  if (!line.historyCaseSize) return line.receivedQuantity;
  return String(
    (Number(line.receivedQuantity) * Number(line.unitsPerEntry)) /
      Number(line.historyCaseSize),
  );
}
