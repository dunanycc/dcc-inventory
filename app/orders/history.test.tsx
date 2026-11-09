import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OrderHistory } from "./history";
import type { OrderRow } from "@/lib/purchase-order-queries";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/orders/actions", () => ({
  moveOrderAction: vi.fn(),
}));
afterEach(cleanup);
it("removes empty columns while protecting columns occupied by hidden orders", () => {
  const orders = [
    {
      id: "order",
      vendorId: "beer",
      vendorName: "Beer",
      number: 3,
      isPrivate: false,
      lines: [],
      orderDate: "2026-11-09",
    },
  ] as unknown as OrderRow[];
  render(
    <OrderHistory
      orders={orders}
      vendors={[{ id: "beer", name: "Beer" }]}
      canManage
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Beer" }));
  expect(
    screen.queryByRole("button", { name: "Remove empty column 3" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove empty column 2" }),
  );
  expect(
    screen.queryByRole("columnheader", { name: /^#2/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "#3" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove empty column 6" }),
  );
  expect(
    screen.queryByRole("columnheader", { name: /^#6/ }),
  ).not.toBeInTheDocument();
});
