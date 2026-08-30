import { describe, expect, it, vi } from "vitest";
import { accountingUnitChangeAllowed, accountingUnitConfigurationChanged, createProduct, normalizeProductInput, setProductActive, updateProduct, type ManagedProduct, type ProductActor, type ProductTransaction } from "./product-management";

const admin: ProductActor = { id: "admin", role: "ADMINISTRATOR", status: "ACTIVE" };
const manager: ProductActor = { id: "manager", role: "INVENTORY_MANAGER", status: "ACTIVE" };
const reader: ProductActor = { id: "reader", role: "READ_ONLY", status: "ACTIVE" };
const product: ManagedProduct = { id: "lager", name: "Club Lager", categoryId: "beer", stockUnit: "CAN", stockUnitLabel: null, allowFractionalStock: false, quantityScale: 0, packageSize: "355 mL", purchaseUnit: "CASE", unitsPerPurchaseUnit: 24, active: true, starterShackRequestEligible: true };

function repository(initial = product) {
  let state = { ...initial };
  const audits: unknown[] = [];
  const transaction: ProductTransaction = {
    findActorById: vi.fn(async (id) => [admin, manager, reader].find((actor) => actor.id === id) ?? null),
    categoryExists: vi.fn(async (id) => ["beer", "wine"].includes(id)),
    findProductById: vi.fn(async (id) => id === state.id ? { ...state } : null),
    hasStockUnitActivity: vi.fn(async () => false),
    createProduct: vi.fn(async (input) => { state = { id: "created", ...input }; return { ...state }; }),
    updateProduct: vi.fn(async (_id, input) => { state = { ...state, ...input }; return { ...state }; }),
    createAudit: vi.fn(async (audit) => { audits.push(audit); }),
  };
  return { get state() { return state; }, audits, transaction, repository: { transaction: async <T>(work: (tx: ProductTransaction) => Promise<T>) => work(transaction) } };
}

function input(overrides: Partial<Omit<ManagedProduct, "id">> = {}) {
  return { name: product.name, categoryId: product.categoryId, stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock, quantityScale: product.quantityScale, packageSize: product.packageSize, purchaseUnit: product.purchaseUnit, unitsPerPurchaseUnit: product.unitsPerPurchaseUnit, active: product.active, starterShackRequestEligible: product.starterShackRequestEligible, ...overrides };
}

