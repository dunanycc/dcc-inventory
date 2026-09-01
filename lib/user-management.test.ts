import { describe, expect, it, vi } from "vitest";
import {
  changeUserRole,
  preauthorizeUser,
  setUserStatus,
  type ManagedUser,
  type UserManagementTransaction,
} from "./user-management";

const admin: ManagedUser = {
  id: "admin",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMINISTRATOR",
  status: "ACTIVE",
};
const manager: ManagedUser = {
  id: "manager",
  email: "manager@example.com",
  name: "Manager",
  role: "INVENTORY_MANAGER",
  status: "ACTIVE",
};

function repository(users: ManagedUser[], activeAdminCount = 1) {
  const state = users.map((user) => ({ ...user }));
  const audits: unknown[] = [];
  const transaction: UserManagementTransaction = {
    findUserByEmail: vi.fn(
      async (email) => state.find((user) => user.email === email) ?? null,
    ),
    findUserById: vi.fn(
      async (id) => state.find((user) => user.id === id) ?? null,
    ),
    countActiveAdministrators: vi.fn(async () => activeAdminCount),
    createUser: vi.fn(async (input) => {
      const user: ManagedUser = {
        id: `user-${state.length}`,
        status: "ACTIVE",
        ...input,
      };
      state.push(user);
      return user;
    }),
    updateUser: vi.fn(async (id, data) => {
      const user = state.find((item) => item.id === id)!;
      Object.assign(user, data);
      return { ...user };
    }),
    createAudit: vi.fn(async (audit) => {
      audits.push(audit);
    }),
  };
  return {
    transaction,
    audits,
    repository: {
      transaction: async <T>(
        work: (tx: UserManagementTransaction) => Promise<T>,
      ) => work(transaction),
    },
  };
}

describe("Administrator user management", () => {
  it("allows an Administrator to pre-authorize a normalized email and audits it", async () => {
    const store = repository([admin]);
    const created = await preauthorizeUser(
      admin,
      {
        email: " New.User@Example.COM ",
        name: " New User ",
        role: "INVENTORY_USER",
      },
      store.repository,
    );
    expect(created).toMatchObject({
      email: "new.user@example.com",
      name: "New User",
      role: "INVENTORY_USER",
      status: "ACTIVE",
    });
    expect(store.audits[0]).toMatchObject({
      actorId: admin.id,
      action: "USER_PREAUTHORIZED",
      entityId: created.id,
      after: { email: created.email },
    });
  });

  it("denies a non-Administrator mutation", async () => {
    const store = repository([admin, manager]);
    await expect(
      preauthorizeUser(
        manager,
        { email: "user@example.com", role: "READ_ONLY" },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.transaction.createUser).not.toHaveBeenCalled();
  });

  it("prevents duplicate authorization after normalization", async () => {
    const store = repository([
      admin,
      { ...manager, email: "member@example.com" },
    ]);
    await expect(
      preauthorizeUser(
        admin,
        { email: " MEMBER@EXAMPLE.COM ", role: "READ_ONLY" },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_EMAIL" });
  });

  it("authorizes and audits role changes", async () => {
    const store = repository([admin, manager]);
    await changeUserRole(admin, manager.id, "READ_ONLY", store.repository);
    expect(store.audits[0]).toMatchObject({
      action: "USER_ROLE_CHANGED",
      before: { role: "INVENTORY_MANAGER" },
      after: { role: "READ_ONLY" },
    });
  });

  it("denies non-Administrator role and status changes", async () => {
    const store = repository([admin, manager]);
    await expect(
      changeUserRole(manager, admin.id, "READ_ONLY", store.repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setUserStatus(manager, admin.id, "DISABLED", store.repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audits disable and enable actions", async () => {
    const store = repository([admin, manager]);
    await setUserStatus(admin, manager.id, "DISABLED", store.repository);
    await setUserStatus(admin, manager.id, "ACTIVE", store.repository);
    expect(store.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "USER_DISABLED",
          before: expect.objectContaining({ status: "ACTIVE" }),
          after: expect.objectContaining({ status: "DISABLED" }),
        }),
        expect.objectContaining({
          action: "USER_ENABLED",
          before: expect.objectContaining({ status: "DISABLED" }),
          after: expect.objectContaining({ status: "ACTIVE" }),
        }),
      ]),
    );
  });

  it("cannot disable or demote the last active Administrator", async () => {
    const store = repository([admin], 1);
    await expect(
      setUserStatus(admin, admin.id, "DISABLED", store.repository),
    ).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMINISTRATOR" });
    await expect(
      changeUserRole(admin, admin.id, "READ_ONLY", store.repository),
    ).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMINISTRATOR" });
    expect(store.transaction.updateUser).not.toHaveBeenCalled();
  });
});
