"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCategory, CategoryManagementError, renameCategory, reorderCategory, setCategoryActive, type CategoryRepository } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
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
    destination = `/settings?success=${encodeURIComponent(success)}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/settings?error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}

export async function createCategoryAction(formData: FormData) {
  await runCategoryMutation(
    (actor) => createCategory(actor, { name: String(formData.get("name") ?? ""), displayOrder: Number(formData.get("displayOrder")) }, repository),
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
