"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCategory, CategoryManagementError, renameCategory, reorderCategory, setCategoryActive, type CategoryRepository } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/authorization";
import { currentUser } from "@/lib/session";

const categorySelect = { id: true, name: true, displayOrder: true, active: true } as const;
const actorSelect = { id: true, role: true, status: true } as const;

const repository: CategoryRepository = {
  transaction: (work) => prisma.$transaction(async (transaction) => work({
    findActorById: (id) => transaction.user.findUnique({ where: { id }, select: actorSelect }),
    findCategoryById: (id) => transaction.category.findUnique({ where: { id }, select: categorySelect }),
    listCategoryNames: () => transaction.category.findMany({ select: { id: true, name: true } }),
    createCategory: (input) => transaction.category.create({ data: input, select: categorySelect }),
    updateCategory: (id, data) => transaction.category.update({ where: { id }, data, select: categorySelect }),
    createAudit: (input) => transaction.auditEvent.create({ data: input }),
  }), { isolationLevel: "Serializable" }),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Catalog management permission is required.",
  INVALID_INPUT: "Enter a valid category name and non-negative display order.",
  DUPLICATE_NAME: "A category with that normalized name already exists.",
  CATEGORY_NOT_FOUND: "The selected category no longer exists.",
  NO_CHANGE: "No category change was made.",
  CONFLICT: "Categories changed at the same time. Review the current order and try again.",
  FAILED: "The category change could not be completed.",
};

function errorCode(error: unknown) {
  if (error instanceof CategoryManagementError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002") return "DUPLICATE_NAME";
    if (error.code === "P2034") return "CONFLICT";
  }
  console.error("Category mutation failed", error);
  return "FAILED";
}

async function runCategoryMutation(work: (actor: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<unknown>, success: string) {
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new CategoryManagementError("FORBIDDEN");
    await work(actor);
    revalidatePath("/settings");
    revalidatePath("/products");
    destination = `/settings?tab=categories&success=${encodeURIComponent(success)}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/settings?tab=categories&error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}

export async function createCategoryAction(formData: FormData) {
  const last = await prisma.category.aggregate({ _max: { displayOrder: true } });
  await runCategoryMutation(
    (actor) => createCategory(actor, { name: String(formData.get("name") ?? ""), displayOrder: (last._max.displayOrder ?? -1) + 1 }, repository),
    "Category created.",
  );
}

export async function renameCategoryAction(formData: FormData) {
  await runCategoryMutation(
    (actor) => renameCategory(actor, String(formData.get("categoryId") ?? ""), String(formData.get("name") ?? ""), repository),
    "Category renamed.",
  );
}

export async function reorderCategoryAction(formData: FormData) {
  await runCategoryMutation(
    (actor) => reorderCategory(actor, String(formData.get("categoryId") ?? ""), Number(formData.get("displayOrder")), repository),
    "Category order updated.",
  );
}

export async function reorderCategoriesAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) return { ok: false, message: messages.FORBIDDEN };
  let categoryIds: string[];
  try {
    const value = JSON.parse(String(formData.get("categoryIds") ?? "[]"));
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length) throw new Error("Invalid order");
    categoryIds = value;
  } catch {
    return { ok: false, message: messages.INVALID_INPUT };
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const freshActor = await transaction.user.findUnique({ where: { id: actor.id }, select: actorSelect });
      if (!freshActor || freshActor.status !== "ACTIVE" || !hasPermission(freshActor.role, "catalog:manage")) throw new CategoryManagementError("FORBIDDEN");
      const categories = await transaction.category.findMany({ select: categorySelect });
      if (categories.length !== categoryIds.length || categories.some((category) => !categoryIds.includes(category.id))) throw new CategoryManagementError("INVALID_INPUT");
      const correlationId = randomUUID();
      for (const [displayOrder, id] of categoryIds.entries()) {
        const category = categories.find((item) => item.id === id)!;
        if (category.displayOrder === displayOrder) continue;
        await transaction.category.update({ where: { id }, data: { displayOrder } });
        await transaction.auditEvent.create({ data: { actorId: freshActor.id, action: "CATEGORY_REORDERED", entityType: "Category", entityId: id, before: { name: category.name, displayOrder: category.displayOrder, active: category.active }, after: { name: category.name, displayOrder, active: category.active }, correlationId } });
      }
    }, { isolationLevel: "Serializable" });
    ["/settings", "/products", "/inventory", "/requests", "/deliveries"].forEach((path) => revalidatePath(path));
    return { ok: true, message: "Category order saved." };
  } catch (error) {
    const code = errorCode(error);
    return { ok: false, message: messages[code] ?? messages.FAILED };
  }
}

export async function setCategoryActiveAction(formData: FormData) {
  const active = String(formData.get("active") ?? "");
  await runCategoryMutation(
    (actor) => {
      if (active !== "true" && active !== "false") throw new CategoryManagementError("INVALID_INPUT");
      return setCategoryActive(actor, String(formData.get("categoryId") ?? ""), active === "true", repository);
    },
    active === "true" ? "Category reactivated." : "Category deactivated.",
  );
}
