import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryHistory } from "./delivery-history-client";

vi.mock("@/app/(protected)/deliveries/actions", () => ({ updateDeliveryAction: vi.fn() }));
afterEach(cleanup);

describe("DeliveryHistory", () => {
  it("opens an editor with submitted values and allows a line to be removed", () => {
    render(<DeliveryHistory canEdit vendors={[{ id: "vendor", name: "Molson" }]} products={[{ id: "guinness", name: "Guinness", purchaseUnit: "CASE", unitsPerPurchaseUnit: "24", unit: "CAN" }, { id: "harp", name: "Harp", purchaseUnit: null, unitsPerPurchaseUnit: null, unit: "CAN" }]} deliveries={[{ id: "delivery", deliveryDate: "2026-09-01", vendorId: "vendor", vendorName: "Molson", notes: "Dock delivery", recordedBy: "Jayem", recordedAt: "2026-09-01T15:00:00.000Z", lines: [{ id: "line", productId: "guinness", productName: "Guinness", entryQuantity: "2", quantity: "48", purchaseUnit: "CASE", unitsPerPurchaseUnit: "24", unit: "CAN", active: true }] }]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Delivery" }));
    expect(screen.getByRole("dialog", { name: "Edit Delivery" })).toBeInTheDocument();
    expect(screen.getByLabelText("Vendor")).toHaveValue("vendor");
    expect(screen.getByLabelText("Delivered quantity for Guinness")).toHaveValue(2);
    expect(screen.getByLabelText("Delivered quantity for Harp")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("Delivered quantity for Harp"), { target: { value: "3" } });
    expect(screen.getByLabelText("Delivered quantity for Harp")).toHaveValue(3);
    fireEvent.change(screen.getByLabelText("Delivered quantity for Guinness"), { target: { value: "0" } });
    expect(screen.getByLabelText("Delivered quantity for Guinness")).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Save Delivery" })).toBeInTheDocument();
  });
});
