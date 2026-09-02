"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import {
  InventoryMovementError,
  postOpeningInventory,
} from "@/lib/inventory-movement";
import { prismaMovementRepository as repository } from "@/lib/prisma-movement-repository";

const messages: Record<string, string> = {
  FORBIDDEN:
    "Inventory Manager permission is required to set opening inventory.",
  INVALID_INPUT:
    "Enter at least one positive quantity using the Product's counted-as unit.",
  PRODUCT_NOT_FOUND: "A selected Product no longer exists.",
  LOCATION_NOT_FOUND: "The selected Location no longer exists.",
  NOT_ELIGIBLE:
    "A Product or Location is inactive, unconfigured, or still requires review.",
  DUPLICATE_OPENING:
    "Opening inventory has already been set for one of these Products. Use a future physical count to correct tracked stock.",
  CONFLICT:
    "Opening inventory changed at the same time. Refresh and try again.",
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
  const categoryId = String(formData.get("categoryId") ?? "");
  const returnContext = `location=${encodeURIComponent(locationCode)}&category=${encodeURIComponent(categoryId)}`;
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryMovementError("FORBIDDEN");
    const entries = formData
      .getAll("productId")
      .map((value) => {
        const productId = String(value);
        return {
          productId,
          quantity: String(formData.get(`quantity-${productId}`) ?? "").trim(),
        };
      })
      .filter(
        (entry) => entry.quantity && !/^0+(?:\.0+)?$/.test(entry.quantity),
      );
    await postOpeningInventory(
      actor,
      {
        locationId,
        entries,
        occurredAt: new Date(),
        notes: String(formData.get("notes") ?? ""),
      },
      repository,
    );
    revalidatePath("/inventory");
    revalidatePath("/products");
    destination = `/inventory?${returnContext}&success=${encodeURIComponent("Opening inventory saved.")}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/inventory?${returnContext}&error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}
