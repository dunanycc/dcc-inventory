import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryWorkspace, type ProductHistory } from "./history-client";

afterEach(cleanup);

const products: ProductHistory[] = [
  {
    productId: "p1",
    productName: "Red wine",
    categoryId: "wine",
    categoryName: "Wine",
    unitLabel: "BOTTLE",
    seasons: [
      {
        season: 2025,
        startingQuantity: "10",
        startingSource: "count",
        deliveredQuantity: "5",
        endingQuantity: null,
        endingSource: "missing",
        consumedQuantity: null,
        incompleteReasons: ["missing ending quantity"],
        yoyChange: null,
        yoyPercent: null,
      },
      {
        season: 2026,
        startingQuantity: "10",
        startingSource: "carry-forward",
        deliveredQuantity: "3",
        endingQuantity: null,
        endingSource: "missing",
        consumedQuantity: null,
        incompleteReasons: ["missing ending quantity"],
        yoyChange: null,
        yoyPercent: null,
      },
    ],
  },
  {
    productId: "p2",
    productName: "Fireball",
    categoryId: "liquor",
    categoryName: "Hard Liquor",
    unitLabel: "BOTTLE",
    seasons: [
      {
        season: 2026,
        startingQuantity: null,
        startingSource: "missing",
        deliveredQuantity: "0",
        endingQuantity: null,
        endingSource: "missing",
        consumedQuantity: null,
        incompleteReasons: [
          "missing starting quantity",
          "missing ending quantity",
        ],
        yoyChange: null,
        yoyPercent: null,
      },
    ],
  },
];

function renderReviewTab() {
  render(
    <HistoryWorkspace
      categories={["Wine", "Hard Liquor"]}
      products={products}
      seasons={[2025, 2026]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Needs review/ }));
}

describe("ReviewTab", () => {
  it("hides the current season's 'missing ending quantity' rows by default", () => {
    renderReviewTab();
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
    expect(screen.getAllByText("Red wine")).toHaveLength(1);
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(
      screen.getByText(/Hiding 1 row where Season 2026/),
    ).toBeInTheDocument();
  });

  it("reveals the hidden rows again via 'Show anyway'", () => {
    renderReviewTab();
    fireEvent.click(screen.getByRole("button", { name: "Show anyway" }));
    expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
    expect(screen.getAllByText("Red wine")).toHaveLength(2);
  });

  it("filters rows by category through the multi-select dropdown", () => {
    renderReviewTab();
    fireEvent.click(screen.getByRole("button", { name: "Category" }));
    fireEvent.click(screen.getByLabelText("Wine"));
    expect(screen.queryByText("Red wine")).not.toBeInTheDocument();
    expect(screen.getByText("Fireball")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
  });
});

it("opens Executive view by default when the report is available", () => {
  render(
    <HistoryWorkspace
      categories={[]}
      products={[]}
      seasons={[2025, 2026]}
      executive={<p>Executive report content</p>}
    />,
  );
  expect(screen.getByText("Executive report content")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Executive view" })).toHaveClass(
    "active",
  );
  fireEvent.click(screen.getByRole("button", { name: "Consumption" }));
  expect(
    screen.queryByText("Executive report content"),
  ).not.toBeInTheDocument();
});
