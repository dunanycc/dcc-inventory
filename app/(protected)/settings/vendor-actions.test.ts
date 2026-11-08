import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  deleteMany: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { vendor: { deleteMany: mocks.deleteMany } },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(url), { digest: "NEXT_REDIRECT" });
  },
}));
import { deleteVendorAction } from "./vendor-actions";

function data() {
  const form = new FormData();
  form.set("vendorId", "unused-vendor");
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "admin", role: "ADMINISTRATOR" });
});
describe("deleteVendorAction", () => {
  it("deletes only vendors without any delivery history", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteVendorAction(data())).rejects.toThrow(
      "Vendor%20deleted.",
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "unused-vendor", deliveries: { none: {} } },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
  it("reports a vendor with history without deleting it", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteVendorAction(data())).rejects.toThrow(
      "delivery%20history",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects unauthorized deletion", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(deleteVendorAction(data())).rejects.toThrow("FORBIDDEN");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("handles a concurrent delivery reference safely", async () => {
    mocks.deleteMany.mockRejectedValue({ code: "P2003" });
    await expect(deleteVendorAction(data())).rejects.toThrow(
      "must%20be%20hidden",
    );
  });
});
