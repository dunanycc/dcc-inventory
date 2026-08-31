"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createProduct, ProductManagementError, setProductActive, updateProduct, type ManagedProduct, type ProductInput, type ProductRepository, type ProductStockUnit } from "@/lib/product-management";
import { currentUser } from "@/lib/session";

const actorSelect = { id: true, role: true, status: true } as const;
const productSelect = { id: true, name: true, categoryId: true, stockUnit: true, stockUnitLabel: true, allowFractionalStock: true, quantityScale: true, packageSize: true, purchaseUnit: true, unitsPerPurchaseUnit: true, active: true, starterShackRequestEligible: true } as const;

type ProductRecord = Omit<ManagedProduct, "unitsPerPurchaseUnit"> & { unitsPerPurchaseUnit: number | { toString(): string } | null };

function managedProduct(product: ProductRecord): ManagedProduct {
  return { ...product, unitsPerPurchaseUnit: product.unitsPerPurchaseUnit == null ? null : Number(product.unitsPerPurchaseUnit) };
}

const repository: ProductRepository = {
  transaction: (work) => prisma.$transaction(async (transaction) => work({
    findActorById: (id) => transaction.user.findUnique({ where: { id }, select: actorSelect }),
    categoryExists: async (id) => Boolean(await transaction.category.findUnique({ where: { id }, select: { id: true } })),
    findProductById: async (id) => {
      const product = await transaction.product.findUnique({ where: { id }, select: productSelect });
      return product ? managedProduct(product) : null;
    },
    hasStockUnitActivity: async (productId) => {
      const [movement, requestLine] = await Promise.all([
        transaction.inventoryMovement.findFirst({ where: { productId }, select: { id: true } }),
        transaction.stockRequestLine.findFirst({ where: { productId }, select: { id: true } }),
      ]);
      return Boolean(movement || requestLine);
    },
    createProduct: async (input) => managedProduct(await transaction.product.create({ data: input, select: productSelect })),
    configureAvailability: async (productId, starterShackEligible) => {
      const [bar, shack] = await Promise.all([
        transaction.location.findUnique({ where: { code: "BAR" }, select: { id: true, active: true } }),
        transaction.location.findUnique({ where: { code: "STARTER_SHACK" }, select: { id: true, active: true } }),
      ]);
      if (!bar?.active) return false;
      if (starterShackEligible && !shack?.active) return false;
      await transaction.productLocation.upsert({ where: { productId_locationId: { productId, locationId: bar.id } }, create: { productId, locationId: bar.id, active: true, reviewRequired: false }, update: { active: true, reviewRequired: false } });
      if (shack) {
        if (starterShackEligible) await transaction.productLocation.upsert({ where: { productId_locationId: { productId, locationId: shack.id } }, create: { productId, locationId: shack.id, active: true, reviewRequired: false }, update: { active: true, reviewRequired: false } });
        else await transaction.productLocation.updateMany({ where: { productId, locationId: shack.id }, data: { active: false, reviewRequired: false } });
      }
      return true;
    },
    updateProduct: async (id, input) => managedProduct(await transaction.product.update({ where: { id }, data: input, select: productSelect })),
    createAudit: (input) => transaction.auditEvent.create({ data: input }),
  }), { isolationLevel: "Serializable" }),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Catalog management permission is required.",
  INVALID_INPUT: "Review the Product name, category, stock unit, scale, and purchasing conversion.",
  CATEGORY_NOT_FOUND: "The selected category no longer exists.",
  PRODUCT_NOT_FOUND: "The selected Product no longer exists.",
  REQUIRED_LOCATION_UNAVAILABLE: "The Bar and any selected Starter Shack Location must be active.",
  UNIT_CONFIGURATION_LOCKED: "How this Product is counted cannot change after stock history exists. Purchasing details may still be updated.",
  NO_CHANGE: "No Product change was made.",
  CONFLICT: "Product data changed at the same time. Review it and try again.",
  FAILED: "The Product change could not be completed.",
};

function errorCode(error: unknown) {
  if (error instanceof ProductManagementError) return error.code;
  if (typeof error === "object" && error && "code" in error && error.code === "P2034") return "CONFLICT";
  console.error("Product mutation failed", error);
  return "FAILED";
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

async function productInput(formData: FormData): Promise<ProductInput> {
  const categoryId = String(formData.get("categoryId") ?? "");
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  const isHardLiquor = category?.name.trim().toLowerCase() === "hard liquor";
  const allowFractionalStock = isHardLiquor && formData.get("allowFractionalStock") === "on";
  return {
    name: String(formData.get("name") ?? ""),
    categoryId,
    stockUnit: String(formData.get("stockUnit") ?? "") as ProductStockUnit,
    stockUnitLabel: String(formData.get("stockUnitLabel") ?? ""),
    allowFractionalStock,
    quantityScale: allowFractionalStock ? 2 : 0,
    packageSize: String(formData.get("packageSize") ?? ""),
    purchaseUnit: String(formData.get("purchaseUnit") ?? ""),
    unitsPerPurchaseUnit: optionalNumber(formData.get("unitsPerPurchaseUnit")),
    starterShackRequestEligible: formData.get("starterShackRequestEligible") === "on",
  };
}

async function runProductMutation(work: (actor: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<unknown>, success: string) {
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new ProductManagementError("FORBIDDEN");
    await work(actor);
    revalidatePath("/products");
    revalidatePath("/settings");
    destination = `/products?success=${encodeURIComponent(success)}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/products?error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}

export async function createProductAction(formData: FormData) {
  await runProductMutation(async (actor) => createProduct(actor, await productInput(formData), repository), "Product created.");
}

export async function updateProductAction(formData: FormData) {
  await runProductMutation(async (actor) => updateProduct(actor, String(formData.get("productId") ?? ""), await productInput(formData), repository), "Product updated.");
}

export async function setProductActiveAction(formData: FormData) {
  const active = String(formData.get("active") ?? "");
  await runProductMutation((actor) => {
    if (active !== "true" && active !== "false") throw new ProductManagementError("INVALID_INPUT");
    return setProductActive(actor, String(formData.get("productId") ?? ""), active === "true", repository);
  }, active === "true" ? "Product activated." : "Product deactivated.");
}
