import { describe, expect, it } from "vitest";
import {
  historyLineKey,
  historyReceivedQuantity,
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
