import { describe, expect, it } from "vitest";
import { hasPermission, isStarterShackStaff, landingPathForRole, requirePermission, type AppRole } from "./authorization";

describe("role permissions", () => {
  it.each<[AppRole, boolean, boolean]>([
    ["ADMINISTRATOR", true, true], ["INVENTORY_MANAGER", true, false],
    ["INVENTORY_USER", false, false], ["READ_ONLY", false, false],
  ])("enforces elevated boundaries for %s", (role, canPost, canManageUsers) => {
    expect(hasPermission(role, "inventory:view")).toBe(true);
    expect(hasPermission(role, "operations:post")).toBe(canPost);
    expect(hasPermission(role, "users:manage")).toBe(canManageUsers);
  });

  it("throws on a denied server-side permission", () => {
    expect(() => requirePermission("INVENTORY_USER", "operations:post")).toThrow("FORBIDDEN");
  });

  it("limits Inventory Users to the Starter Shack request workspace", () => {
    expect(isStarterShackStaff("INVENTORY_USER")).toBe(true);
    expect(landingPathForRole("INVENTORY_USER")).toBe("/requests");
    expect(landingPathForRole("INVENTORY_MANAGER")).toBe("/inventory");
    expect(landingPathForRole("ADMINISTRATOR")).toBe("/inventory");
    expect(landingPathForRole("READ_ONLY")).toBe("/inventory");
  });
});
