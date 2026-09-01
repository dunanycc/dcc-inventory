import { describe, expect, it, vi } from "vitest";
import {
  createCategory,
  normalizeCategoryName,
  orderedCategories,
  renameCategory,
  reorderCategory,
  setCategoryActive,
  type CategoryActor,
  type CategoryTransaction,
  type ManagedCategory,
} from "./category-management";

const administrator: CategoryActor = {
  id: "admin",
  role: "ADMINISTRATOR",
  status: "ACTIVE",
};
const manager: CategoryActor = {
  id: "manager",
  role: "INVENTORY_MANAGER",
  status: "ACTIVE",
};
const reader: CategoryActor = {
  id: "reader",
  role: "INVENTORY_USER",
  status: "ACTIVE",
};

function repository(
  initial: Array<ManagedCategory & { productIds?: string[] }>,
  actors = [administrator, manager, reader],
) {
  const state = initial.map((category) => ({
    ...category,
    productIds: [...(category.productIds ?? [])],
  }));
  const audits: unknown[] = [];
  const transaction: CategoryTransaction = {
    findActorById: vi.fn(
      async (id) => actors.find((actor) => actor.id === id) ?? null,
    ),
    findCategoryById: vi.fn(
      async (id) => state.find((category) => category.id === id) ?? null,
    ),
    listCategoryNames: vi.fn(async () =>
      state.map(({ id, name }) => ({ id, name })),
    ),
    createCategory: vi.fn(async (input) => {
      const category = {
        id: `category-${state.length}`,
        ...input,
        productIds: [],
      };
      state.push(category);
      return category;
    }),
    updateCategory: vi.fn(async (id, data) => {
      const category = state.find((item) => item.id === id)!;
      Object.assign(category, data);
      return { ...category };
    }),
    createAudit: vi.fn(async (audit) => {
      audits.push(audit);
    }),
  };
  return {
    state,
    audits,
    transaction,
    repository: {
      transaction: async <T>(work: (tx: CategoryTransaction) => Promise<T>) =>
        work(transaction),
    },
  };
}

const beer = {
  id: "beer",
  name: "Beer",
  displayOrder: 2,
  active: true,
  productIds: ["lager"],
};

describe("Category administration", () => {
  it("allows an Administrator to create a category with explicit order and audit it", async () => {
    const store = repository([]);
    const created = await createCategory(
      administrator,
      { name: "  Packaged   Beer ", displayOrder: 4 },
      store.repository,
    );
    expect(created).toMatchObject({
      name: "Packaged Beer",
      displayOrder: 4,
      active: true,
    });
    expect(store.audits[0]).toMatchObject({
      actorId: administrator.id,
      action: "CATEGORY_CREATED",
      entityId: created.id,
      after: { displayOrder: 4 },
    });
  });

  it("preserves the existing catalog:manage grant for Inventory Managers", async () => {
    const store = repository([beer]);
    await reorderCategory(manager, beer.id, 5, store.repository);
    expect(store.state[0].displayOrder).toBe(5);
  });

  it("rejects create and rename for roles without catalog management", async () => {
    const store = repository([beer]);
    await expect(
      createCategory(
        reader,
        { name: "Wine", displayOrder: 1 },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      renameCategory(reader, beer.id, "Ale", store.repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.transaction.updateCategory).not.toHaveBeenCalled();
  });

  it("prevents normalized duplicate names on create and rename", async () => {
    const store = repository([
      beer,
      { id: "wine", name: "Table Wine", displayOrder: 3, active: true },
    ]);
    expect(normalizeCategoryName(" TABLE   wine ")).toBe("table wine");
    await expect(
      createCategory(
        administrator,
        { name: " beer ", displayOrder: 5 },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
    await expect(
      renameCategory(administrator, "wine", " BEER ", store.repository),
    ).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
  });

  it("renames and reorders by stable ID with distinct audit actions", async () => {
    const store = repository([beer]);
    await renameCategory(
      administrator,
      beer.id,
      "Draft Beer",
      store.repository,
    );
    await reorderCategory(administrator, beer.id, 7, store.repository);
    expect(store.state[0]).toMatchObject({
      id: beer.id,
      name: "Draft Beer",
      displayOrder: 7,
    });
    expect(store.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CATEGORY_RENAMED",
          before: expect.objectContaining({ name: "Beer" }),
          after: expect.objectContaining({ name: "Draft Beer" }),
        }),
        expect.objectContaining({
          action: "CATEGORY_REORDERED",
          before: expect.objectContaining({ displayOrder: 2 }),
          after: expect.objectContaining({ displayOrder: 7 }),
        }),
      ]),
    );
  });

  it("orders deterministically by display order and stable ID without collation-dependent name sorting", () => {
    const categories = [
      { id: "z", name: "Wine", displayOrder: 2, active: true },
      { id: "b", name: "Beer", displayOrder: 1, active: false },
      { id: "a", name: "Beer", displayOrder: 1, active: true },
    ];
    expect(
      orderedCategories(categories).map((category) => category.id),
    ).toEqual(["a", "b", "z"]);
    expect(
      orderedCategories(categories, false).map((category) => category.id),
    ).toEqual(["a", "z"]);
  });

  it("deactivates and reactivates without disturbing product relationships", async () => {
    const store = repository([beer]);
    await setCategoryActive(manager, beer.id, false, store.repository);
    expect(store.state[0]).toMatchObject({
      active: false,
      productIds: ["lager"],
    });
    await setCategoryActive(manager, beer.id, true, store.repository);
    expect(store.state[0]).toMatchObject({
      active: true,
      productIds: ["lager"],
    });
    expect(store.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CATEGORY_DEACTIVATED",
          before: expect.objectContaining({ active: true }),
          after: expect.objectContaining({ active: false }),
        }),
        expect.objectContaining({
          action: "CATEGORY_REACTIVATED",
          before: expect.objectContaining({ active: false }),
          after: expect.objectContaining({ active: true }),
        }),
      ]),
    );
  });

  it("accepts source traceability through the same validated create path", async () => {
    const store = repository([]);
    await createCategory(
      administrator,
      {
        name: "Wine",
        displayOrder: 9,
        source: { system: "future-migration", id: "row-12" },
      },
      store.repository,
    );
    expect(store.transaction.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        nameNormalized: "wine",
        sourceSystem: "future-migration",
        sourceId: "row-12",
      }),
    );
    expect(store.audits[0]).toMatchObject({
      reason: "Created from future-migration",
      after: { source: { system: "future-migration", id: "row-12" } },
    });
  });
});
