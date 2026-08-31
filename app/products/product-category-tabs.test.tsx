import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductCategoryTabs } from "./product-category-tabs";

vi.mock("@/app/(protected)/products/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
}));
afterEach(cleanup);

describe("ProductCategoryTabs", () => {
  it("renders a fully expanded selected category and switches tabs", () => {
    render(<ProductCategoryTabs categories={[
      { id:"beer",name:"Beer",displayOrder:1,active:true,products:[{id:"can",name:"Club Lager",categoryId:"beer",packageSize:"355 mL",stockUnit:"CAN",stockUnitLabel:null,allowFractionalStock:false,quantityScale:0,purchaseUnit:"CASE",unitsPerPurchaseUnit:"24",active:true,starterShackRequestEligible:true}] },
      { id:"wine",name:"Wine",displayOrder:2,active:true,products:[] },
    ]}/>);
    expect(screen.getByText("Club Lager")).toBeInTheDocument();
    expect(screen.getByText(/CAN · 355 mL · 24 per CASE/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name:"Wine" }));
    expect(screen.getByText("No Products in this category.")).toBeInTheDocument();
  });

  it("keeps category tabs dominant while exposing compact administration controls", () => {
    render(<ProductCategoryTabs canManageCatalog categories={[
      { id:"beer",name:"Beer",displayOrder:1,active:true,products:[{id:"can",name:"Club Lager",categoryId:"beer",packageSize:"355 mL",stockUnit:"CAN",stockUnitLabel:null,allowFractionalStock:false,quantityScale:0,purchaseUnit:"CASE",unitsPerPurchaseUnit:"24",active:false,starterShackRequestEligible:false}] },
    ]}/>);
    expect(screen.getByRole("tab", { name: "Beer" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText(/^ID /)).not.toBeInTheDocument();
    expect(screen.queryByText("Bar only")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    expect(screen.getByRole("heading", { name: "New Product" })).toBeInTheDocument();
    expect(screen.getByLabelText("Counted as")).toBeInTheDocument();
    expect(screen.getByLabelText(/Available to Starter Shack/)).toBeInTheDocument();
    expect(screen.getByText(/request this Product from the Bar/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Allow partial quantities/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Club Lager" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unhide" })).toBeInTheDocument();
  });

  it("offers fixed two-decimal partial quantities only for Hard Liquor", () => {
    render(<ProductCategoryTabs canManageCatalog categories={[{ id:"liquor",name:"Hard Liquor",displayOrder:1,active:true,products:[] }]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    const partial = screen.getByLabelText(/Allow partial quantities/);
    const scale = document.querySelector('input[name="quantityScale"]');
    expect(scale).toHaveAttribute("value", "0");
    fireEvent.click(partial);
    expect(scale).toHaveAttribute("value", "2");
    expect(screen.getByText(/use 2 decimal places/)).toBeInTheDocument();
  });
});
