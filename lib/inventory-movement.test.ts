import { describe, expect, it, vi } from "vitest";
import {
  normalizeStockQuantity,
  postInventoryMovement,
  postOpeningInventory,
  type MovementActor,
  type MovementCreateInput,
  type MovementRecord,
  type MovementTransaction,
} from "./inventory-movement";

const administrator: MovementActor = {
  id: "admin",
  role: "ADMINISTRATOR",
  status: "ACTIVE",
};
const manager: MovementActor = {
  id: "manager",
  role: "INVENTORY_MANAGER",
  status: "ACTIVE",
};
const inventoryUser: MovementActor = {
  id: "user",
  role: "INVENTORY_USER",
  status: "ACTIVE",
};

function repository() {
  const movements: MovementRecord[] = [];
  const transaction: MovementTransaction = {
    findActorById: vi.fn(
      async (id) =>
        [administrator, manager, inventoryUser].find(
          (actor) => actor.id === id,
        ) ?? null,
    ),
    findProductById: vi.fn(async (id) =>
      id === "lager"
        ? { id, active: true, allowFractionalStock: false, quantityScale: 0 }
        : id === "keg"
          ? { id, active: true, allowFractionalStock: true, quantityScale: 2 }
          : null,
    ),
    findLocationById: vi.fn(async (id) =>
      ["bar", "shack"].includes(id) ? { id, active: true } : null,
    ),
    findProductLocation: vi.fn(async () => ({
      active: true,
      reviewRequired: false,
    })),
    hasOpeningMovement: vi.fn(async (productId, locationId) =>
      movements.some(
        (movement) =>
          movement.type === "OPENING" &&
          movement.productId === productId &&
          movement.destinationLocationId === locationId,
      ),
    ),
    createMovement: vi.fn(async (input: MovementCreateInput) => {
      const movement = { id: `movement-${movements.length}`, ...input };
      movements.push(movement);
      return movement;
    }),
  };
  return {
    movements,
    transaction,
    repository: {
      transaction: async <T>(work: (tx: MovementTransaction) => Promise<T>) =>
        work(transaction),
    },
  };
}

