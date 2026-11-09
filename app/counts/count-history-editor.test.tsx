import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CountHistoryEditor } from "./count-history-editor";
import { correctCountHistoryAction } from "@/app/(protected)/counts/actions";
vi.mock("@/app/(protected)/counts/actions", () => ({
  correctCountHistoryAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Saved" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it("saves only changed values or missing products and requires a correction reason", async () => {
  const onClose = vi.fn();
  render(
    <CountHistoryEditor
      count={{
        id: "count",
        revision: "revision",
        countDate: "2026-11-08",
        status: "ACCEPTED",
        notes: null,
        createdBy: "Manager",
        acceptedBy: "Manager",
        acceptedAt: null,
        lines: [
          {
            productId: "wine",
            productName: "Wine",
            unitLabel: "BOTTLE",
            expectedQuantity: "10",
            countedQuantity: "4",
            difference: "-6",
          },
        ],
      }}
      products={[
        {
          productId: "gin",
          name: "Gin",
          categoryName: "Hard Liquor",
          unitLabel: "BOTTLE",
          quantityScale: 2,
          value: null,
        },
      ]}
      onClose={onClose}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Save historical corrections" }),
  ).toBeDisabled();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Reason for correction" }),
    { target: { value: "Correct missing ending quantity" } },
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Historical quantity for Gin" }),
    { target: { value: "0" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save historical corrections" }),
  );
  await waitFor(() =>
    expect(correctCountHistoryAction).toHaveBeenCalledWith({
      countId: "count",
      revision: "revision",
      reason: "Correct missing ending quantity",
      entries: [{ productId: "gin", quantity: "0" }],
    }),
  );
  expect(onClose).toHaveBeenCalled();
});
