import { describe, it, expect } from "vitest";
import {
  inventoryQuantityScale,
  wholeQuantity,
  validateReceivedQuantity,
} from "./quantity-policy";
import { normalizeStockQuantity } from "./inventory-movement";
import { normalizeCountedQuantity } from "./inventory-count";
import { calculateDeliveryQuantity } from "./delivery";
describe("site quantity precision", () => {
  const liquor = {
    allowFractionalStock: true,
    quantityScale: 6,
    category: { name: "Hard Liquor" },
  };
  const wine = { ...liquor, category: { name: "Wine" } };
  it("limits inventory decimals to Hard Liquor and two places", () => {
    expect(inventoryQuantityScale(liquor)).toBe(2);
    expect(inventoryQuantityScale(wine)).toBe(0);
    expect(normalizeStockQuantity("1.25", liquor).quantity).toBe("1.25");
    expect(() => normalizeStockQuantity("1.251", liquor)).toThrow();
    expect(() => normalizeStockQuantity("1.25", wine)).toThrow();
    expect(normalizeCountedQuantity("0.25", liquor)).toBe("0.25");
    expect(() => normalizeCountedQuantity("0.251", liquor)).toThrow();
    expect(() => normalizeCountedQuantity("1.5", wine)).toThrow();
  });
  it("requires whole purchasing quantities even if half a case converts to whole stock", () => {
    expect(() => wholeQuantity("1.5")).toThrow();
    expect(() =>
      calculateDeliveryQuantity("0.5", {
        ...wine,
        purchaseUnit: "CASE",
        unitsPerPurchaseUnit: "12",
      }),
    ).toThrow();
    expect(
      calculateDeliveryQuantity("1.25", {
        ...liquor,
        purchaseUnit: null,
        unitsPerPurchaseUnit: null,
      }).stockQuantity,
    ).toBe("1.25");
  });
  it("receives whole counts except for Hard Liquor inventory units", () => {
    const line = { categoryName: "Hard Liquor", unitsPerEntry: "1" };
    expect(validateReceivedQuantity("1.25", line, false)).toBe("1.25");
    expect(() => validateReceivedQuantity("1.251", line, false)).toThrow();
    expect(() => validateReceivedQuantity("1.25", line, true)).toThrow();
    expect(() =>
      validateReceivedQuantity(
        "1.25",
        { ...line, categoryName: "Beer" },
        false,
      ),
    ).toThrow();
    expect(() =>
      validateReceivedQuantity("1.25", { ...line, unitsPerEntry: "12" }, false),
    ).toThrow();
  });
});
