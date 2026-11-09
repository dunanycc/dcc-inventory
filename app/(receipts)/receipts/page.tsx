import { requireReceiptManager } from "@/lib/receipt-session";
import { prisma } from "@/lib/prisma";
import { ReceiptInbox } from "@/app/orders/receipt-inbox";
export default async function ReceiptPage() {
  await requireReceiptManager();
  const [vendors, orders] = await Promise.all([
    prisma.vendor.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { mergedIntoId: null, status: { in: ["PENDING", "RECEIVED"] } },
      orderBy: [{ orderDate: "desc" }, { number: "desc" }],
      select: {
        id: true,
        vendorId: true,
        vendorName: true,
        number: true,
        year: true,
        orderDate: true,
        status: true,
        isPrivate: true,
        receipts: { select: { id: true, name: true, mimeType: true } },
        lines: { select: { productName: true } },
      },
    }),
  ]);
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Toronto",
      year: "numeric",
    }).format(new Date()),
  );
  return (
    <ReceiptInbox
      vendors={vendors}
      orders={orders.map((order) => ({
        ...order,
        orderDate: order.orderDate?.toISOString().slice(0, 10) ?? null,
      }))}
      currentYear={currentYear}
    />
  );
}
