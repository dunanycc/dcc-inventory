import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ExecutiveView } from "./executive-view";
afterEach(cleanup);
it("offers the Order Summary year and vendor controls, recomputing visible product totals", () => {
  render(
    <ExecutiveView
      orders={[]}
      vendors={[
        { id: "saq", name: "SAQ" },
        { id: "beer", name: "Beer" },
        { id: "groceries", name: "Groceries" },
      ]}
      year={2026}
      years={[2026, 2025]}
      currentYear={2026}
      stocks={[{ productId: "wine", opening: "10", remaining: "2" }]}
      products={[
        {
          id: "wine",
          name: "Red wine",
          vendorId: "saq",
          categoryName: "Wine",
          unit: "BOTTLE",
          active: true,
          historyCategoryOrder: 0,
          historyProductOrder: 0,
        },
      ]}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2026");
  expect(
    screen.getByRole("columnheader", { name: "Units consumed" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("rowheader", { name: "Red wine" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export PDF" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Export CSV" }),
  ).toBeInTheDocument();
  const clubTotal = screen
    .getByRole("rowheader", { name: "Club total" })
    .closest("tr")!;
  expect(
    within(clubTotal)
      .getAllByRole("cell")
      .slice(1, 7)
      .every((cell) => cell.textContent === ""),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "SAQ" }));
  expect(
    screen.queryByRole("rowheader", { name: "Red wine" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("No products match these vendor filters."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "SAQ" }));
  fireEvent.click(screen.getByRole("button", { name: "Wine" }));
  expect(
    screen.queryByRole("rowheader", { name: "Red wine" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("rowheader", { name: "Wine subtotal" }),
  ).toBeInTheDocument();
});
