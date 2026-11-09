import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/session", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/delete-order-receipt", () => ({
  deleteOrderReceipt: mocks.remove,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { DELETE } from "./route";
const context = {
  params: Promise.resolve({ id: "order", receiptId: "receipt" }),
};
const request = (origin = "https://inventory.example.com") =>
  new Request(
    "https://inventory.example.com/api/orders/order/receipts/receipt",
    { method: "DELETE", headers: { origin } },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMINISTRATOR" });
  mocks.remove.mockResolvedValue(true);
});
it("requires a signed-in manager and same-origin request", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await DELETE(request(), context)).status).toBe(403);
  mocks.user.mockResolvedValue({ id: "reader", role: "READ_ONLY" });
  expect((await DELETE(request(), context)).status).toBe(403);
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMINISTRATOR" });
  expect(
    (await DELETE(request("https://evil.example.com"), context)).status,
  ).toBe(403);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("scopes deletion to the selected order and receipt", async () => {
  expect((await DELETE(request(), context)).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith("admin", "order", "receipt");
  mocks.remove.mockResolvedValue(false);
  expect((await DELETE(request(), context)).status).toBe(404);
});
