import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Orders } from "./orders";
import { NewOrder } from "./new-order";
import type { OrderRow } from "@/lib/purchase-order-queries";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/orders/actions", () => ({
  createOrderAction: vi.fn(),
  finalizeOrderAction: vi.fn(),
  editOrderAction: vi.fn(),
}));
afterEach(cleanup);
const order = {
  id: "order",
  vendorId: "saq",
  vendorName: "SAQ",
  number: 1,
  year: 2026,
  status: "PENDING",
  orderDate: "2026-11-08",
  receivedDate: null,
  notes: null,
  taxIncluded: true,
  gst: "0",
  pst: "0",
  historical: false,
  receipts: [],
  updatedAt: "2026-11-08",
  lines: [
    {
      id: "line",
      productId: "wine",
      productName: "Red wine",
      categoryName: "Wine",
      unit: "CASE",
      unitsPerEntry: "12",
      orderedQuantity: "2",
      receivedQuantity: null,
      unitPrice: null,
    },
  ],
} as unknown as OrderRow;
describe("orders workspace", () => {
  it("selects the vendor first and clears products when the vendor changes", () => {
    render(
      <NewOrder
        today="2026-11-08"
        vendors={[
          { id: "saq", name: "SAQ" },
          { id: "beer", name: "Beer" },
        ]}
        categories={[
          {
            id: "wine",
            name: "Wine",
            products: [
              {
                id: "red",
                name: "Red wine",
                vendorId: "saq",
                unit: "CASE",
                factor: "12",
                stockUnit: "BOTTLE",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Vendor" }), {
      target: { value: "saq" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Quantity for Red wine" }),
      { target: { value: "2" } },
    );
    expect(screen.getByText("1 products selected")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Vendor" }), {
      target: { value: "beer" },
    });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("0 products selected")).toBeInTheDocument();
  });
  it("defaults tax included, enables manual taxes when unchecked, and totals received units", () => {
    render(
      <Orders
        orders={[order]}
        vendors={[{ id: "saq", name: "SAQ" }]}
        canManage
        today="2026-11-08"
      />,
    );
    const toggle = screen.getByRole("checkbox", { name: "Tax included" });
    expect(toggle).toBeChecked();
    const gst = screen.getByRole("spinbutton", { name: "GST ($)" });
    const pst = screen.getByRole("spinbutton", { name: "PST ($)" });
    expect(gst).toBeDisabled();
    expect(pst).toBeDisabled();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Received Red wine" }),
      { target: { value: "1" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Price per CASE for Red wine" }),
      { target: { value: "20" } },
    );
    fireEvent.click(toggle);
    expect(gst).toBeEnabled();
    expect(pst).toBeEnabled();
    fireEvent.change(gst, { target: { value: "1" } });
    fireEvent.change(pst, { target: { value: "2" } });
    expect(screen.getByText("$23.00")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("$23.00")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Take receipt photo")).toHaveAttribute(
      "capture",
      "environment",
    );
  });
  it("keeps historical prices unavailable and hides finalization from read-only users", () => {
    render(
      <Orders
        orders={[
          {
            ...order,
            status: "RECEIVED",
            historical: true,
            lines: order.lines.map((l) => ({ ...l, receivedQuantity: "2" })),
          },
        ]}
        vendors={[]}
        canManage={false}
        today="2026-11-08"
      />,
    );
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Finalize receiving" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attach file")).not.toBeInTheDocument();
  });
});

it("switches to manual private products for the selected vendor", () => {
  render(
    <NewOrder
      today="2026-11-08"
      vendors={[{ id: "saq", name: "SAQ" }]}
      categories={[
        {
          id: "wine",
          name: "Wine",
          products: [
            {
              id: "red",
              name: "Inventory red",
              vendorId: "saq",
              unit: "CASE",
              factor: "12",
              stockUnit: "BOTTLE",
            },
          ],
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Vendor" }), {
    target: { value: "saq" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Private order" }));
  expect(screen.queryByText("Inventory red")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Private product 1" }), {
    target: { value: "Private wine" },
  });
  expect(screen.getByRole("combobox", { name: "Private unit 1" })).toHaveValue(
    "BOTTLE",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add quantity for private product 1" }),
  );
  expect(screen.getByLabelText("Private quantity 1")).toHaveTextContent("1");
  fireEvent.click(
    screen.getByRole("button", { name: "Increase private quantity 1" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Increase private quantity 1" }),
  );
  expect(screen.getByLabelText("Private quantity 1")).toHaveTextContent("3");
  const form = screen
    .getByRole("button", { name: "Save order" })
    .closest("form")!;
  const data = new FormData(form);
  expect(data.get("vendorId")).toBe("saq");
  expect(data.get("isPrivate")).toBe("on");
  expect(data.get("items")).toBe("[]");
  expect(JSON.parse(String(data.get("manualItems")))).toEqual([
    { name: "Private wine", unit: "BOTTLE", quantity: "3" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Add private product" }));
  expect(
    screen.getByRole("textbox", { name: "Private product 2" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove private product 2" }),
  );
  expect(
    screen.queryByRole("textbox", { name: "Private product 2" }),
  ).not.toBeInTheDocument();
  for (let i = 0; i < 3; i++)
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease private quantity 1" }),
    );
  expect(
    screen.getByRole("button", { name: "Add quantity for private product 1" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save order" }),
  ).not.toBeInTheDocument();
});
