import { randomUUID } from "node:crypto";
import { hasPermission, type AppRole } from "./authorization";

export type ManagedCategory = {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
};

export type CategoryActor = {
  id: string;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
};

export type CategoryAudit = {
  actorId: string;
  action:
    | "CATEGORY_CREATED"
    | "CATEGORY_RENAMED"
    | "CATEGORY_REORDERED"
    | "CATEGORY_DEACTIVATED"
    | "CATEGORY_REACTIVATED";
  entityType: "Category";
  entityId: string;
  before?: object;
  after: object;
  reason?: string;
  correlationId: string;
};

export type CategoryTransaction = {
  findActorById(id: string): Promise<CategoryActor | null>;
  findCategoryById(id: string): Promise<ManagedCategory | null>;
  listCategoryNames(): Promise<Array<{ id: string; name: string }>>;
  createCategory(input: {
    name: string;
    nameNormalized: string;
    displayOrder: number;
    active: boolean;
    sourceSystem?: string;
    sourceId?: string;
  }): Promise<ManagedCategory>;
  updateCategory(
    id: string,
    data: {
      name?: string;
      nameNormalized?: string;
      displayOrder?: number;
      active?: boolean;
    },
  ): Promise<ManagedCategory>;
  createAudit(input: CategoryAudit): Promise<unknown>;
};

export type CategoryRepository = {
  transaction<T>(
    work: (transaction: CategoryTransaction) => Promise<T>,
  ): Promise<T>;
};

export class CategoryManagementError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "DUPLICATE_NAME"
      | "CATEGORY_NOT_FOUND"
      | "NO_CHANGE",
  ) {
    super(code);
  }
}

export const CATEGORY_ORDER_BY = [
  { displayOrder: "asc" as const },
  { id: "asc" as const },
];

export function normalizeCategoryName(name: string) {
  return categoryDisplayName(name).toLowerCase();
}

export function categoryDisplayName(name: string) {
  return name
    .replace(/[\t\r\n\f\v]/g, " ")
    .trim()
    .replace(/ +/g, " ");
}

export function orderedCategories<T extends ManagedCategory>(
  categories: readonly T[],
  includeInactive = true,
) {
  return categories
    .filter((category) => includeInactive || category.active)
    .toSorted(
      (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
    );
}

function parseName(value: string) {
  const name = categoryDisplayName(value);
  if (!name || name.length > 120)
    throw new CategoryManagementError("INVALID_INPUT");
  return name;
}

function parseDisplayOrder(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000)
    throw new CategoryManagementError("INVALID_INPUT");
  return value;
}

function snapshot(category: ManagedCategory) {
  return {
    name: category.name,
    displayOrder: category.displayOrder,
    active: category.active,
  };
}

async function requireCatalogManager(
  transaction: CategoryTransaction,
  actorId: string,
) {
  const actor = await transaction.findActorById(actorId);
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "catalog:manage")
  )
    throw new CategoryManagementError("FORBIDDEN");
  return actor;
}

async function ensureUniqueName(
  transaction: CategoryTransaction,
  name: string,
  exceptId?: string,
) {
  const normalized = normalizeCategoryName(name);
  const duplicate = (await transaction.listCategoryNames()).some(
    (category) =>
      category.id !== exceptId &&
      normalizeCategoryName(category.name) === normalized,
  );
  if (duplicate) throw new CategoryManagementError("DUPLICATE_NAME");
}

export async function createCategory(
  actor: CategoryActor,
  input: {
    name: string;
    displayOrder: number;
    source?: { system: string; id: string };
  },
  repository: CategoryRepository,
) {
  const name = parseName(input.name);
  const displayOrder = parseDisplayOrder(input.displayOrder);
  const source = input.source
    ? { system: input.source.system.trim(), id: input.source.id.trim() }
    : undefined;
  if (
    source &&
    (!source.system ||
      !source.id ||
      source.system.length > 100 ||
      source.id.length > 200)
  )
    throw new CategoryManagementError("INVALID_INPUT");
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    await ensureUniqueName(transaction, name);
    const created = await transaction.createCategory({
      name,
      nameNormalized: normalizeCategoryName(name),
      displayOrder,
      active: true,
      ...(source ? { sourceSystem: source.system, sourceId: source.id } : {}),
    });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: "CATEGORY_CREATED",
      entityType: "Category",
      entityId: created.id,
      after: { ...snapshot(created), ...(source ? { source } : {}) },
      reason: source ? `Created from ${source.system}` : undefined,
      correlationId: randomUUID(),
    });
    return created;
  });
}

export async function renameCategory(
  actor: CategoryActor,
  categoryId: string,
  requestedName: string,
  repository: CategoryRepository,
) {
  const name = parseName(requestedName);
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    const category = await transaction.findCategoryById(categoryId);
    if (!category) throw new CategoryManagementError("CATEGORY_NOT_FOUND");
    if (category.name === name) throw new CategoryManagementError("NO_CHANGE");
    await ensureUniqueName(transaction, name, category.id);
    const before = snapshot(category);
    const updated = await transaction.updateCategory(category.id, {
      name,
      nameNormalized: normalizeCategoryName(name),
    });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: "CATEGORY_RENAMED",
      entityType: "Category",
      entityId: category.id,
      before,
      after: snapshot(updated),
      correlationId: randomUUID(),
    });
    return updated;
  });
}

export async function reorderCategory(
  actor: CategoryActor,
  categoryId: string,
  requestedOrder: number,
  repository: CategoryRepository,
) {
  const displayOrder = parseDisplayOrder(requestedOrder);
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    const category = await transaction.findCategoryById(categoryId);
    if (!category) throw new CategoryManagementError("CATEGORY_NOT_FOUND");
    if (category.displayOrder === displayOrder)
      throw new CategoryManagementError("NO_CHANGE");
    const before = snapshot(category);
    const updated = await transaction.updateCategory(category.id, {
      displayOrder,
    });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: "CATEGORY_REORDERED",
      entityType: "Category",
      entityId: category.id,
      before,
      after: snapshot(updated),
      correlationId: randomUUID(),
    });
    return updated;
  });
}

export async function setCategoryActive(
  actor: CategoryActor,
  categoryId: string,
  active: boolean,
  repository: CategoryRepository,
) {
  return repository.transaction(async (transaction) => {
    const currentActor = await requireCatalogManager(transaction, actor.id);
    const category = await transaction.findCategoryById(categoryId);
    if (!category) throw new CategoryManagementError("CATEGORY_NOT_FOUND");
    if (category.active === active)
      throw new CategoryManagementError("NO_CHANGE");
    const before = snapshot(category);
    const updated = await transaction.updateCategory(category.id, { active });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: active ? "CATEGORY_REACTIVATED" : "CATEGORY_DEACTIVATED",
      entityType: "Category",
      entityId: category.id,
      before,
      after: snapshot(updated),
      correlationId: randomUUID(),
    });
    return updated;
  });
}