describe("InventoryMovement stock history", () => {
  it("posts OPENING into one eligible destination and records the poster", async () => {
    const store = repository();
    const movement = await postInventoryMovement(
      manager,
      {
        type: "OPENING",
        productId: "lager",
        quantity: "24",
        destinationLocationId: "bar",
        occurredAt: new Date("2026-01-01T12:00:00Z"),
      },
      store.repository,
    );
    expect(movement).toMatchObject({
      type: "OPENING",
      quantity: "24",
      sourceLocationId: null,
      destinationLocationId: "bar",
      postedById: manager.id,
    });
  });

  it("posts RECEIPT into a destination with its future source reference", async () => {
    const store = repository();
    await postInventoryMovement(
      manager,
      {
        type: "RECEIPT",
        productId: "lager",
        quantity: "12",
        destinationLocationId: "bar",
        occurredAt: new Date(),
        references: { receiptLineId: "receipt-line" },
      },
      store.repository,
    );
    expect(store.transaction.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptLineId: "receipt-line",
        sourceLocationId: null,
        destinationLocationId: "bar",
      }),
    );
  });

  it("posts TRANSFER from source to destination only after both are eligible", async () => {
    const store = repository();
    await postInventoryMovement(
      administrator,
      {
        type: "TRANSFER",
        productId: "lager",
        quantity: "3",
        sourceLocationId: "bar",
        destinationLocationId: "shack",
        occurredAt: new Date(),
      },
      store.repository,
    );
    expect(store.transaction.findProductLocation).toHaveBeenCalledTimes(2);
    expect(store.movements[0]).toMatchObject({
      sourceLocationId: "bar",
      destinationLocationId: "shack",
      quantity: "3",
    });
  });

  it("maps positive and negative count adjustments to destination and source", async () => {
    const positive = repository();
    await postInventoryMovement(
      manager,
      {
        type: "COUNT_ADJUSTMENT",
        productId: "keg",
        quantity: "1.25",
        locationId: "bar",
        occurredAt: new Date(),
      },
      positive.repository,
    );
    expect(positive.movements[0]).toMatchObject({
      quantity: "1.25",
      sourceLocationId: null,
      destinationLocationId: "bar",
    });
    const negative = repository();
    await postInventoryMovement(
      manager,
      {
        type: "COUNT_ADJUSTMENT",
        productId: "keg",
        quantity: "-0.50",
        locationId: "bar",
        occurredAt: new Date(),
      },
      negative.repository,
    );
    expect(negative.movements[0]).toMatchObject({
      quantity: "0.50",
      sourceLocationId: "bar",
      destinationLocationId: null,
    });
  });

  it.each([
    [
      "inactive Product",
      async (store: ReturnType<typeof repository>) =>
        vi.mocked(store.transaction.findProductById).mockResolvedValue({
          id: "lager",
          active: false,
          allowFractionalStock: false,
          quantityScale: 0,
        }),
    ],
    [
      "inactive Location",
      async (store: ReturnType<typeof repository>) =>
        vi
          .mocked(store.transaction.findLocationById)
          .mockResolvedValue({ id: "bar", active: false }),
    ],
    [
      "missing ProductLocation",
      async (store: ReturnType<typeof repository>) =>
        vi
          .mocked(store.transaction.findProductLocation)
          .mockResolvedValue(null),
    ],
    [
      "inactive ProductLocation",
      async (store: ReturnType<typeof repository>) =>
        vi
          .mocked(store.transaction.findProductLocation)
          .mockResolvedValue({ active: false, reviewRequired: false }),
    ],
    [
      "review-required ProductLocation",
      async (store: ReturnType<typeof repository>) =>
        vi
          .mocked(store.transaction.findProductLocation)
          .mockResolvedValue({ active: true, reviewRequired: true }),
    ],
  ])("rejects posting for an %s", async (_label, arrange) => {
    const store = repository();
    await arrange(store);
    await expect(
      postInventoryMovement(
        manager,
        {
          type: "OPENING",
          productId: "lager",
          quantity: "1",
          destinationLocationId: "bar",
          occurredAt: new Date(),
        },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("enforces Product quantity precision and nonzero positive movement storage", () => {
    expect(
      normalizeStockQuantity("1.25", {
        allowFractionalStock: true,
        quantityScale: 2,
      }),
    ).toEqual({ negative: false, quantity: "1.25" });
    expect(() =>
      normalizeStockQuantity("1.2", {
        allowFractionalStock: false,
        quantityScale: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() =>
      normalizeStockQuantity("0", {
        allowFractionalStock: false,
        quantityScale: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("allows only users with operations:post and rechecks current authorization", async () => {
    const store = repository();
    await expect(
      postInventoryMovement(
        inventoryUser,
        {
          type: "OPENING",
          productId: "lager",
          quantity: "1",
          destinationLocationId: "bar",
          occurredAt: new Date(),
        },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.transaction.createMovement).not.toHaveBeenCalled();
  });

  it("posts an opening batch atomically and prevents duplicate Product entries", async () => {
    const store = repository();
    await postOpeningInventory(
      manager,
      {
        locationId: "bar",
        entries: [
          {
            productId: "lager",
            quantity: "24",
            source: { system: "legacy-2026", id: "bar-lager-opening" },
          },
          {
            productId: "keg",
            quantity: "1.50",
            source: { system: "legacy-2026", id: "bar-keg-opening" },
          },
        ],
      },
      store.repository,
    );
    expect(store.movements).toHaveLength(2);
    expect(store.transaction.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: "legacy-2026",
        sourceId: "bar-lager-opening",
      }),
    );
    await expect(
      postOpeningInventory(
        manager,
        { locationId: "bar", entries: [{ productId: "lager", quantity: "1" }] },
        store.repository,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPENING" });
  });
});
