"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { saveOrderEditor, type OrderEditInput } from "@/lib/order-editor";
import {
  createPurchaseOrder,
  finalizePurchaseOrder,
  positionPurchaseOrder,
  editPurchaseOrder,
} from "@/lib/purchase-order-service";
const text = (f: FormData, key: string) => String(f.get(key) ?? "");
export async function saveOrderEditorAction(input: OrderEditInput) {
  try {
    const actor = await currentUser();
    if (!actor) throw new Error("Sign in to manage orders.");
    await saveOrderEditor(actor.id, input);
    refresh();
    return { ok: true, message: "Order saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && !("code" in error)
          ? error.message
          : "Order could not be saved. Reload and try again.",
    };
  }
}
export async function receiveOrderAction(
  input: Parameters<typeof finalizePurchaseOrder>[1],
) {
  try {
    const actor = await currentUser();
    if (!actor) throw new Error("Sign in to receive orders.");
    await finalizePurchaseOrder(actor.id, input);
    refresh();
    return { ok: true, message: "Order received." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && !("code" in error)
          ? error.message
          : "Receiving could not be finalized. Reload and try again.",
    };
  }
}
function refresh() {
  for (const path of [
    "/order",
    "/orders",
    "/order-history",
    "/inventory",
    "/history",
    "/deliveries",
  ])
    revalidatePath(path);
}
async function run(work: (actorId: string) => Promise<unknown>) {
  let target = "/orders?success=Order%20saved.";
  try {
    const actor = await currentUser();
    if (!actor) throw new Error("Sign in to manage orders.");
    await work(actor.id);
    refresh();
  } catch (error) {
    target =
      "/orders?error=" +
      encodeURIComponent(
        error instanceof Error && !("code" in error)
          ? error.message
          : "Order could not be saved. Reload and try again.",
      );
  }
  redirect(target);
}
export async function createOrderAction(form: FormData) {
  await run((id) =>
    createPurchaseOrder(id, {
      vendorId: text(form, "vendorId"),
      date: text(form, "date"),
      notes: text(form, "notes"),
      items: JSON.parse(text(form, "items") || "[]"),
      isPrivate: form.get("isPrivate") === "on",
      manualItems: JSON.parse(text(form, "manualItems") || "[]"),
    }),
  );
}
export async function finalizeOrderAction(form: FormData) {
  await run((id) =>
    finalizePurchaseOrder(id, {
      id: text(form, "orderId"),
      receivedDate: text(form, "receivedDate"),
      taxIncluded: form.get("taxIncluded") === "on",
      gst: text(form, "gst") || "0",
      pst: text(form, "pst") || "0",
      lines: JSON.parse(text(form, "lines") || "[]"),
    }),
  );
}
export async function editOrderAction(form: FormData) {
  await run((id) =>
    editPurchaseOrder(id, {
      id: text(form, "orderId"),
      vendorId: text(form, "vendorId"),
      date: text(form, "date"),
      year: Number(text(form, "year")),
      notes: text(form, "notes"),
      reason: text(form, "reason"),
      isPrivate: form.get("isPrivate") === "on",
      lines: form.getAll("lineId").map((value) => ({
        id: String(value),
        name: form.has(`name-${value}`)
          ? text(form, `name-${value}`)
          : undefined,
        unit: form.has(`unit-${value}`)
          ? text(form, `unit-${value}`)
          : undefined,
        ordered: text(form, `ordered-${value}`),
        received: form.has(`received-${value}`)
          ? text(form, `received-${value}`)
          : null,
        price: form.has(`price-${value}`) ? text(form, `price-${value}`) : null,
      })),
    }),
  );
}
export async function moveOrderAction(id: string, position: number) {
  try {
    const actor = await currentUser();
    if (!actor) throw new Error("Sign in first.");
    await positionPurchaseOrder(actor.id, id, position);
    refresh();
    return { ok: true, message: "Order sequence saved." };
  } catch {
    return {
      ok: false,
      message: "Order could not be moved. Reload and try again.",
    };
  }
}
