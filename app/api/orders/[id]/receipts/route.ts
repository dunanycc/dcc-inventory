import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { orderTransaction } from "@/lib/purchase-order-service";
import {
  MAX_RECEIPT_BYTES,
  receiptMime,
  sameOrigin,
} from "@/lib/order-receipts";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor.role, "operations:post"))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_RECEIPT_BYTES + 65536)
    return Response.json(
      { error: "Receipt must be 3 MB or smaller." },
      { status: 413 },
    );
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_RECEIPT_BYTES)
      return Response.json(
        { error: "Choose a receipt up to 3 MB." },
        { status: 400 },
      );
    const data = new Uint8Array(await file.arrayBuffer());
    const mimeType = receiptMime(data);
    await orderTransaction(actor.id, async (tx) => {
      await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
      if ((await tx.orderReceipt.count({ where: { orderId: id } })) >= 20)
        throw new Error("This order already has 20 receipts.");
      const receipt = await tx.orderReceipt.create({
        data: {
          orderId: id,
          name:
            file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 180) ||
            "Receipt",
          mimeType,
          data,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityType: "PurchaseOrder",
          entityId: id,
          action: "ORDER_RECEIPT_ATTACHED",
          after: { receiptId: receipt.id, name: receipt.name, size: file.size },
        },
      });
    });
    revalidatePath("/orders");
    revalidatePath("/receipts");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && !("code" in error)
            ? error.message
            : "Receipt could not be saved.",
      },
      { status: 400 },
    );
  }
}
