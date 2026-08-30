import { randomUUID } from "node:crypto";
import { hasPermission, type AppRole } from "./authorization";

export const STOCK_UNITS = ["CAN", "BOTTLE", "KEG", "EACH", "PACKAGE", "OTHER"] as const;
export type ProductStockUnit = (typeof STOCK_UNITS)[number];

export type ProductActor = { id: string; role: AppRole; status: "ACTIVE" | "DISABLED" };
export type ManagedProduct = {
  id: string;
  name: string;
  categoryId: string;
  stockUnit: ProductStockUnit;
  stockUnitLabel: string | null;
  allowFractionalStock: boolean;
  quantityScale: number;
  packageSize: string | null;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: number | null;
  active: boolean;
  starterShackRequestEligible: boolean;
};

export type ProductInput = Omit<ManagedProduct, "id" | "active"> & {
  active?: boolean;
  source?: { system: string; id: string };
};

export type ProductAudit = {
  actorId: string;
  action: "PRODUCT_CREATED" | "PRODUCT_UPDATED" | "PRODUCT_CATEGORY_CHANGED" | "PRODUCT_UNIT_CONFIGURATION_CHANGED" | "PRODUCT_ACTIVATED" | "PRODUCT_DEACTIVATED";
  entityType: "Product";
  entityId: string;
  before?: object;
  after: object;
  reason?: string;
  correlationId: string;
};

export type ProductTransaction = {
  findActorById(id: string): Promise<ProductActor | null>;
  categoryExists(id: string): Promise<boolean>;
  findProductById(id: string): Promise<ManagedProduct | null>;
  createProduct(input: Omit<ManagedProduct, "id"> & { sourceSystem?: string; sourceId?: string }): Promise<ManagedProduct>;
  updateProduct(id: string, input: Partial<Omit<ManagedProduct, "id">>): Promise<ManagedProduct>;
  createAudit(input: ProductAudit): Promise<unknown>;
};
export type ProductRepository = { transaction<T>(work: (transaction: ProductTransaction) => Promise<T>): Promise<T> };

export class ProductManagementError extends Error {
  constructor(public code: "FORBIDDEN" | "INVALID_INPUT" | "CATEGORY_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "NO_CHANGE") { super(code); }
}

function cleanOptional(value: string | null | undefined, maximum: number) {
  const cleaned = value?.trim().replace(/\s+/g, " ") || null;
  if (cleaned && cleaned.length > maximum) throw new ProductManagementError("INVALID_INPUT");
  return cleaned;
}

function decimalPlaces(value: number) {
  const text = String(value);
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

export function normalizeProductInput(input: ProductInput): Omit<ManagedProduct, "id"> & { source?: ProductInput["source"] } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 160 || !input.categoryId) throw new ProductManagementError("INVALID_INPUT");
  if (!STOCK_UNITS.includes(input.stockUnit)) throw new ProductManagementError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.quantityScale) || input.quantityScale < 0 || input.quantityScale > 6) throw new ProductManagementError("INVALID_INPUT");
  if (!input.allowFractionalStock && input.quantityScale !== 0) throw new ProductManagementError("INVALID_INPUT");
  if (input.allowFractionalStock && input.quantityScale === 0) throw new ProductManagementError("INVALID_INPUT");

  const stockUnitLabel = cleanOptional(input.stockUnitLabel, 80);
  if (input.stockUnit === "OTHER" && !stockUnitLabel) throw new ProductManagementError("INVALID_INPUT");
  const purchaseUnit = cleanOptional(input.purchaseUnit, 80);
  const conversion = input.unitsPerPurchaseUnit;
  if ((purchaseUnit && conversion == null) || (!purchaseUnit && conversion != null)) throw new ProductManagementError("INVALID_INPUT");
  if (conversion != null && (!Number.isFinite(conversion) || conversion <= 0 || conversion > 999_999_999.999 || decimalPlaces(conversion) > 3)) throw new ProductManagementError("INVALID_INPUT");

  const source = input.source ? { system: input.source.system.trim(), id: input.source.id.trim() } : undefined;
  if (source && (!source.system || !source.id || source.system.length > 100 || source.id.length > 200)) throw new ProductManagementError("INVALID_INPUT");
  return {
    name,
    categoryId: input.categoryId,
    stockUnit: input.stockUnit,
    stockUnitLabel: input.stockUnit === "OTHER" ? stockUnitLabel : null,
    allowFractionalStock: input.allowFractionalStock,
    quantityScale: input.quantityScale,
    packageSize: cleanOptional(input.packageSize, 120),
    purchaseUnit,
    unitsPerPurchaseUnit: conversion,
    active: input.active ?? true,
    starterShackRequestEligible: input.starterShackRequestEligible,
    ...(source ? { source } : {}),
  };
}

