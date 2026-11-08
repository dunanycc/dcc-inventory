import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
import { currentUser } from "./session";

beforeEach(() => vi.resetAllMocks());
describe("currentUser", () => {
  it("does not look up a user without an authenticated session", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await currentUser()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("requires the session user to still be active in the database", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "disabled-admin" } });
    mocks.findUnique.mockResolvedValue(null);
    expect(await currentUser()).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "disabled-admin", status: "ACTIVE" },
      }),
    );
  });
});
