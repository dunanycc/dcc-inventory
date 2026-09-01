import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FulfillmentQueue, NewStockRequest } from "./stock-request-client";

vi.mock("@/app/(protected)/requests/actions", () => ({ submitStockRequestAction: vi.fn(), fulfillStockRequestAction: vi.fn(), cancelStockRequestAction: vi.fn() }));
afterEach(cleanup);

describe("NewStockRequest", () => {
  it("shows horizontal category tabs and accumulates repeated additions", () => {
    render(<NewStockRequest categories={[{ id: "beer", name: "Beer", products: [{ id: "p1", name: "Sapporo", unit: "Can · 500 mL", quantityScale: 0 }] }]}/>);
    expect(screen.getByText("Beer")).toBeInTheDocument();
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity for Sapporo"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(12);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(24);
    expect(screen.getByRole("button", { name: "Submit Request" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Sapporo" }));
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
  });

  it("shows a full confirmation dialog before submitting", () => {
    render(<NewStockRequest categories={[{ id: "beer", name: "Beer", products: [{ id: "p1", name: "Sapporo", unit: "Can · 500 mL", quantityScale: 0 }] }]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(screen.getByRole("dialog", { name: "Confirm Request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Request" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close and Update" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(1);
  });
});

describe("FulfillmentQueue", () => {
  it("prefills Giving now with the outstanding requested quantity", () => {
    render(<FulfillmentQueue requests={[{ id: "request", requestedAt: "2026-09-01T12:00:00.000Z", requestedBy: "Jayem", status: "PARTIALLY_GIVEN", notes: null, lines: [{ id: "line", productName: "Guinness", unit: "Can · 440 mL", quantityScale: 0, requested: "5", given: "2" }] }]}/>);
    expect(screen.getByLabelText("Give Guinness")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Give Stock" })).toBeEnabled();
  });
});
