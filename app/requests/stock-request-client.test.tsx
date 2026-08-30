import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewStockRequest } from "./stock-request-client";

vi.mock("@/app/(protected)/requests/actions", () => ({ submitStockRequestAction: vi.fn(), fulfillStockRequestAction: vi.fn(), cancelStockRequestAction: vi.fn() }));

describe("NewStockRequest", () => {
  it("shows category-grouped Products and maintains a removable request summary", () => {
    render(<NewStockRequest categories={[{ id: "beer", name: "Beer", products: [{ id: "p1", name: "Sapporo", unit: "Can · 500 mL", quantityScale: 0 }] }]}/>);
    expect(screen.getByText("Beer")).toBeInTheDocument();
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity for Sapporo"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Submit Request" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Sapporo" }));
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
  });
});
