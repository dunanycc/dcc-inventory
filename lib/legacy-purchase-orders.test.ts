import { describe, it, expect } from "vitest";
import { planLegacyOrders } from "./legacy-purchase-orders";
const header = [
  "Orderd",
  "Order GUID",
  "Order Date",
  "Product GUID",
  "Catgegory",
  "Name",
  "Ordered",
  "Recieved",
  "Status",
  "Column 1",
];
const products = [
  ["ID", "Unit Format"],
  ["wine", "BOTTLE"],
  ["mixed", "CAN"],
];
const wine = [
  "2026-20",
  "order-a",
  "2026-07-01",
  "wine",
  "Wine",
  "Red",
  12,
  10,
  "Received",
  "",
];
const mixed = [
  "2026-20",
  "order-a",
  "2026-07-01",
  "mixed",
  "Mixed Drinks",
  "Mixed",
  24,
  24,
  "Received",
  "",
];
describe("legacy purchase planning", () => {
  it("splits one legacy order by historical vendor, preserving quantities and identities", () => {
    const plan = planLegacyOrders([header, wine, mixed], products);
    expect(plan.errors).toEqual([]);
    expect(plan.orders).toHaveLength(2);
    expect(
      plan.orders.find((o) => o.vendorName === "SAQ")!.lines[0],
    ).toMatchObject({
      orderedQuantity: "12",
      receivedQuantity: "10",
      unit: "BOTTLE",
    });
    expect(
      plan.orders.find((o) => o.vendorName === "Beer")!.lines[0].productName,
    ).toBe("Mixed");
    expect(new Set(plan.orders.map((o) => o.sourceId)).size).toBe(2);
  });
  it("excludes cancelled orders and keeps duplicate labels with different GUIDs", () => {
    const plan = planLegacyOrders(
      [
        header,
        wine,
        [...wine.slice(0, 1), "order-b", ...wine.slice(2)],
        [
          "2026-99",
          "cancelled",
          "2026-08-01",
          "wine",
          "Wine",
          "Red",
          1,
          0,
          "Cancelled",
          "",
        ],
      ],
      products,
    );
    expect(plan.orders).toHaveLength(2);
    expect(plan.cancelledOrders).toBe(1);
  });
  it("does not silently replace missing received values with zero", () => {
    const row = [...wine];
    row[7] = "";
    expect(planLegacyOrders([header, row], products).errors.join()).toContain(
      "invalid quantity",
    );
  });
  it("flags mismatched source dates without making up an order date", () => {
    const row = [...wine];
    row[2] = "invalid";
    const plan = planLegacyOrders([header, row], products);
    expect(plan.orders[0].date).toBeNull();
    expect(plan.orders[0].warnings.length).toBeGreaterThan(0);
  });
});
