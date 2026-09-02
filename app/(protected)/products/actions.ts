"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/authorization";
import {
  createProduct,
  ProductManagementError,
  setProductActive,
  updateProduct,
  type ManagedProduct,
  type ProductInput,
  type ProductRepository,
  type ProductStockUnit,
} from "@/lib/product-management";
import { currentUser } from "@/lib/session";

const actorSelect = { id: true, role: true, status: true } as const;
const productSelect = {
  id: true,
  name: true,
  categoryId: true,
  stockUnit: true,
  stockUnitLabel: true,
  allowFractionalStock: true,
  quantityScale: true,
  packageSize: true,
  purchaseUnit: true,
  unitsPerPurchaseUnit: true,
  active: true,
  starterShackRequestEligible: true,
} as const;

type ProductRecord = Omit<ManagedProduct, "unitsPerPurchaseUnit"> & {
  unitsPerPurchaseUnit: number | { toString(): string } | null;
};

function managedProduct(product: ProductRecord): ManagedProduct {
  return {
    ...product,
    unitsPerPurchaseUnit:
      product.unitsPerPurchaseUnit == null
        ? null
        : Number(product.unitsPerPurchaseUnit),
  };
}

const repository: ProductRepository = {
  transaction: (work) =>
    prisma.$transaction(
      async (transaction) =>
        work({
          findActorById: (id) =>
            transaction.user.findUnique({ where: { id }, select: actorSelect }),
          categoryExists: async (id) =>
            Boolean(
              await transaction.category.findUnique({
                where: { id },
                select: { id: true },
              }),
            ),
          findProductById: async (id) => {
            const product = await transaction.product.findUnique({
              where: { id },
              select: productSelect,
            });
            return product ? managedProduct(product) : null;
          },
          hasStockUnitActivity: async (productId) => {
            const [movement, requestLine] = await Promise.all([
              transaction.inventoryMovement.findFirst({
                where: { productId },
                select: { id: true },
              }),
              transaction.stockRequestLine.findFirst({
                where: { productId },
                select: { id: true },
              }),
            ]);
            return Boolean(movement || requestLine);
          },
          createProduct: async (input) => {
            const last = await transaction.product.aggregate({
              where: { categoryId: input.categoryId },
              _max: { displayOrder: true },
            });
            return managedProduct(
              await transaction.product.create({
                data: {
                  ...input,
                  displayOrder: (last._max.displayOrder ?? -1) + 1,
                },
                select: productSelect,
              }),
            );
          },
          configureAvailability: async (productId, starterShackEligible) => {
            const [bar, shack] = await Promise.all([
              transaction.location.findUnique({
                where: { code: "BAR" },
                select: { id: true, active: true },
              }),
              transaction.location.findUnique({
                where: { code: "STARTER_SHACK" },
                select: { id: true, active: true },
              }),
            ]);
            if (!bar?.active) return false;
            if (starterShackEligible && !shack?.active) return false;
            await transaction.productLocation.upsert({
              where: {
                productId_locationId: { productId, locationId: bar.id },
              },
              create: {
                productId,
                locationId: bar.id,
                active: true,
                reviewRequired: false,
              },
              update: { active: true, reviewRequired: false },
            });
            if (shack) {
              if (starterShackEligible)
                await transaction.productLocation.upsert({
                  where: {
                    productId_locationId: { productId, locationId: shack.id },
                  },
                  create: {
                    productId,
                    locationId: shack.id,
                    active: true,
                    reviewRequired: false,
                  },
                  update: { active: true, reviewRequired: false },
                });
              else
                await transaction.productLocation.updateMany({
                  where: { productId, locationId: shack.id },
                  data: { active: false, reviewRequired: false },
                });
            }
            return true;
          },
          updateProduct: async (id, input) =>
            managedProduct(
              await transaction.product.update({
                where: { id },
                data: input,
                select: productSelect,
              }),
            ),
          createAudit: (input) =>
            transaction.auditEvent.create({ data: input }),
        }),
      { isolationLevel: "Serializable" },
    ),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Catalog management permission is required.",
  INVALID_INPUT:
    "Review the Product name, category, stock unit, scale, and purchasing conversion.",
  PURCHASING_CONVERSION_REQUIRED:
    "Enter how many stock units are in the selected purchase unit, or choose Not specified.",
  CATEGORY_NOT_FOUND: "The selected category no longer exists.",
  PRODUCT_NOT_FOUND: "The selected Product no longer exists.",
  REQUIRED_LOCATION_UNAVAILABLE:
    "The Bar and any selected Starter Shack Location must be active.",
  UNIT_CONFIGURATION_LOCKED:
    "How this Product is counted cannot change after stock history exists. Purchasing details may still be updated.",
  NO_CHANGE: "No Product change was made.",
  CONFLICT: "Product data changed at the same time. Review it and try again.",
  FAILED: "The Product change could not be completed.",
};

