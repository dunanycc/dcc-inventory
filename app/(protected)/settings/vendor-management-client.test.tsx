import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VendorManagementClient } from "./vendor-management-client";

vi.mock("./vendor-actions", () => ({
  createVendorAction: vi.fn(),
  deleteVendorAction: vi.fn(),
  reorderVendorsAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Vendor order saved." }),
  setVendorActiveAction: vi.fn(),
  updateVendorAction: vi.fn(),
}));
afterEach(cleanup);

describe("VendorManagementClient", () => {
  const vendors = [
    {
      id: "costco",
      name: "Costco",
      displayOrder: 0,
      active: true,
      notes: null,
      deliveryCount: 0,
    },
    {
      id: "molson",
      name: "Molson",
      displayOrder: 1,
      active: true,
      notes: "Main supplier",
      deliveryCount: 2,
    },
  ];

  it("reorders Vendors with accessible handles", () => {
    render(<VendorManagementClient vendors={vendors} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Molson/ }), {
      key: "ArrowUp",
    });
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Molson"),
      expect.stringContaining("Costco"),
    ]);
  });

  it("only offers deletion for unused Vendors and requires confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<VendorManagementClient vendors={vendors} />);
    const buttons = screen.getAllByRole("button", { name: "Delete" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest("tr")).toHaveTextContent("Costco");
    expect(fireEvent.submit(buttons[0].closest("form")!)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      "Delete Costco? This cannot be undone.",
    );
    confirm.mockRestore();
  });

  it("opens an editor for Vendor name and notes", () => {
    render(<VendorManagementClient vendors={vendors} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(
      screen.getByRole("dialog", { name: "Edit Molson" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Name", { selector: "#edit-vendor-form input" }),
    ).toHaveValue("Molson");
    expect(
      screen.getByLabelText("Notes (optional)", {
        selector: "#edit-vendor-form textarea",
      }),
    ).toHaveValue("Main supplier");
    expect(
      screen.getByRole("button", { name: "Save Vendor" }),
    ).toBeInTheDocument();
  });
});
