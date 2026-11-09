"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { InventoryCountError } from "@/lib/inventory-count";
import { InventoryMovementError } from "@/lib/inventory-movement";
import { setInventory } from "@/lib/set-inventory";

const messages: Record<string, string> = {
  FORBIDDEN: "Inventory Manager permission is required to set inventory.",
  INVALID_INPUT:
    "Enter at least one quantity (zero or greater) using the Product's counted-as unit.",
  PRODUCT_NOT_FOUND: "A selected Product no longer exists.",
  LOCATION_NOT_FOUND: "The selected Location no longer exists.",
  NOT_ELIGIBLE:
    "A Product or Location is inactive, unconfigured, or still requires review.",
  DUPLICATE_OPENING:
    "Opening inventory has already been set for one of these Products. Use a future physical count to correct tracked stock.",
  CONFLICT:
    "Opening inventory changed at the same time. Refresh and try again.",
  FAILED: "Inventory could not be saved.",
};

function errorCode(error: unknown) {
  if (
    error instanceof InventoryMovementError ||
    error instanceof InventoryCountError
  )
    return error.code;
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
      .filter((entry) => entry.quantity !== "");
    await setInventory(actor.id, {
      locationId,
      entries,
      notes: String(formData.get("notes") ?? ""),
    });
    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/history");
    revalidatePath("/counts");
    destination = `/inventory?${returnContext}&success=${encodeURIComponent("Inventory saved.")}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/inventory?${returnContext}&error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}