function errorCode(error: unknown) {
  if (error instanceof ProductManagementError) return error.code;
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "P2034"
  )
    return "CONFLICT";
  console.error("Product mutation failed", error);
  return "FAILED";
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

async function productInput(formData: FormData): Promise<ProductInput> {
  const categoryId = String(formData.get("categoryId") ?? "");
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });
  const isHardLiquor = category?.name.trim().toLowerCase() === "hard liquor";
  const allowFractionalStock =
    isHardLiquor && formData.get("allowFractionalStock") === "on";
  const purchaseUnit = String(formData.get("purchaseUnit") ?? "")
    .trim()
    .toUpperCase();
  if (
    purchaseUnit &&
    !["CASE", "BOTTLE", "BOX", "OTHER"].includes(purchaseUnit)
  )
    throw new ProductManagementError("INVALID_INPUT");
  const unitsPerPurchaseUnit = optionalNumber(
    formData.get("unitsPerPurchaseUnit"),
  );
  if (
    (purchaseUnit && unitsPerPurchaseUnit == null) ||
    (!purchaseUnit && unitsPerPurchaseUnit != null)
  )
    throw new ProductManagementError("PURCHASING_CONVERSION_REQUIRED");
  return {
    name: String(formData.get("name") ?? ""),
    categoryId,
    stockUnit: String(formData.get("stockUnit") ?? "") as ProductStockUnit,
    stockUnitLabel: String(formData.get("stockUnitLabel") ?? ""),
    allowFractionalStock,
    quantityScale: allowFractionalStock ? 2 : 0,
    packageSize: String(formData.get("packageSize") ?? ""),
    purchaseUnit,
    unitsPerPurchaseUnit,
    starterShackRequestEligible:
      formData.get("starterShackRequestEligible") === "on",
  };
}

