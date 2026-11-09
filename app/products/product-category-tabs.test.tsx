import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProductCategoryTabs,
  type ProductCategoryRow,
} from "./product-category-tabs";
import { productCatalogViewKey } from "@/lib/product-catalog-view";

vi.mock("@/app/(protected)/products/actions", () => ({
  createProductAction: vi.fn(),
  addProductNoteAction: vi.fn(),
  deleteProductNoteAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
  reorderProductsAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Product order saved." }),
}));
afterEach(cleanup);

describe("ProductCategoryTabs", () => {
  it("keeps the selected category and mounted view after a reorder refresh", async () => {
    const product = {
      categoryId: "beer",
      packageSize: null,
      stockUnit: "CAN" as const,
      stockUnitLabel: null,
      allowFractionalStock: false,
      quantityScale: 0,
      purchaseUnit: null,
      unitsPerPurchaseUnit: null,
      active: true,
      starterShackRequestEligible: false,
    };
    const categories: ProductCategoryRow[] = [
      { id: "wine", name: "Wine", displayOrder: 0, active: true, products: [] },
      {
        id: "beer",
        name: "Beer",
        displayOrder: 1,
        active: true,
        products: [
          { ...product, id: "first", name: "First", displayOrder: 0 },
          { ...product, id: "second", name: "Second", displayOrder: 1 },
        ],
      },
    ];
    const view = (rows: ProductCategoryRow[]) => (
      <ProductCategoryTabs
        key={productCatalogViewKey(rows)}
        categories={rows}
        canManageCatalog
      />
    );
    const { rerender } = render(view(categories));
    const tab = screen.getByRole("tab", { name: "Beer" });
    fireEvent.click(tab);
    const handle = screen.getByRole("button", { name: /Reorder Second/ });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() =>
      expect(screen.getByText("Product order saved.")).toBeInTheDocument(),
    );
    rerender(
      view([
        categories[0],
        {
          ...categories[1],
          products: [
            { ...categories[1].products[1], displayOrder: 0 },
            { ...categories[1].products[0], displayOrder: 1 },
          ],
        },
      ]),
    );
    expect(screen.getByRole("tab", { name: "Beer" })).toBe(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(handle).toHaveFocus();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Second");
  });

  it("renders a fully expanded selected category and switches tabs", () => {
    render(
      <ProductCategoryTabs
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [
              {
                id: "can",
                name: "Club Lager",
                categoryId: "beer",
                packageSize: "355 mL",
                stockUnit: "CAN",
                stockUnitLabel: null,
                allowFractionalStock: false,
                quantityScale: 0,
                purchaseUnit: "CASE",
                unitsPerPurchaseUnit: "24",
                active: true,
                starterShackRequestEligible: true,
              },
            ],
          },
          {
            id: "wine",
            name: "Wine",
            displayOrder: 2,
            active: true,
            products: [],
          },
        ]}
      />,
    );
    expect(screen.getByText("Club Lager")).toBeInTheDocument();
    expect(screen.getByText(/CAN · 355 mL · 24 per CASE/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Wine" }));
    expect(
      screen.getByText("No Products in this category."),
    ).toBeInTheDocument();
  });

  it("does not show deactivated categories", () => {
    render(
      <ProductCategoryTabs
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [],
          },
          {
            id: "food",
            name: "Food",
            displayOrder: 2,
            active: false,
            products: [],
          },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Beer" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Food/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("keeps category tabs dominant while exposing compact administration controls", () => {
    render(
      <ProductCategoryTabs
        canManageCatalog
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [
              {
                id: "can",
                name: "Club Lager",
                categoryId: "beer",
                packageSize: "355 mL",
                stockUnit: "CAN",
                stockUnitLabel: null,
                allowFractionalStock: false,
                quantityScale: 0,
                purchaseUnit: "CASE",
                unitsPerPurchaseUnit: "24",
                active: false,
                starterShackRequestEligible: false,
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Beer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Beer" })).toHaveTextContent("1");
    expect(screen.queryByText(/order 1/)).not.toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText(/^ID /)).not.toBeInTheDocument();
    expect(screen.queryByText("Bar only")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    expect(
      screen.getByRole("heading", { name: "New Product" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Counted as")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Available to Starter Shack/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/request this Product from the Bar/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Allow partial quantities/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Edit Club Lager" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unhide" })).toBeInTheDocument();
  });

  it("offers fixed two-decimal partial quantities only for Hard Liquor", () => {
    render(
      <ProductCategoryTabs
        canManageCatalog
        categories={[
          {
            id: "liquor",
            name: "Hard Liquor",
            displayOrder: 1,
            active: true,
            products: [],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    const partial = screen.getByLabelText(/Allow partial quantities/);
    const scale = document.querySelector('input[name="quantityScale"]');
    expect(scale).toHaveAttribute("value", "0");
    fireEvent.click(partial);
    expect(scale).toHaveAttribute("value", "2");
    expect(screen.getByText(/use 2 decimal places/)).toBeInTheDocument();
  });

  it("indicates notes and opens newest-first note history with add and delete controls", () => {
    render(
      <ProductCategoryTabs
        canManageCatalog
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [
              {
                id: "can",
                name: "Club Lager",
                categoryId: "beer",
                packageSize: "355 mL",
                stockUnit: "CAN",
                stockUnitLabel: null,
                allowFractionalStock: false,
                quantityScale: 0,
                purchaseUnit: "CASE",
                unitsPerPurchaseUnit: "24",
                active: true,
                starterShackRequestEligible: true,
                notes: [
                  {
                    id: "new",
                    body: "Newest note",
                    createdAt: "2026-08-30T20:00:00.000Z",
                    author: "Alex",
                  },
                  {
                    id: "old",
                    body: "Older note",
                    createdAt: "2026-08-29T20:00:00.000Z",
                    author: "Sam",
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );
    const notesButton = screen.getByRole("button", { name: "Notes (2)" });
    expect(notesButton).toHaveClass("has-notes");
    fireEvent.click(notesButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Note" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("article").map((note) => note.textContent),
    ).toEqual([
      expect.stringContaining("Newest note"),
      expect.stringContaining("Older note"),
    ]);
    expect(
      screen.getByRole("button", { name: "Delete note from Alex" }),
    ).toBeInTheDocument();
  });

  it("opens the category supplied after a server-action redirect", () => {
    render(
      <ProductCategoryTabs
        initialCategoryId="beer"
        categories={[
          {
            id: "wine",
            name: "Wine",
            displayOrder: 1,
            active: true,
            products: [],
          },
          {
            id: "beer",
            name: "Beer",
            displayOrder: 2,
            active: true,
            products: [],
          },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Beer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("offers controlled purchasing units and requires the matching conversion", () => {
    render(
      <ProductCategoryTabs
        canManageCatalog
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    const purchasedBy = screen.getByLabelText("Purchased by");
    const conversion = screen.getByLabelText(/Units in one case\/package/);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(
      expect.arrayContaining([
        "Not specified",
        "CASE",
        "BOTTLE",
        "BOX",
        "OTHER",
      ]),
    );
    expect(conversion).toBeDisabled();
    fireEvent.change(purchasedBy, { target: { value: "BOX" } });
    expect(conversion).toBeEnabled();
    expect(conversion).toBeRequired();
  });

  it("reorders products with accessible drag handles", () => {
    render(
      <ProductCategoryTabs
        canManageCatalog
        categories={[
          {
            id: "beer",
            name: "Beer",
            displayOrder: 1,
            active: true,
            products: [
              {
                id: "first",
                name: "First",
                categoryId: "beer",
                packageSize: null,
                stockUnit: "CAN",
                stockUnitLabel: null,
                allowFractionalStock: false,
                quantityScale: 0,
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
                active: true,
                starterShackRequestEligible: false,
              },
              {
                id: "second",
                name: "Second",
                categoryId: "beer",
                packageSize: null,
                stockUnit: "CAN",
                stockUnitLabel: null,
                allowFractionalStock: false,
                quantityScale: 0,
                purchaseUnit: null,
                unitsPerPurchaseUnit: null,
                active: true,
                starterShackRequestEligible: false,
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Second/ }), {
      key: "ArrowUp",
    });
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Second"),
      expect.stringContaining("First"),
    ]);
  });
});

it("shows a Product Vendor and lets managers change it", () => {
  render(
    <ProductCategoryTabs
      canManageCatalog
      vendors={[
        { id: "saq", name: "SAQ", active: true },
        { id: "beer-vendor", name: "Beer supplier", active: true },
        { id: "hidden", name: "Hidden supplier", active: false },
      ]}
      categories={[
        {
          id: "wine",
          name: "Wine",
          active: true,
          displayOrder: 0,
          products: [
            {
              id: "red",
              name: "Red wine",
              categoryId: "wine",
              vendorId: "saq",
              vendorName: "SAQ",
              stockUnit: "BOTTLE",
              stockUnitLabel: null,
              packageSize: "750 ml",
              quantityScale: 0,
              allowFractionalStock: false,
              purchaseUnit: null,
              unitsPerPurchaseUnit: null,
              active: true,
              starterShackRequestEligible: false,
            },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByRole("cell", { name: "SAQ" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const select = screen.getByRole("combobox", { name: "Vendor" });
  expect(select).toHaveValue("saq");
  expect(
    screen.queryByRole("option", { name: "Hidden supplier" }),
  ).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: "beer-vendor" } });
  const form = select.closest("form")!;
  expect(new FormData(form).get("vendorId")).toBe("beer-vendor");
});
