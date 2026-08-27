import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCategoryTabs } from "./product-category-tabs";

describe("ProductCategoryTabs", () => {
  it("renders a fully expanded selected category and switches tabs", () => {
    render(<ProductCategoryTabs categories={[
      { id:"beer",name:"Beer",displayOrder:1,active:true,products:[{id:"can",name:"Club Lager",packageSize:"355 mL",stockUnit:"CAN",purchaseUnit:"CASE",unitsPerPurchaseUnit:"24",active:true,starterShackEligible:true,locations:["Bar"]}] },
      { id:"wine",name:"Wine",displayOrder:2,active:true,products:[] },
    ]}/>);
    expect(screen.getByText("Club Lager")).toBeInTheDocument();
    expect(screen.getByText(/24 CAN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name:"Wine" }));
    expect(screen.getByText("No products in this category.")).toBeInTheDocument();
  });
});
