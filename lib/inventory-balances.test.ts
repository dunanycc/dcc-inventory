import { describe, expect, it } from "vitest";
import { combineMovementSums, formatStockQuantity } from "./inventory-balances";

describe("inventory balances", () => {
  it("calculates stock into a Location minus stock out without a mutable balance", () => {
    const balances = combineMovementSums(
      [
        { productId: "lager", quantity: "24.000000" },
        { productId: "wine", quantity: "6.5" },
      ],
      [
        { productId: "lager", quantity: "5" },
        { productId: "wine", quantity: "1.25" },
      ],
    );
    expect(balances.get("lager")).toBe("19");
    expect(balances.get("wine")).toBe("5.25");
  });

  it("keeps negative tracked balances visible and formats by Product precision", () => {
    expect(
      combineMovementSums([], [{ productId: "lager", quantity: "2" }]).get(
        "lager",
      ),
    ).toBe("-2");
    expect(formatStockQuantity("5.250000", 2)).toBe("5.25");
  });
});
