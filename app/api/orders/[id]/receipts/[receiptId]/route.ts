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
