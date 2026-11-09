import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import DashboardPage from "./page";
beforeEach(() => {
  mocks.user.mockResolvedValue({ role: "ADMINISTRATOR" });
  mocks.headers.mockResolvedValue(
    new Headers({ "user-agent": "iPhone Mobile Safari" }),
  );
});
it("offers the mobile choice to phone users with order permissions", async () => {
  await expect(DashboardPage()).rejects.toThrow("/mobile");
});
it("preserves the desktop full site and Starter Shack landing", async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ "user-agent": "Windows Chrome" }),
  );
  await expect(DashboardPage()).rejects.toThrow("/inventory");
  mocks.user.mockResolvedValue({ role: "INVENTORY_USER" });
  await expect(DashboardPage()).rejects.toThrow("/starter-shack");
});
it("does not offer receipt management to read-only users", async () => {
  mocks.user.mockResolvedValue({ role: "READ_ONLY" });
  await expect(DashboardPage()).rejects.toThrow("/inventory");
});
