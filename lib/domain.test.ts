import { describe, expect, it } from "vitest";
import {
  duplicateNormalizedValues,
  validateProductUnits,
  visibleCategories,
} from "./domain";

describe("category behavior", () => {
  it("shows active categories in stable display order", () => {
    expect(
      visibleCategories([
        { id: "3", name: "Wine", displayOrder: 2, active: true },
        { id: "1", name: "Hidden", displayOrder: 0, active: false },
        { id: "2", name: "Beer", displayOrder: 1, active: true },
      ]).map((category) => category.name),
    ).toEqual(["Beer", "Wine"]);
  });

  it("detects normalized category and location collisions", () => {
    expect(
      duplicateNormalizedValues(["Bar", " Starter Shack ", "bar"]),
    ).toEqual(["bar"]);
  });
});

describe("product unit relationships", () => {
  it("requires a positive conversion when a purchase unit exists", () => {
    expect(
      validateProductUnits({
        purchaseUnit: "CASE",
        unitsPerPurchaseUnit: 0,
        allowFractionalStock: false,
        quantityScale: 0,
      }),
    ).toMatch(/positive conversion/);
    expect(
      validateProductUnits({
        purchaseUnit: "CASE",
        unitsPerPurchaseUnit: 24,
        allowFractionalStock: false,
        quantityScale: 0,
      }),
    ).toBeNull();
  });

  it("keeps integer products at scale zero", () => {
    expect(
      validateProductUnits({
        purchaseUnit: null,
        unitsPerPurchaseUnit: null,
        allowFractionalStock: false,
        quantityScale: 3,
      }),
    ).toMatch(/scale 0/);
    expect(
      validateProductUnits({
        purchaseUnit: null,
        unitsPerPurchaseUnit: null,
        allowFractionalStock: true,
        quantityScale: 0,
      }),
    ).toMatch(/positive quantity scale/);
  });
});
