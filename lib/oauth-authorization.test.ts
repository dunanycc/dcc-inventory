import { describe, expect, it, vi } from "vitest";
import { authorizeOAuthIdentity, bootstrapAdminEmails, type InventoryAuthUser } from "./oauth-authorization";

const administrator: InventoryAuthUser = {
  id: "admin-id", email: "admin@example.com", name: "Admin", role: "ADMINISTRATOR", status: "ACTIVE",
};

function dependencies(existing: InventoryAuthUser | null = null) {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(existing),
    createBootstrapAdministrator: vi.fn().mockResolvedValue(administrator),
  };
}

describe("OAuth Inventory authorization", () => {
  it("creates an active Administrator for an exact normalized bootstrap email", async () => {
    const deps = dependencies();
    const result = await authorizeOAuthIdentity(
      { email: " Admin@Example.com ", emailVerified: true, name: "Admin", provider: "google" }, deps,
      bootstrapAdminEmails("other@example.com, admin@example.com"),
    );
    expect(result).toEqual(administrator);
    expect(deps.createBootstrapAdministrator).toHaveBeenCalledWith({ email: "admin@example.com", name: "Admin", provider: "google" });
  });

  it("denies an unknown non-bootstrap user", async () => {
    const deps = dependencies();
    expect(await authorizeOAuthIdentity(
      { email: "member@example.com", emailVerified: true, name: "Member", provider: "google" }, deps,
      bootstrapAdminEmails("admin@example.com"),
    )).toBeNull();
    expect(deps.createBootstrapAdministrator).not.toHaveBeenCalled();
  });

  it("does not treat partial or domain-only bootstrap values as matches", async () => {
    const deps = dependencies();
    expect(await authorizeOAuthIdentity(
      { email: "not-admin@example.com", emailVerified: true, name: null, provider: "google" }, deps,
      bootstrapAdminEmails("admin@example.com,example.com"),
    )).toBeNull();
    expect(deps.createBootstrapAdministrator).not.toHaveBeenCalled();
  });

  it("keeps an existing disabled bootstrap-listed user denied", async () => {
    const deps = dependencies({ ...administrator, status: "DISABLED" });
    expect(await authorizeOAuthIdentity(
      { email: "admin@example.com", emailVerified: true, name: "Admin", provider: "yahoo" }, deps,
      bootstrapAdminEmails("admin@example.com"),
    )).toBeNull();
    expect(deps.createBootstrapAdministrator).not.toHaveBeenCalled();
  });

  it.each(["google", "yahoo"])("uses the same authorization path for %s", async (provider) => {
    const deps = dependencies(administrator);
    expect(await authorizeOAuthIdentity(
      { email: administrator.email, emailVerified: true, name: administrator.name, provider }, deps,
    )).toEqual(administrator);
    expect(deps.findUserByEmail).toHaveBeenCalledWith(administrator.email);
  });

  it("allows a pre-authorized user through verified matching OAuth", async () => {
    const approvedUser = { ...administrator, id: "approved-id", email: "approved@example.com", role: "INVENTORY_USER" };
    const deps = dependencies(approvedUser);
    expect(await authorizeOAuthIdentity(
      { email: " APPROVED@EXAMPLE.COM ", emailVerified: true, name: "Approved User", provider: "yahoo" }, deps,
      bootstrapAdminEmails("admin@example.com"),
    )).toEqual(approvedUser);
    expect(deps.createBootstrapAdministrator).not.toHaveBeenCalled();
  });

  it("returns an existing active user without changing its role or status", async () => {
    const manager = { ...administrator, role: "INVENTORY_MANAGER" };
    const deps = dependencies(manager);
    expect(await authorizeOAuthIdentity(
      { email: manager.email, emailVerified: true, name: "Changed OAuth Name", provider: "yahoo" }, deps,
      bootstrapAdminEmails(manager.email),
    )).toEqual(manager);
    expect(deps.createBootstrapAdministrator).not.toHaveBeenCalled();
  });

  it("requires the OAuth provider to verify the email", async () => {
    const deps = dependencies();
    expect(await authorizeOAuthIdentity(
      { email: administrator.email, emailVerified: false, name: administrator.name, provider: "google" }, deps,
      bootstrapAdminEmails(administrator.email),
    )).toBeNull();
    expect(deps.findUserByEmail).not.toHaveBeenCalled();
  });
});
