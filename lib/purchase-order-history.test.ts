import { describe, expect, it } from "vitest";
import {
  historyLineKey,
  historyReceivedQuantity,
  compareHistoryProducts,
} from "./purchase-order-history";

const legacy = {
  productId: "guinness",
  productName: "Guinness (6x4)",
  categoryName: "Beer",
  unit: "CAN",
  unitsPerEntry: "1",
  receivedQuantity: "48",
  historyCaseSize: "24",
};
describe("case quantities in order history", () => {
  it("maps 48 cans to two cases and groups aliases of the same product", () => {
    const current = {
      ...legacy,
      productName: "Guinness cans (6x4)",
      unit: "Case",
      unitsPerEntry: "24",
      receivedQuantity: "2",
    };
    expect(historyLineKey(legacy)).toBe(historyLineKey(current));
    expect(historyReceivedQuantity(legacy)).toBe("2");
    expect(historyReceivedQuantity(current)).toBe("2");
  });
  it("keeps different products separate and preserves pending quantities", () => {
    expect(historyLineKey({ ...legacy, productId: "other" })).not.toBe(
      historyLineKey(legacy),
    );
    expect(
      historyReceivedQuantity({ ...legacy, receivedQuantity: null }),
    ).toBeNull();
  });
  it("retains distinct wine brands and manual private labels", () => {
    const wine = { ...legacy, categoryName: "Wine", historyCaseSize: null };
    expect(historyLineKey(wine)).not.toBe(
      historyLineKey({ ...wine, productName: "Another brand" }),
    );
    expect(historyReceivedQuantity(wine)).toBe("48");
  });
});

describe("history follows catalog ordering", () => {
  const row = {
    categoryName: "Wine",
    historyCategoryOrder: 0,
    historyProductOrder: 0,
    historySortName: "White wine",
    productId: "white",
    historyName: "White wine",
  };
  it("uses category and product positions instead of alphabetical headings", () => {
    const liquor = {
      ...row,
      categoryName: "Hard Liquor",
      historyCategoryOrder: 1,
      historyName: "Vodka",
    };
    const red = {
      ...row,
      productId: "red",
      historySortName: "Red wine",
      historyName: "Red wine",
      historyProductOrder: 1,
    };
    expect(
      [liquor, red, row].sort(compareHistoryProducts).map((r) => r.historyName),
    ).toEqual(["White wine", "Red wine", "Vodka"]);
  });
  it("keeps archived labels after mapped products within their category", () => {
    const archived = {
      ...row,
      productId: null,
      historyProductOrder: Number.MAX_SAFE_INTEGER,
      historySortName: "Archived",
      historyName: "Archived",
    };
    const liquor = {
      ...row,
      categoryName: "Hard Liquor",
      historyCategoryOrder: 1,
      historyName: "Vodka",
    };
    expect(
      [liquor, archived, row]
        .sort(compareHistoryProducts)
        .map((r) => r.historyName),
    ).toEqual(["White wine", "Archived", "Vodka"]);
  });
  it("uses catalog names to break equal product positions while retaining brand labels", () => {
    const brand = { ...row, historyName: "A brand label" };
    const red = {
      ...row,
      productId: "red",
      historySortName: "Red wine",
      historyName: "Z brand label",
    };
    expect(
      [brand, red].sort(compareHistoryProducts).map((r) => r.productId),
    ).toEqual(["red", "white"]);
  });
});
