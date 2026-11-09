import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  setCookie: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ currentUser: mocks.user }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: mocks.setCookie }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
vi.mock("@/lib/request-notifications", () => ({
  notifyNewStockRequest: mocks.notify,
  notifyStockRequestChanged: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: mocks.find },
    stockRequestNotificationSettings: {
      findUnique: async () => ({ orderNotificationEmail: "bar@example.com" }),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        product: { findMany: mocks.find },
        stockRequest: { create: mocks.create },
      }),
  },
}));
import {
  submitStockRequestAction,
  fulfillStockRequestAction,
} from "@/app/(protected)/requests/actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
  mocks.find.mockResolvedValue([
    {
      id: "can",
      name: "Cola",
      stockUnit: "CAN",
      packageSize: "355ml",
      active: true,
      starterShackRequestEligible: true,
      allowFractionalStock: false,
      quantityScale: 0,
      productLocations: ["BAR", "STARTER_SHACK"].map((code) => ({
        active: true,
        reviewRequired: false,
        location: { code, active: true },
      })),
    },
  ]);
  mocks.create.mockResolvedValue({ id: "new-request" });
});
it("allows public requests with a browser tracking cookie and no invented user", async () => {
  const form = new FormData();
  form.set("items", JSON.stringify([{ productId: "can", quantity: "2" }]));
  await expect(submitStockRequestAction(form)).rejects.toThrow("success=");
  expect(mocks.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      requestedById: null,
      publicSessionId: expect.any(String),
    }),
  });
  expect(mocks.setCookie).toHaveBeenCalledWith(
    "shack-session",
    expect.any(String),
    expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
  );
  expect(mocks.notify).toHaveBeenCalledWith(
    "bar@example.com",
    "Starter Shack",
    "new-request",
    expect.any(Array),
    null,
  );
});
it("continues to reject anonymous fulfilment", async () => {
  const form = new FormData();
  form.set("requestId", "request");
  await expect(fulfillStockRequestAction(form)).rejects.toThrow("error=");
  expect(mocks.create).not.toHaveBeenCalled();
});
