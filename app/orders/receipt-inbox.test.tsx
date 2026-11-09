import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReceiptInbox, type ReceiptOrder } from "./receipt-inbox";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const base: ReceiptOrder = {
  id: "one",
  vendorId: "saq",
  vendorName: "SAQ",
  number: 1,
  year: 2026,
  orderDate: "2026-11-09",
  status: "RECEIVED",
  isPrivate: false,
  receipts: [],
  lines: [{ productName: "Red wine" }],
};
it("selects vendors and hides existing receipts until toggled, while retaining a year selector", () => {
  render(
    <ReceiptInbox
      currentYear={2026}
      vendors={[
        { id: "saq", name: "SAQ" },
        { id: "beer", name: "Beer" },
      ]}
      orders={[
        base,
        {
          ...base,
          id: "two",
          number: 2,
          receipts: [
            { id: "receipt", name: "Invoice.pdf", mimeType: "application/pdf" },
          ],
        },
        { ...base, id: "old", year: 2025 },
        { ...base, id: "beer", vendorId: "beer", vendorName: "Beer" },
      ]}
    />,
  );
  expect(screen.queryByText("SAQ · 2026-1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "SAQ" }));
  expect(screen.getByText("SAQ · 2026-1")).toBeInTheDocument();
  expect(screen.queryByText("SAQ · 2026-2")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Show orders with existing receipts",
    }),
  );
  expect(screen.getByText("SAQ · 2026-2")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Delete receipt Invoice.pdf" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Year" }), {
    target: { value: "2025" },
  });
  expect(screen.getByText("SAQ · 2025-1")).toBeInTheDocument();
});
