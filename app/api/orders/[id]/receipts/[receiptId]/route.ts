import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/authorization";
import { sameOrigin } from "@/lib/order-receipts";
import { deleteOrderReceipt } from "@/lib/delete-order-receipt";
import { currentUser } from "@/lib/session";
import { isStarterShackStaff } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const actor = await currentUser();
  if (!actor || isStarterShackStaff(actor.role))
    return new Response("Forbidden", { status: 403 });
  const { id, receiptId } = await params;
  const receipt = await prisma.orderReceipt.findFirst({
    where: { id: receiptId, orderId: id },
  });
  if (!receipt) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(receipt.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor.role, "operations:post"))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const { id, receiptId } = await params;
    if (!(await deleteOrderReceipt(actor.id, id, receiptId)))
      return Response.json({ error: "Receipt not found." }, { status: 404 });
    revalidatePath("/orders");
    revalidatePath("/receipts");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Receipt could not be deleted. Reload and try again." },
      { status: 400 },
    );
  }
}
