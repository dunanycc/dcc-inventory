"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { InventoryMovementError, postOpeningInventory, type MovementRecord, type MovementRepository } from "@/lib/inventory-movement";

function movementRecord(record: Omit<MovementRecord, "quantity"> & { quantity: { toString(): string } | string }): MovementRecord {
  return { ...record, quantity: record.quantity.toString() };
}

const repository: MovementRepository = {
  transaction: (work) => prisma.$transaction(async (transaction) => work({
    findActorById: (id) => transaction.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } }),
    findProductById: (id) => transaction.product.findUnique({ where: { id }, select: { id: true, active: true, allowFractionalStock: true, quantityScale: true } }),
    findLocationById: (id) => transaction.location.findUnique({ where: { id }, select: { id: true, active: true } }),
    findProductLocation: (productId, locationId) => transaction.productLocation.findUnique({ where: { productId_locationId: { productId, locationId } }, select: { active: true, reviewRequired: true } }),
    hasOpeningMovement: async (productId, locationId) => Boolean(await transaction.inventoryMovement.findFirst({ where: { type: "OPENING", productId, destinationLocationId: locationId }, select: { id: true } })),
    createMovement: async (input) => movementRecord(await transaction.inventoryMovement.create({ data: input, select: { id: true, type: true, productId: true, quantity: true, sourceLocationId: true, destinationLocationId: true, occurredAt: true, postedById: true, notes: true } })),
  }), { isolationLevel: "Serializable" }),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Inventory Manager permission is required to set opening inventory.",
  INVALID_INPUT: "Enter at least one positive quantity using the Product's counted-as unit.",
  PRODUCT_NOT_FOUND: "A selected Product no longer exists.",
  LOCATION_NOT_FOUND: "The selected Location no longer exists.",
  NOT_ELIGIBLE: "A Product or Location is inactive, unconfigured, or still requires review.",
  DUPLICATE_OPENING: "Opening inventory has already been set for one of these Products. Use a future physical count to correct tracked stock.",
  CONFLICT: "Opening inventory changed at the same time. Refresh and try again.",
  FAILED: "Opening inventory could not be saved.",
};

function errorCode(error: unknown) {
  if (error instanceof InventoryMovementError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002") return "DUPLICATE_OPENING";
    if (error.code === "P2034") return "CONFLICT";
  }
  console.error("Opening inventory failed", error);
  return "FAILED";
}

export async function setOpeningInventoryAction(formData: FormData) {
  const locationId = String(formData.get("locationId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryMovementError("FORBIDDEN");
    const entries = formData.getAll("productId").map((value) => {
      const productId = String(value);
      return { productId, quantity: String(formData.get(`quantity-${productId}`) ?? "").trim() };
    }).filter((entry) => entry.quantity && !/^0+(?:\.0+)?$/.test(entry.quantity));
    await postOpeningInventory(actor, { locationId, entries, occurredAt: new Date(), notes: String(formData.get("notes") ?? "") }, repository);
    revalidatePath("/inventory");
    revalidatePath("/products");
    destination = `/inventory?location=${encodeURIComponent(locationCode)}&success=${encodeURIComponent("Opening inventory saved.")}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/inventory?location=${encodeURIComponent(locationCode)}&error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}