function snapshot(product: ManagedProduct) {
  return { name: product.name, categoryId: product.categoryId, stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock, quantityScale: product.quantityScale, packageSize: product.packageSize, purchaseUnit: product.purchaseUnit, unitsPerPurchaseUnit: product.unitsPerPurchaseUnit, active: product.active, starterShackRequestEligible: product.starterShackRequestEligible };
}
function generalSnapshot(product: ManagedProduct) { return { name: product.name, packageSize: product.packageSize, starterShackRequestEligible: product.starterShackRequestEligible }; }
function unitSnapshot(product: ManagedProduct) { return { stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock, quantityScale: product.quantityScale, purchaseUnit: product.purchaseUnit, unitsPerPurchaseUnit: product.unitsPerPurchaseUnit }; }
export function accountingUnitSnapshot(product: Pick<ManagedProduct, "stockUnit" | "stockUnitLabel" | "allowFractionalStock" | "quantityScale">) {
  return { stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock, quantityScale: product.quantityScale };
}
export function accountingUnitConfigurationChanged(before: Pick<ManagedProduct, "stockUnit" | "stockUnitLabel" | "allowFractionalStock" | "quantityScale">, after: Pick<ManagedProduct, "stockUnit" | "stockUnitLabel" | "allowFractionalStock" | "quantityScale">) {
  return changed(accountingUnitSnapshot(before), accountingUnitSnapshot(after));
}
export function accountingUnitChangeAllowed(hasLedgerEntries: boolean, before: Pick<ManagedProduct, "stockUnit" | "stockUnitLabel" | "allowFractionalStock" | "quantityScale">, after: Pick<ManagedProduct, "stockUnit" | "stockUnitLabel" | "allowFractionalStock" | "quantityScale">) {
  return !hasLedgerEntries || !accountingUnitConfigurationChanged(before, after);
}
function changed(before: object, after: object) { return JSON.stringify(before) !== JSON.stringify(after); }
function editableData(product: Omit<ManagedProduct, "id">) {
  return { name: product.name, categoryId: product.categoryId, stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock, quantityScale: product.quantityScale, packageSize: product.packageSize, purchaseUnit: product.purchaseUnit, unitsPerPurchaseUnit: product.unitsPerPurchaseUnit, starterShackRequestEligible: product.starterShackRequestEligible };
}

async function requireCatalogManager(transaction: ProductTransaction, actorId: string) {
  const actor = await transaction.findActorById(actorId);
  if (!actor || actor.status !== "ACTIVE" || !hasPermission(actor.role, "catalog:manage")) throw new ProductManagementError("FORBIDDEN");
  return actor;
}

export async function createProduct(actor: ProductActor, input: ProductInput, repository: ProductRepository) {
  const normalized = normalizeProductInput(input);
  const { source, ...productData } = normalized;
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    if (!await transaction.categoryExists(productData.categoryId)) throw new ProductManagementError("CATEGORY_NOT_FOUND");
    const created = await transaction.createProduct({ ...productData, ...(source ? { sourceSystem: source.system, sourceId: source.id } : {}) });
    await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: created.id, after: { ...snapshot(created), ...(source ? { source } : {}) }, reason: source ? `Created from ${source.system}` : undefined, correlationId: randomUUID() });
    return created;
  });
}

export async function updateProduct(actor: ProductActor, productId: string, input: ProductInput, repository: ProductRepository) {
  const normalized = normalizeProductInput(input);
  const productData = editableData(normalized);
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    const product = await transaction.findProductById(productId);
    if (!product) throw new ProductManagementError("PRODUCT_NOT_FOUND");
    if (!await transaction.categoryExists(productData.categoryId)) throw new ProductManagementError("CATEGORY_NOT_FOUND");
    const proposed: ManagedProduct = { ...product, ...productData };
    const generalChanged = changed(generalSnapshot(product), generalSnapshot(proposed));
    const categoryChanged = product.categoryId !== proposed.categoryId;
    const unitsChanged = changed(unitSnapshot(product), unitSnapshot(proposed));
    // Future ledger integration point: while holding the same Serializable transaction,
    // query whether this Product has ledger entries and reject when
    // accountingUnitChangeAllowed(hasLedgerEntries, product, proposed) is false.
    if (!generalChanged && !categoryChanged && !unitsChanged) throw new ProductManagementError("NO_CHANGE");
    const updated = await transaction.updateProduct(product.id, productData);
    const correlationId = randomUUID();
    if (generalChanged) await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: product.id, before: generalSnapshot(product), after: generalSnapshot(updated), correlationId });
    if (categoryChanged) await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_CATEGORY_CHANGED", entityType: "Product", entityId: product.id, before: { categoryId: product.categoryId }, after: { categoryId: updated.categoryId }, correlationId });
    if (unitsChanged) await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_UNIT_CONFIGURATION_CHANGED", entityType: "Product", entityId: product.id, before: unitSnapshot(product), after: unitSnapshot(updated), correlationId });
    return updated;
  });
}

export async function setProductActive(actor: ProductActor, productId: string, active: boolean, repository: ProductRepository) {
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    const product = await transaction.findProductById(productId);
    if (!product) throw new ProductManagementError("PRODUCT_NOT_FOUND");
    if (product.active === active) throw new ProductManagementError("NO_CHANGE");
    const before = snapshot(product);
    const updated = await transaction.updateProduct(product.id, { active });
    await transaction.createAudit({ actorId: currentActor.id, action: active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED", entityType: "Product", entityId: product.id, before, after: snapshot(updated), correlationId: randomUUID() });
    return updated;
  });
}
