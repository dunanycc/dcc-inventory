import { describe, it, expect } from "vitest";
import {
  money,
  orderDate,
  quantity,
  receiptTotals,
  reordered,
  historicalVendor,
} from "./purchase-order";
describe("purchase order rules", () => {
  it("uses received quantities and cent rounding with manual taxes", () => {
    expect(
      receiptTotals(
        [
          { quantity: "3", price: "12.99" },
          { quantity: "0.5", price: "20.01" },
        ],
        false,
        "2.45",
        "4.90",
      ),
    ).toEqual({ subtotal: "48.98", gst: "2.45", pst: "4.90", total: "56.33" });
  });
  it("does not add disabled taxes to tax-inclusive prices", () =>
    expect(
      receiptTotals([{ quantity: "2", price: "10" }], true, "9", "9").total,
    ).toBe("20.00"));
  it("distinguishes an unknown historical price from zero", () => {
    expect(
      receiptTotals([{ quantity: "1", price: null }], true).total,
    ).toBeNull();
    expect(receiptTotals([{ quantity: "1", price: "0" }], true).total).toBe(
      "0.00",
    );
    expect(receiptTotals([{ quantity: "0", price: null }], true).total).toBe(
      "0.00",
    );
  });
  it("rejects negative values, scientific notation, excessive precision, and invalid dates", () => {
    for (const v of ["-1", "1e3", "NaN", "1.001"])
      expect(() => money(v)).toThrow();
    for (const v of ["-1", "", "0.0000001"])
      expect(() => quantity(v)).toThrow();
    expect(() => orderDate("2026-02-30")).toThrow();
  });
  it("moves whole orders in both directions without losing another order", () => {
    expect(reordered(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(reordered(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(() => reordered(["a", "b"], "a", "outside")).toThrow();
  });
  it("preserves the historical Mixed Drinks vendor exception", () => {
    expect(historicalVendor("Mixed Drinks")).toBe("Beer");
    expect(historicalVendor("Hard Liquor")).toBe("SAQ");
    expect(historicalVendor("Mixers & Misc")).toBe("Groceries");
    expect(historicalVendor("Unmapped")).toBeNull();
  });
});
