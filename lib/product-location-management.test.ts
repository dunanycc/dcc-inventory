import { describe, expect, it, vi } from "vitest";
import { configureProductLocation, inventoryPostingEligibility, type ProductLocationActor, type ProductLocationState, type ProductLocationTransaction } from "./product-location-management";

const admin: ProductLocationActor = { id: "admin", role: "ADMINISTRATOR", status: "ACTIVE" };
const manager: ProductLocationActor = { id: "manager", role: "INVENTORY_MANAGER", status: "ACTIVE" };
const reader: ProductLocationActor = { id: "reader", role: "READ_ONLY", status: "ACTIVE" };
const bar = { id: "bar", code: "BAR", name: "Bar", active: true };

function repository(initial: ProductLocationState | null = null) {
  let state: ProductLocationState | null = initial ? { ...initial } : null;
  const audits: unknown[] = [];
  const transaction: ProductLocationTransaction = {
    findActorById: vi.fn(async (id) => [admin, manager, reader].find((actor) => actor.id === id) ?? null),
    productExists: vi.fn(async (id) => id === "lager"),
    findLocationById: vi.fn(async (id) => id === bar.id ? bar : null),
    findProductLocation: vi.fn(async () => state ? { ...state } : null),
    createProductLocation: vi.fn(async (input) => { const created: ProductLocationState = { ...input }; state = created; return { ...created }; }),
    updateProductLocation: vi.fn(async (productId, locationId, input) => { const updated: ProductLocationState = { productId, locationId, ...input }; state = updated; return { ...updated }; }),
    createAudit: vi.fn(async (audit) => { audits.push(audit); }),
  };
  return { get state() { return state; }, audits, transaction, repository: { transaction: async <T>(work: (tx: ProductLocationTransaction) => Promise<T>) => work(transaction) } };
}

describe("Product-to-Location configuration", () => {
  it("creates one authoritative relationship and audits Product and Location context", async () => {
    const store = repository();
    await configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: true }, store.repository);
    expect(store.state).toEqual({ productId: "lager", locationId: bar.id, active: true, reviewRequired: false });
    expect(store.audits[0]).toMatchObject({ actorId: admin.id, action: "PRODUCT_LOCATION_CONFIGURED", entityId: "lager:bar", after: { productId: "lager", locationId: "bar", locationName: "Bar", active: true } });
  });

  it("honors catalog management and rejects unauthorized mutation", async () => {
    const managerStore = repository();
    await configureProductLocation(manager, { productId: "lager", locationId: bar.id, active: true }, managerStore.repository);
    const readerStore = repository();
    await expect(configureProductLocation(reader, { productId: "lager", locationId: bar.id, active: true }, readerStore.repository)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents duplicate unchanged configuration", async () => {
    const store = repository({ productId: "lager", locationId: bar.id, active: true, reviewRequired: false });
    await expect(configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: true }, store.repository)).rejects.toMatchObject({ code: "NO_CHANGE" });
    expect(store.transaction.createProductLocation).not.toHaveBeenCalled();
  });

  it("deactivates and reactivates without deleting the relationship", async () => {
    const store = repository({ productId: "lager", locationId: bar.id, active: true, reviewRequired: false });
    await configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: false }, store.repository);
    await configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: true }, store.repository);
    expect(store.state).toEqual({ productId: "lager", locationId: bar.id, active: true, reviewRequired: false });
    expect(store.audits).toEqual(expect.arrayContaining([expect.objectContaining({ action: "PRODUCT_LOCATION_DEACTIVATED" }), expect.objectContaining({ action: "PRODUCT_LOCATION_ACTIVATED" })]));
  });

  it("supports audited uncertain migration assignments for review", async () => {
    const store = repository();
    await configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: false, reviewRequired: true, source: { system: "future-migration", id: "row-8" } }, store.repository);
    expect(store.state).toMatchObject({ active: false, reviewRequired: true });
    expect(store.audits[0]).toMatchObject({ reason: "Configured from future-migration", after: { reviewRequired: true, source: { system: "future-migration", id: "row-8" } } });
  });

  it("resolves an uncertain assignment without changing its eligibility", async () => {
    const store = repository({ productId: "lager", locationId: bar.id, active: true, reviewRequired: true });
    await configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: true, reviewRequired: false }, store.repository);
    expect(store.state).toMatchObject({ active: true, reviewRequired: false });
    expect(store.audits[0]).toMatchObject({ action: "PRODUCT_LOCATION_REVIEW_CHANGED", before: { active: true, reviewRequired: true }, after: { active: true, reviewRequired: false } });
  });

  it("rejects missing Products, Locations, and activation at inactive Locations", async () => {
    const missingProduct = repository();
    await expect(configureProductLocation(admin, { productId: "missing", locationId: bar.id, active: true }, missingProduct.repository)).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    const missingLocation = repository();
    await expect(configureProductLocation(admin, { productId: "lager", locationId: "missing", active: true }, missingLocation.repository)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    const inactiveLocation = repository();
    vi.mocked(inactiveLocation.transaction.findLocationById).mockResolvedValue({ ...bar, active: false });
    await expect(configureProductLocation(admin, { productId: "lager", locationId: bar.id, active: true }, inactiveLocation.repository)).rejects.toMatchObject({ code: "INACTIVE_LOCATION" });
  });

  it.each([
    [{ product: null, location: { active: true }, productLocation: { active: true, reviewRequired: false } }, "PRODUCT_NOT_FOUND"],
    [{ product: { active: false }, location: { active: true }, productLocation: { active: true, reviewRequired: false } }, "PRODUCT_INACTIVE"],
    [{ product: { active: true }, location: null, productLocation: { active: true, reviewRequired: false } }, "LOCATION_NOT_FOUND"],
    [{ product: { active: true }, location: { active: false }, productLocation: { active: true, reviewRequired: false } }, "LOCATION_INACTIVE"],
    [{ product: { active: true }, location: { active: true }, productLocation: null }, "PRODUCT_LOCATION_NOT_CONFIGURED"],
    [{ product: { active: true }, location: { active: true }, productLocation: { active: false, reviewRequired: false } }, "PRODUCT_LOCATION_INACTIVE"],
    [{ product: { active: true }, location: { active: true }, productLocation: { active: true, reviewRequired: true } }, "PRODUCT_LOCATION_REVIEW_REQUIRED"],
  ])("rejects future inventory posting for every invalid configuration", (configuration, reason) => {
    expect(inventoryPostingEligibility(configuration)).toEqual({ eligible: false, reason });
  });

  it("allows future posting only for an active, reviewed Product-to-Location configuration", () => {
    expect(inventoryPostingEligibility({ product: { active: true }, location: { active: true }, productLocation: { active: true, reviewRequired: false } })).toEqual({ eligible: true });
  });
});
