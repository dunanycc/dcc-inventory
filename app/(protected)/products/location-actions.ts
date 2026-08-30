"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { configureProductLocation, ProductLocationManagementError, type ProductLocationRepository } from "@/lib/product-location-management";
import { currentUser } from "@/lib/session";

const repository: ProductLocationRepository = {
  transaction: (work) => prisma.$transaction(async (transaction) => work({
    findActorById: (id) => transaction.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } }),
    productExists: async (id) => Boolean(await transaction.product.findUnique({ where: { id }, select: { id: true } })),
    findLocationById: (id) => transaction.location.findUnique({ where: { id }, select: { id: true, code: true, name: true, active: true } }),
    findProductLocation: (productId, locationId) => transaction.productLocation.findUnique({ where: { productId_locationId: { productId, locationId } }, select: { productId: true, locationId: true, active: true, reviewRequired: true } }),
    createProductLocation: (input) => transaction.productLocation.create({ data: input, select: { productId: true, locationId: true, active: true, reviewRequired: true } }),
    updateProductLocation: (productId, locationId, input) => transaction.productLocation.update({ where: { productId_locationId: { productId, locationId } }, data: input, select: { productId: true, locationId: true, active: true, reviewRequired: true } }),
    createAudit: (input) => transaction.auditEvent.create({ data: input }),
  }), { isolationLevel: "Serializable" }),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Catalog management permission is required.",
  INVALID_INPUT: "The Product-to-Location configuration is invalid.",
  PRODUCT_NOT_FOUND: "The selected Product no longer exists.",
  LOCATION_NOT_FOUND: "The selected Location no longer exists.",
  INACTIVE_LOCATION: "Products cannot be stocked at an inactive Location.",
  NO_CHANGE: "No Product-to-Location change was made.",
  CONFLICT: "Location configuration changed at the same time. Review it and try again.",
  FAILED: "The Product-to-Location change could not be completed.",
};

function errorCode(error: unknown) {
  if (error instanceof ProductLocationManagementError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002") return "NO_CHANGE";
    if (error.code === "P2034") return "CONFLICT";
  }
  console.error("Product-to-Location mutation failed", error);
  return "FAILED";
}

export async function configureProductLocationAction(formData: FormData) {
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new ProductLocationManagementError("FORBIDDEN");
    const active = String(formData.get("active") ?? "");
    const reviewRequired = String(formData.get("reviewRequired") ?? "false");
    if ((active !== "true" && active !== "false") || (reviewRequired !== "true" && reviewRequired !== "false")) throw new ProductLocationManagementError("INVALID_INPUT");
    await configureProductLocation(actor, {
      productId: String(formData.get("productId") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      active: active === "true",
      reviewRequired: reviewRequired === "true",
    }, repository);
    revalidatePath("/products");
    destination = `/products?success=${encodeURIComponent("Product Location updated.")}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/products?error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}
