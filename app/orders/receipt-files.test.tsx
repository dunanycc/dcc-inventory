import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReceiptFiles } from "./receipt-files";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
});
const order = {
  id: "order",
  receipts: [{ id: "file", name: "Invoice.pdf", mimeType: "application/pdf" }],
};
it("requires confirmation before deleting and refreshes receipt status after success", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetcher);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ReceiptFiles order={order} canManage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Delete receipt Invoice.pdf" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Delete receipt Invoice.pdf" }),
  );
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith("/api/orders/order/receipts/file", {
      method: "DELETE",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Receipt deleted."),
  );
  expect(refresh).toHaveBeenCalled();
});
it("keeps receipt deletion unavailable to read-only users", () => {
  render(<ReceiptFiles order={order} canManage={false} />);
  expect(
    screen.queryByRole("button", { name: "Delete receipt Invoice.pdf" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Invoice.pdf" })).toBeInTheDocument();
});
it("uploads a photo-or-file selection and reports success", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(
    <ReceiptFiles
      order={{ id: "order", receipts: [] }}
      canManage
      uploadLabel="Add receipt"
    />,
  );
  fireEvent.change(screen.getByLabelText("Receipt photo or file"), {
    target: {
      files: [
        new File(["%PDF-1.7"], "invoice.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/orders/order/receipts",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Receipt saved."),
  );
});
