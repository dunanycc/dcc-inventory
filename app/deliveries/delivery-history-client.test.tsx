import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryHistory } from "./delivery-history-client";

vi.mock("@/app/(protected)/deliveries/actions", () => ({
  updateDeliveryAction: vi.fn(),
}));
afterEach(cleanup);

describe("DeliveryHistory", () => {
  it("opens an editor with submitted values and allows a line to be removed", () => {
    render(
      <DeliveryHistory
        canEdit
        vendors={[{ id: "vendor", name: "Molson" }]}
        categories={[
          {
            id: "beer",
            name: "Beer",
            products: [
              {
                id: "guinness",
                name: "Guinness",
                stockUnit: "CAN",
                quantityScale: 0,
                purchaseUnit: "CASE",
                unitsPerPurchaseUnit: "24",
              },
              {
                id: "harp",
                name: "Harp",
                stockUnit: "CAN",
                quantityScale: 0,
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
              },
            ],
          },
        ]}
        deliveries={[
          {
            id: "delivery",
            deliveryDate: "2026-09-01",
            vendorId: "vendor",
            vendorName: "Molson",
            notes: "Dock delivery",
            recordedBy: "Jayem",
            recordedAt: "2026-09-01T15:00:00.000Z",
            lines: [
              {
                id: "line",
                productId: "guinness",
                productName: "Guinness",
                entryQuantity: "2",
                quantity: "48",
                purchaseUnit: "CASE",
                unitsPerPurchaseUnit: "24",
                unit: "CAN",
                active: true,
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Delivery" }));
    expect(
      screen.getByRole("dialog", { name: "Edit Delivery" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Vendor")).toHaveValue("vendor");
    expect(
      screen.getByLabelText("Delivered quantity for Guinness"),
    ).toHaveValue(2);
    expect(screen.getByLabelText("Delivered quantity for Harp")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("Delivered quantity for Harp"), {
      target: { value: "3" },
    });
    expect(screen.getByLabelText("Delivered quantity for Harp")).toHaveValue(3);
    fireEvent.change(screen.getByLabelText("Delivered quantity for Guinness"), {
      target: { value: "0" },
    });
    expect(
      screen.getByLabelText("Delivered quantity for Guinness"),
    ).toHaveValue(0);
    expect(
      screen.getByRole("button", { name: "Save Delivery" }),
    ).toBeInTheDocument();
  });

  it("groups editor products by category and highlights lines with a quantity", () => {
    render(
      <DeliveryHistory
        canEdit
        vendors={[{ id: "vendor", name: "Molson" }]}
        categories={[
          {
            id: "wine",
            name: "Wine",
            products: [
              {
                id: "red",
                name: "Red wine",
                stockUnit: "BOTTLE",
                quantityScale: 0,
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
              },
            ],
          },
          {
            id: "beer",
            name: "Beer",
            products: [
              {
                id: "guinness",
                name: "Guinness",
                stockUnit: "CAN",
                quantityScale: 0,
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
              },
            ],
          },
        ]}
        deliveries={[
          {
            id: "delivery",
            deliveryDate: "2026-09-01",
            vendorId: "vendor",
            vendorName: "Molson",
            notes: null,
            recordedBy: "Jayem",
            recordedAt: "2026-09-01T15:00:00.000Z",
            lines: [
              {
                id: "line",
                productId: "guinness",
                productName: "Guinness",
                entryQuantity: "6",
                quantity: "6",
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
                unit: "CAN",
                active: true,
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Delivery" }));
    // Defaults to the category that already has a delivered quantity.
    expect(
      screen.getByLabelText("Delivered quantity for Guinness"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Delivered quantity for Red wine"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Delivered quantity for Guinness").closest("label"),
    ).toHaveClass("has-quantity");
    fireEvent.click(screen.getByRole("tab", { name: "Wine" }));
    expect(
      screen.getByLabelText("Delivered quantity for Red wine"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Delivered quantity for Guinness"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Delivered quantity for Red wine").closest("label"),
    ).not.toHaveClass("has-quantity");
  });
});
