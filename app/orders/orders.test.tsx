import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Orders } from "./orders";
import { NewOrder } from "./new-order";
import type { OrderRow } from "@/lib/purchase-order-queries";
import {
  cancelOrderAction,
  saveOrderEditorAction,
} from "@/app/(protected)/orders/actions";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/orders/actions", () => ({
  createOrderAction: vi.fn(),
  cancelOrderAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Cancelled." }),
  finalizeOrderAction: vi.fn(),
  editOrderAction: vi.fn(),
  saveOrderEditorAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Order saved." }),
  receiveOrderAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Received." }),
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
  isPrivate: false,
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
  it("shows receipt status on the card and uses one photo-or-file control", () => {
    const { rerender } = render(
      <Orders orders={[order]} vendors={[]} canManage today="2026-11-08" />,
    );
    expect(screen.getByText("No receipt")).toHaveClass("receipt-missing");
    expect(screen.getAllByLabelText("Receipt photo or file")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();
    rerender(
      <Orders
        orders={[
          {
            ...order,
            receipts: [
              {
                id: "receipt",
                name: "Receipt.pdf",
                mimeType: "application/pdf",
              },
            ],
          },
        ]}
        vendors={[]}
        canManage
        today="2026-11-08"
      />,
    );
    expect(screen.queryByText("No receipt")).not.toBeInTheDocument();
    expect(screen.getByText("Receipt attached")).toHaveClass(
      "receipt-attached",
    );
    expect(screen.getByRole("link", { name: "Receipt.pdf" })).toHaveAttribute(
      "href",
      "/api/orders/order/receipts/receipt",
    );
  });
  it("edits a received order in a dialog, including number and product additions/removals", async () => {
    vi.mocked(saveOrderEditorAction).mockClear();
    render(
      <Orders
        orders={[
          {
            ...order,
            status: "RECEIVED",
            receivedDate: "2026-11-08",
            lines: order.lines.map((l) => ({
              ...l,
              receivedQuantity: "2",
              unitPrice: "20",
            })),
          },
        ]}
        vendors={[{ id: "saq", name: "SAQ" }]}
        products={[
          {
            id: "wine",
            name: "Red wine",
            vendorId: "saq",
            categoryName: "Wine",
            unit: "CASE",
            factor: "12",
            quantityScale: 0,
          },
          {
            id: "white",
            name: "White wine",
            vendorId: "saq",
            categoryName: "Wine",
            unit: "CASE",
            factor: "6",
            quantityScale: 0,
          },
        ]}
        canManage
        today="2026-11-08"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog", { name: "Edit order" }));
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Order number" }), {
      target: { value: "7" },
    });
    fireEvent.change(dialog.getByRole("combobox", { name: "Add product" }), {
      target: { value: "white" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Add product" }));
    expect(
      dialog.getByRole("spinbutton", { name: "Received White wine" }),
    ).toHaveValue(1);
    fireEvent.change(
      dialog.getByRole("spinbutton", { name: "Price for White wine" }),
      { target: { value: "12" } },
    );
    fireEvent.click(dialog.getByRole("button", { name: "Remove Red wine" }));
    expect(
      dialog.queryByRole("spinbutton", { name: "Received Red wine" }),
    ).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveOrderEditorAction).toHaveBeenCalledWith(
        expect.objectContaining({
          number: 7,
          lines: [
            expect.objectContaining({
              productId: "white",
              ordered: "1",
              received: "1",
              price: "12",
            }),
          ],
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
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
    fireEvent.click(screen.getByRole("button", { name: "SAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Red wine" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Red wine" }));
    expect(screen.getByLabelText("Quantity for Red wine")).toHaveTextContent(
      "2",
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Order in progress" }),
      ).getByText("Red wine"),
    ).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(
      fireEvent.submit(
        screen.getByRole("button", { name: "Submit order" }).closest("form")!,
      ),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("2 CASE"));
    confirm.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Beer" }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.getByText("Add products to start this order."),
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
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
    expect(screen.getByLabelText("Receipt photo or file")).toHaveAttribute(
      "accept",
      "application/pdf,image/*",
    );
    expect(screen.getAllByLabelText("Receipt photo or file")).toHaveLength(1);
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
  fireEvent.click(screen.getByRole("button", { name: "SAQ" }));
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
    .getByRole("button", { name: "Submit order" })
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
    screen.queryByRole("button", { name: "Submit order" }),
  ).not.toBeInTheDocument();
});

it("requires a cancellation reason and explicit confirmation", async () => {
  vi.mocked(cancelOrderAction).mockClear();
  render(<Orders orders={[order]} vendors={[]} canManage today="2026-11-08" />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
  const dialog = within(screen.getByRole("dialog", { name: "Cancel order" }));
  expect(
    dialog.getByRole("button", { name: "Confirm cancellation" }),
  ).toBeDisabled();
  fireEvent.change(
    dialog.getByRole("textbox", { name: "Reason for cancellation" }),
    { target: { value: "  " } },
  );
  expect(
    dialog.getByRole("button", { name: "Confirm cancellation" }),
  ).toBeDisabled();
  fireEvent.change(
    dialog.getByRole("textbox", { name: "Reason for cancellation" }),
    { target: { value: "Duplicate purchase" } },
  );
  fireEvent.click(dialog.getByRole("button", { name: "Confirm cancellation" }));
  await waitFor(() =>
    expect(cancelOrderAction).toHaveBeenCalledWith({
      id: order.id,
      updatedAt: order.updatedAt,
      reason: "Duplicate purchase",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
