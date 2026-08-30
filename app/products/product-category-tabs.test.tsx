import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductCategoryTabs } from "./product-category-tabs";

vi.mock("@/app/(protected)/products/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
}));
vi.mock("@/app/(protected)/products/location-actions", () => ({ configureProductLocationAction: vi.fn() }));

afterEach(cleanup);

describe("ProductCategoryTabs", () => {
  it("renders a fully expanded selected category and switches tabs", () => {
    render(<ProductCategoryTabs categories={[
      { id:"beer",name:"Beer",displayOrder:1,active:true,products:[{id:"can",name:"Club Lager",categoryId:"beer",packageSize:"355 mL",stockUnit:"CAN",stockUnitLabel:null,allowFractionalStock:false,quantityScale:0,purchaseUnit:"CASE",unitsPerPurchaseUnit:"24",active:true,starterShackRequestEligible:true,productLocations:[]}] },
      { id:"wine",name:"Wine",displayOrder:2,active:true,products:[] },
    ]}/>);
    expect(screen.getByText("Club Lager")).toBeInTheDocument();
    expect(screen.getByText(/24 CAN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name:"Wine" }));
    expect(screen.getByText("No Products in this category.")).toBeInTheDocument();
  });

  it("keeps category tabs dominant while exposing compact administration controls", () => {
    render(<ProductCategoryTabs canManageCatalog locations={[{ id:"bar",code:"BAR",name:"Bar",active:true },{ id:"shack",code:"STARTER_SHACK",name:"Starter Shack",active:true }]} categories={[
      { id:"beer",name:"Beer",displayOrder:1,active:true,products:[{id:"can",name:"Club Lager",categoryId:"beer",packageSize:"355 mL",stockUnit:"CAN",stockUnitLabel:null,allowFractionalStock:false,quantityScale:0,purchaseUnit:"CASE",unitsPerPurchaseUnit:"24",active:false,starterShackRequestEligible:false,productLocations:[{locationId:"bar",active:true,reviewRequired:false}]}] },
    ]}/>);
    expect(screen.getByRole("tab", { name: "Beer" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    expect(screen.getByRole("heading", { name: "New Product" })).toBeInTheDocument();
    expect(screen.getByLabelText("Counted as")).toBeInTheDocument();
    expect(screen.getByLabelText(/Available to Starter Shack/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean stock is currently there/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Club Lager" })).toBeInTheDocument();
  });
});
