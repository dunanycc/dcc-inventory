import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryCategoryTabs } from "./inventory-category-tabs";

vi.mock("@/app/(protected)/inventory/actions", () => ({
  setOpeningInventoryAction: vi.fn(),
}));
afterEach(cleanup);

const locations = [
  { id: "bar", code: "BAR", name: "Bar" },
  { id: "shack", code: "STARTER_SHACK", name: "Starter Shack" },
];
const categories = [
  {
    id: "beer",
    name: "Beer",
    products: [
      {
        id: "lager",
        name: "Club Lager",
        packageSize: "355 mL",
        unitLabel: "CAN",
        quantityScale: 0,
        balance: "19",
        openingSet: false,
      },
    ],
  },
  {
    id: "wine",
    name: "Wine",
    products: [
      {
        id: "red",
        name: "House Red",
        packageSize: "750 mL",
        unitLabel: "BOTTLE",
        quantityScale: 0,
        balance: "6",
        openingSet: true,
      },
    ],
  },
];

describe("InventoryCategoryTabs", () => {
  it("shows Location selection, category tabs, and real tracked balances", () => {
    render(
      <InventoryCategoryTabs
        canSetOpening={false}
        categories={categories}
        locations={locations}
        selectedLocation={locations[0]}
      />,
    );
    expect(screen.getByRole("link", { name: "Bar" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Starter Shack" })).toHaveAttribute(
      "href",
      "/inventory?location=STARTER_SHACK&category=beer",
    );
    expect(screen.getByText("Club Lager")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Wine" }));
    expect(screen.getByText("House Red")).toBeInTheDocument();
  });

  it("restores the selected category supplied after a server action", () => {
    render(
      <InventoryCategoryTabs
        canSetOpening={false}
        categories={categories}
        initialCategoryId="wine"
        locations={locations}
        selectedLocation={locations[0]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Wine" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("allows authorized users to enter opening quantities with explicit confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <InventoryCategoryTabs
        canSetOpening
        categories={categories}
        locations={locations}
        selectedLocation={locations[0]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set Inventory" }));
    expect(screen.getByLabelText(/Club Lager/)).toHaveAttribute("step", "1");
    const form = screen
      .getByRole("button", { name: "Confirm Inventory" })
      .closest("form")!;
    const quantity = screen.getByRole("spinbutton", { name: /Club Lager/ });
    expect(quantity.closest("tr")).toHaveTextContent("Club Lager");
    expect(screen.getAllByText("Club Lager")).toHaveLength(1);
    fireEvent.change(quantity, { target: { value: "12" } });
    const data = new FormData(form);
    expect(data.get("quantity-lager")).toBe("12");
    expect(data.getAll("productId")).toEqual(["lager"]);
    fireEvent.submit(form);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("cannot be replaced"),
    );
    confirm.mockRestore();
  });

  it("does not expose opening controls to read-only users", () => {
    render(
      <InventoryCategoryTabs
        canSetOpening={false}
        categories={categories}
        locations={locations}
        selectedLocation={locations[0]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Set Inventory" }),
    ).not.toBeInTheDocument();
  });
});