describe("Product administration", () => {
  it("creates a Product with one authoritative stock unit and audits it", async () => {
    const store = repository();
    const created = await createProduct(admin, input({ name: " New Lager " }), store.repository);
    expect(created).toMatchObject({ id: "created", name: "New Lager", stockUnit: "CAN", unitsPerPurchaseUnit: 24 });
    expect(store.audits[0]).toMatchObject({ action: "PRODUCT_CREATED", actorId: admin.id, entityId: "created", after: { stockUnit: "CAN" } });
  });

  it("persists stable migration source identity through the validated create path", async () => {
    const store = repository();
    await createProduct(admin, { ...input(), source: { system: "legacy-workbook", id: "product-42" } }, store.repository);
    expect(store.transaction.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sourceSystem: "legacy-workbook", sourceId: "product-42" }));
    expect(store.audits[0]).toMatchObject({ after: { source: { system: "legacy-workbook", id: "product-42" } } });
  });

  it("honors catalog:manage and denies read-only mutation", async () => {
    const managerStore = repository();
    await setProductActive(manager, product.id, false, managerStore.repository);
    expect(managerStore.state.active).toBe(false);
    const readerStore = repository();
    await expect(setProductActive(reader, product.id, false, readerStore.repository)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    [{ ...product, purchaseUnit: "CASE", unitsPerPurchaseUnit: null }, "missing conversion"],
    [{ ...product, purchaseUnit: null, unitsPerPurchaseUnit: 24 }, "conversion without purchase unit"],
    [{ ...product, unitsPerPurchaseUnit: 0 }, "non-positive conversion"],
    [{ ...product, unitsPerPurchaseUnit: 1.2345 }, "conversion precision"],
    [{ ...product, allowFractionalStock: false, quantityScale: 2 }, "integer product with scale"],
    [{ ...product, allowFractionalStock: true, quantityScale: 0 }, "fractional product without scale"],
    [{ ...product, stockUnit: "OTHER", stockUnitLabel: null }, "unlabelled other unit"],
  ])("rejects impossible unit configuration: %s", (input, description) => {
    expect(description).toBeTruthy();
    expect(() => normalizeProductInput(input as never)).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("allows uncertain units to be staged explicitly without inventing a conversion", () => {
    expect(normalizeProductInput(input({ stockUnit: "OTHER", stockUnitLabel: "Review required", purchaseUnit: null, unitsPerPurchaseUnit: null, active: false }))).toMatchObject({ stockUnit: "OTHER", stockUnitLabel: "Review required", active: false, unitsPerPurchaseUnit: null });
  });

  it("defines the stock-history unit freeze without freezing purchase conversions", () => {
    const stockUnitChange = { ...product, stockUnit: "BOTTLE" as const };
    const purchaseConversionChange = { ...product, unitsPerPurchaseUnit: 12 };
    expect(accountingUnitConfigurationChanged(product, stockUnitChange)).toBe(true);
    expect(accountingUnitChangeAllowed(false, product, stockUnitChange)).toBe(true);
    expect(accountingUnitChangeAllowed(true, product, stockUnitChange)).toBe(false);
    expect(accountingUnitChangeAllowed(true, product, purchaseConversionChange)).toBe(true);
  });

  it("blocks accounting-significant unit changes after stock history exists", async () => {
    const store = repository();
    vi.mocked(store.transaction.hasStockUnitActivity).mockResolvedValue(true);
    await expect(updateProduct(admin, product.id, input({ stockUnit: "BOTTLE" }), store.repository)).rejects.toMatchObject({ code: "UNIT_CONFIGURATION_LOCKED" });
    expect(store.transaction.updateProduct).not.toHaveBeenCalled();
  });

  it("allows purchase conversion edits after stock history exists", async () => {
    const store = repository();
    vi.mocked(store.transaction.hasStockUnitActivity).mockResolvedValue(true);
    await updateProduct(admin, product.id, input({ purchaseUnit: "TRAY", unitsPerPurchaseUnit: 12 }), store.repository);
    expect(store.state).toMatchObject({ purchaseUnit: "TRAY", unitsPerPurchaseUnit: 12 });
  });

  it("keeps Starter Shack request eligibility independent from inventory-location configuration", () => {
    expect(normalizeProductInput(input({ starterShackRequestEligible: true }))).toMatchObject({ starterShackRequestEligible: true });
  });

  it("audits general, category, and unit changes separately with stable identity", async () => {
    const store = repository();
    await updateProduct(admin, product.id, input({ name: "Club Lager 2", categoryId: "wine", stockUnit: "BOTTLE", purchaseUnit: "TRAY", unitsPerPurchaseUnit: 12 }), store.repository);
    expect(store.state.id).toBe(product.id);
    expect(store.audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "PRODUCT_UPDATED", before: expect.objectContaining({ name: "Club Lager" }), after: expect.objectContaining({ name: "Club Lager 2" }) }),
      expect.objectContaining({ action: "PRODUCT_CATEGORY_CHANGED", before: { categoryId: "beer" }, after: { categoryId: "wine" } }),
      expect.objectContaining({ action: "PRODUCT_UNIT_CONFIGURATION_CHANGED", before: expect.objectContaining({ stockUnit: "CAN" }), after: expect.objectContaining({ stockUnit: "BOTTLE" }) }),
    ]));
  });

  it("activates and deactivates without deleting the Product", async () => {
    const store = repository();
    await setProductActive(admin, product.id, false, store.repository);
    await setProductActive(admin, product.id, true, store.repository);
    expect(store.state).toMatchObject({ id: product.id, active: true });
    expect(store.audits).toEqual(expect.arrayContaining([expect.objectContaining({ action: "PRODUCT_DEACTIVATED" }), expect.objectContaining({ action: "PRODUCT_ACTIVATED" })]));
  });
});
