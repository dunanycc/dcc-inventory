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
    screen.getByText("No products match these filters."),
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

it("hides all-zero products by default and lets users include them", () => {
  render(
    <ExecutiveView
      orders={[]}
      vendors={[{ id: "beer", name: "Beer" }]}
      year={2026}
      years={[2026]}
      currentYear={2026}
      stocks={[{ productId: "zero", opening: "0", remaining: "0" }]}
      products={[
        {
          id: "zero",
          name: "Zero lager",
          vendorId: "beer",
          categoryName: "Beer",
          unit: "CAN",
          active: true,
          historyCategoryOrder: 0,
          historyProductOrder: 0,
        },
      ]}
    />,
  );
  const toggle = screen.getByRole("checkbox", {
    name: "Show zero-value products",
  });
  expect(toggle).not.toBeChecked();
  expect(
    screen.queryByRole("rowheader", { name: "Zero lager" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  fireEvent.click(toggle);
  expect(
    screen.getByRole("rowheader", { name: "Zero lager" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  fireEvent.click(toggle);
  expect(
    screen.queryByRole("rowheader", { name: "Zero lager" }),
  ).not.toBeInTheDocument();
});

it("uses zero instead of dashes and marks missing historical values", () => {
  render(
    <ExecutiveView
      orders={[]}
      vendors={[{ id: "saq", name: "SAQ" }]}
      year={2026}
      years={[2026]}
      currentYear={2026}
      stocks={[{ productId: "one", opening: null, remaining: "1" }]}
      products={[
        {
          id: "one",
          name: "Test wine",
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
  const row = screen
    .getByRole("rowheader", { name: "Test wine" })
    .closest("tr")!;
  expect(within(row).queryByText("—")).not.toBeInTheDocument();
  expect(within(row).getAllByText("$0.00")).toHaveLength(2);
  expect(within(row).getAllByText("0 *")).toHaveLength(2);
});
