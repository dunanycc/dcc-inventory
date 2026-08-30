import { randomUUID } from "node:crypto";
import { hasPermission, type AppRole } from "./authorization";

export type ProductLocationActor = { id: string; role: AppRole; status: "ACTIVE" | "DISABLED" };
export type LocationReference = { id: string; code: string; name: string; active: boolean };
export type ProductLocationState = { productId: string; locationId: string; active: boolean; reviewRequired: boolean };
export type InventoryPostingConfiguration = {
  product: { active: boolean } | null;
  location: { active: boolean } | null;
  productLocation: { active: boolean; reviewRequired: boolean } | null;
};
export type InventoryPostingIneligibility = "PRODUCT_NOT_FOUND" | "PRODUCT_INACTIVE" | "LOCATION_NOT_FOUND" | "LOCATION_INACTIVE" | "PRODUCT_LOCATION_NOT_CONFIGURED" | "PRODUCT_LOCATION_INACTIVE" | "PRODUCT_LOCATION_REVIEW_REQUIRED";

export function inventoryPostingEligibility(configuration: InventoryPostingConfiguration): { eligible: true } | { eligible: false; reason: InventoryPostingIneligibility } {
  if (!configuration.product) return { eligible: false, reason: "PRODUCT_NOT_FOUND" };
  if (!configuration.product.active) return { eligible: false, reason: "PRODUCT_INACTIVE" };
  if (!configuration.location) return { eligible: false, reason: "LOCATION_NOT_FOUND" };
  if (!configuration.location.active) return { eligible: false, reason: "LOCATION_INACTIVE" };
  if (!configuration.productLocation) return { eligible: false, reason: "PRODUCT_LOCATION_NOT_CONFIGURED" };
  if (!configuration.productLocation.active) return { eligible: false, reason: "PRODUCT_LOCATION_INACTIVE" };
  if (configuration.productLocation.reviewRequired) return { eligible: false, reason: "PRODUCT_LOCATION_REVIEW_REQUIRED" };
  return { eligible: true };
}
export type ProductLocationAudit = {
  actorId: string;
  action: "PRODUCT_LOCATION_CONFIGURED" | "PRODUCT_LOCATION_ACTIVATED" | "PRODUCT_LOCATION_DEACTIVATED" | "PRODUCT_LOCATION_REVIEW_CHANGED";
  entityType: "ProductLocation";
  entityId: string;
  before?: object;
  after: object;
  reason?: string;
  correlationId: string;
};
export type ProductLocationTransaction = {
  findActorById(id: string): Promise<ProductLocationActor | null>;
  productExists(id: string): Promise<boolean>;
  findLocationById(id: string): Promise<LocationReference | null>;
  findProductLocation(productId: string, locationId: string): Promise<ProductLocationState | null>;
  createProductLocation(input: ProductLocationState & { sourceSystem?: string; sourceId?: string }): Promise<ProductLocationState>;
  updateProductLocation(productId: string, locationId: string, input: { active: boolean; reviewRequired: boolean }): Promise<ProductLocationState>;
  createAudit(input: ProductLocationAudit): Promise<unknown>;
};
export type ProductLocationRepository = { transaction<T>(work: (transaction: ProductLocationTransaction) => Promise<T>): Promise<T> };

export class ProductLocationManagementError extends Error {
  constructor(public code: "FORBIDDEN" | "INVALID_INPUT" | "PRODUCT_NOT_FOUND" | "LOCATION_NOT_FOUND" | "INACTIVE_LOCATION" | "NO_CHANGE") { super(code); }
}

async function requireCatalogManager(transaction: ProductLocationTransaction, actorId: string) {
  const actor = await transaction.findActorById(actorId);
  if (!actor || actor.status !== "ACTIVE" || !hasPermission(actor.role, "catalog:manage")) throw new ProductLocationManagementError("FORBIDDEN");
  return actor;
}

function snapshot(state: ProductLocationState, location: LocationReference) {
  return { productId: state.productId, locationId: state.locationId, locationCode: location.code, locationName: location.name, active: state.active, reviewRequired: state.reviewRequired };
}

export async function configureProductLocation(
  actor: ProductLocationActor,
  input: { productId: string; locationId: string; active: boolean; reviewRequired?: boolean; source?: { system: string; id: string } },
  repository: ProductLocationRepository,
) {
  if (!input.productId || !input.locationId || typeof input.active !== "boolean") throw new ProductLocationManagementError("INVALID_INPUT");
  const source = input.source ? { system: input.source.system.trim(), id: input.source.id.trim() } : undefined;
  if (source && (!source.system || !source.id || source.system.length > 100 || source.id.length > 200)) throw new ProductLocationManagementError("INVALID_INPUT");
  const reviewRequired = input.reviewRequired ?? false;

  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    if (!await transaction.productExists(input.productId)) throw new ProductLocationManagementError("PRODUCT_NOT_FOUND");
    const location = await transaction.findLocationById(input.locationId);
    if (!location) throw new ProductLocationManagementError("LOCATION_NOT_FOUND");
    if (input.active && !location.active) throw new ProductLocationManagementError("INACTIVE_LOCATION");
    const existing = await transaction.findProductLocation(input.productId, input.locationId);
    const correlationId = randomUUID();

    if (!existing) {
      const created = await transaction.createProductLocation({ productId: input.productId, locationId: input.locationId, active: input.active, reviewRequired, ...(source ? { sourceSystem: source.system, sourceId: source.id } : {}) });
      await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_LOCATION_CONFIGURED", entityType: "ProductLocation", entityId: `${input.productId}:${input.locationId}`, after: { ...snapshot(created, location), ...(source ? { source } : {}) }, reason: source ? `Configured from ${source.system}` : undefined, correlationId });
      return created;
    }
    if (existing.active === input.active && existing.reviewRequired === reviewRequired) throw new ProductLocationManagementError("NO_CHANGE");
    const updated = await transaction.updateProductLocation(input.productId, input.locationId, { active: input.active, reviewRequired });
    if (existing.active !== updated.active) await transaction.createAudit({ actorId: currentActor.id, action: updated.active ? "PRODUCT_LOCATION_ACTIVATED" : "PRODUCT_LOCATION_DEACTIVATED", entityType: "ProductLocation", entityId: `${input.productId}:${input.locationId}`, before: snapshot(existing, location), after: snapshot(updated, location), correlationId });
    if (existing.reviewRequired !== updated.reviewRequired) await transaction.createAudit({ actorId: currentActor.id, action: "PRODUCT_LOCATION_REVIEW_CHANGED", entityType: "ProductLocation", entityId: `${input.productId}:${input.locationId}`, before: snapshot(existing, location), after: snapshot(updated, location), correlationId });
    return updated;
  });
}
