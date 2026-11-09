import { describe, it, expect } from "vitest";
import {
  executiveRows,
  executiveSubtotal,
  type ExecutiveProduct,
} from "./executive-report";
import type { OrderRow } from "./purchase-order-queries";
const product: ExecutiveProduct = {
  id: "beer",
  name: "Lager",
  vendorId: "vendor",
  categoryName: "Beer",
  unit: "CAN",
  active: true,
  historyCategoryOrder: 3,
  historyProductOrder: 1,
};
function order(
  id: string,
  options: Partial<OrderRow> = {},
  lines: object[] = [{}],
): OrderRow {
  return {
    id,
    status: "RECEIVED",
    isPrivate: false,
    vendorId: "vendor",
    mergedIntoId: null,
    ...options,
    lines: lines.map((l) => ({
      id: "line",
      productId: "beer",
      productName: "Old Lager",
      categoryName: "Beer",
      unit: "CASE",
      unitsPerEntry: "24",
      orderedQuantity: "2",
      receivedQuantity: "2",
      unitPrice: "48.00",
      historyName: "Old Lager",
      historyCategoryOrder: 3,
      historyProductOrder: 1,
      ...l,
    })),
  } as unknown as OrderRow;
}
describe("executive report", () => {
  it("converts saved case sizes and weights prices per can while combining legacy names", () => {
    const rows = executiveRows(
      [
        order("one"),
        order("two", {}, [
          {
            productName: "Other label",
            unitsPerEntry: "12",
            orderedQuantity: "1",
            receivedQuantity: "1",
            unitPrice: "36",
          },
        ]),
      ],
      [product],
      [{ productId: "beer", opening: "10", remaining: "20" }],
      ["vendor"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Lager",
      orders: ["one", "two"],
      received: "60",
      ordered: "60",
      consumed: "50",
      remaining: "20",
      totalCost: "132.00",
      averageCost: "2.20",
    });
  });
  it("counts distinct orders per product and subtotal, excluding cancelled and merged records", () => {
    const other = { ...product, id: "other", name: "Ale" };
    const rows = executiveRows(
      [
        order("one", {}, [{}, { productId: "other" }]),
        order("cancel", { status: "CANCELLED" }),
        order("merged", { mergedIntoId: "one" }),
      ],
      [product, other],
      [],
      ["vendor"],
    );
    expect(rows.map((r) => r.orders.length)).toEqual([1, 1]);
    expect(executiveSubtotal(rows)).toMatchObject({
      orders: 1,
      totalCost: "192.00",
    });
  });
  it("keeps unknown costs unavailable, accepts zero cost, and ignores pending receipts", () => {
    const rows = executiveRows(
      [
        order("priced", {}, [
          { receivedQuantity: "1", orderedQuantity: "1", unitPrice: "0" },
        ]),
        order("unpriced", {}, [
          { receivedQuantity: "1", orderedQuantity: "1", unitPrice: null },
        ]),
        order("pending", { status: "PENDING" }, [
          { receivedQuantity: null, orderedQuantity: "3", unitPrice: null },
        ]),
      ],
      [product],
      [],
      ["vendor"],
    );
    expect(rows[0]).toMatchObject({
      ordered: "120",
      received: "48",
      knownCost: "0.00",
      totalCost: null,
      averageCost: null,
      missingPrices: 1,
      consumed: null,
    });
  });
  it("separates private purchases from inventory, and honors vendor filters", () => {
    const rows = executiveRows(
      [order("club"), order("private", { isPrivate: true })],
      [product],
      [{ productId: "beer", opening: "2", remaining: "1" }],
      ["private"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isPrivate: true,
      productId: null,
      remaining: null,
      opening: null,
      consumed: null,
      totalCost: "96.00",
    });
  });
  it("does not duplicate whole-club stock when purchases span two vendors", () => {
    const rows = executiveRows(
      [order("one"), order("two", { vendorId: "other-vendor" })],
      [product],
      [{ productId: "beer", opening: "0", remaining: "20" }],
      ["other-vendor"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      received: "48",
      consumed: "76",
      remaining: "20",
    });
  });
  it("marks incomplete stock totals and retains negative consumption for review", () => {
    const rows = executiveRows(
      [],
      [product],
      [{ productId: "beer", opening: "0", remaining: "2" }],
      ["vendor"],
    );
    expect(rows[0].consumed).toBe("-2");
    const missing = executiveRows([], [product], [], ["vendor"]);
    expect(executiveSubtotal(missing).remaining.missing).toBe(true);
  });
  it("does not count zero-quantity legacy lines as product orders", () => {
    const rows = executiveRows(
      [
        order("zero", {}, [
          { orderedQuantity: "0", receivedQuantity: "0", unitPrice: null },
        ]),
      ],
      [product],
      [],
      ["vendor"],
    );
    expect(rows[0].orders).toHaveLength(0);
    expect(rows[0].totalCost).toBe("0.00");
  });
});