async function runProductMutation(
  work: (
    actor: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  ) => Promise<unknown>,
  success: string,
  returnCategoryId?: string,
) {
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new ProductManagementError("FORBIDDEN");
    await work(actor);
    revalidatePath("/products");
    revalidatePath("/settings");
    const categoryQuery = returnCategoryId
      ? `category=${encodeURIComponent(returnCategoryId)}&`
      : "";
    destination = `/products?${categoryQuery}success=${encodeURIComponent(success)}`;
  } catch (error) {
    const code = errorCode(error);
    const categoryQuery = returnCategoryId
      ? `category=${encodeURIComponent(returnCategoryId)}&`
      : "";
    destination = `/products?${categoryQuery}error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}

export async function createProductAction(formData: FormData) {
  await runProductMutation(
    async (actor) =>
      createProduct(actor, await productInput(formData), repository),
    "Product created.",
    String(formData.get("categoryId") ?? ""),
  );
}

export async function updateProductAction(formData: FormData) {
  await runProductMutation(
    async (actor) =>
      updateProduct(
        actor,
        String(formData.get("productId") ?? ""),
        await productInput(formData),
        repository,
      ),
    "Product updated.",
    String(formData.get("categoryId") ?? ""),
  );
}

export async function setProductActiveAction(formData: FormData) {
  const active = String(formData.get("active") ?? "");
  await runProductMutation(
    (actor) => {
      if (active !== "true" && active !== "false")
        throw new ProductManagementError("INVALID_INPUT");
      return setProductActive(
        actor,
        String(formData.get("productId") ?? ""),
        active === "true",
        repository,
      );
    },
    active === "true" ? "Product activated." : "Product deactivated.",
    String(formData.get("categoryId") ?? ""),
  );
}

export async function addProductNoteAction(formData: FormData) {
  await runProductMutation(
    async (actor) => {
      const body = String(formData.get("body") ?? "").trim();
      const productId = String(formData.get("productId") ?? "");
      if (!body || body.length > 2000)
        throw new ProductManagementError("INVALID_INPUT");
      const freshActor = await prisma.user.findUnique({
        where: { id: actor.id },
        select: actorSelect,
      });
      if (
        !freshActor ||
        freshActor.status !== "ACTIVE" ||
        !hasPermission(freshActor.role, "catalog:manage")
      )
        throw new ProductManagementError("FORBIDDEN");
      if (
        !(await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true },
        }))
      )
        throw new ProductManagementError("PRODUCT_NOT_FOUND");
      await prisma.productNote.create({
        data: { productId, authorId: freshActor.id, body },
      });
    },
    "Note added.",
    String(formData.get("categoryId") ?? ""),
  );
}

export async function deleteProductNoteAction(formData: FormData) {
  await runProductMutation(
    async (actor) => {
      const noteId = String(formData.get("noteId") ?? "");
      const freshActor = await prisma.user.findUnique({
        where: { id: actor.id },
        select: actorSelect,
      });
      if (
        !freshActor ||
        freshActor.status !== "ACTIVE" ||
        !hasPermission(freshActor.role, "catalog:manage")
      )
        throw new ProductManagementError("FORBIDDEN");
      const note = await prisma.productNote.findUnique({
        where: { id: noteId },
        select: { id: true },
      });
      if (!note) throw new ProductManagementError("NO_CHANGE");
      await prisma.productNote.delete({ where: { id: note.id } });
    },
    "Note deleted.",
    String(formData.get("categoryId") ?? ""),
  );
}

export async function reorderProductsAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) return { ok: false, message: messages.FORBIDDEN };
  const categoryId = String(formData.get("categoryId") ?? "");
  let productIds: string[];
  try {
    const value = JSON.parse(String(formData.get("productIds") ?? "[]"));
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== "string") ||
      new Set(value).size !== value.length
    )
      throw new Error("Invalid order");
    productIds = value;
  } catch {
    return { ok: false, message: messages.INVALID_INPUT };
  }
  try {
    await prisma.$transaction(
      async (transaction) => {
        const freshActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: actorSelect,
        });
        if (
          !freshActor ||
          freshActor.status !== "ACTIVE" ||
          !hasPermission(freshActor.role, "catalog:manage")
        )
          throw new ProductManagementError("FORBIDDEN");
        const products = await transaction.product.findMany({
          where: { categoryId },
          select: { id: true },
        });
        if (
          products.length !== productIds.length ||
          products.some((product) => !productIds.includes(product.id))
        )
          throw new ProductManagementError("INVALID_INPUT");
        for (const [displayOrder, id] of productIds.entries())
          await transaction.product.update({
            where: { id },
            data: { displayOrder },
          });
      },
      { isolationLevel: "Serializable" },
    );
    [
      "/products",
      "/inventory",
      "/deliveries",
      "/requests",
      "/starter-shack",
    ].forEach((path) => revalidatePath(path));
    return { ok: true, message: "Product order saved." };
  } catch (error) {
    const code = errorCode(error);
    return { ok: false, message: messages[code] ?? messages.FAILED };
  }
}
