import Link from "next/link";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import { requireInventoryWorkspaceUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { orderRows } from "@/lib/purchase-order-queries";
import { Orders } from "@/app/orders/orders";
import { inventoryQuantityScale } from "@/lib/quantity-policy";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { PRODUCT_ORDER_BY } from "@/lib/product-order";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; success?: string; error?: string }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const query = await searchParams;
  const [orders, vendors, categories] = await Promise.all([
    orderRows(query.id ? { id: query.id } : {}),
    prisma.vendor.findMany({
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    hasPermission(actor.role, "operations:post")
      ? prisma.category.findMany({
          where: { active: true },
          orderBy: CATEGORY_ORDER_BY,
          include: {
            products: { where: { active: true }, orderBy: PRODUCT_ORDER_BY },
          },
        })
      : [],
  ]);
  return (
    <>
      <PageHeading
        title="Orders List"
        eyebrow="Purchasing"
        description="Review orders, attach receipts, and finalize quantities received."
      />
      <p>
        <Link href="/order">New order</Link> ·{" "}
        <Link href="/order-history">Order Summary</Link>
      </p>
      {query.error && (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      )}
      {query.success && (
        <p className="notice success" role="status">
          {query.success}
        </p>
      )}
      <Orders
        orders={orders}
        products={categories.flatMap((c) =>
          c.products.map((p) => ({
            id: p.id,
            name: p.name,
            vendorId: p.vendorId,
            categoryName: c.name,
            unit: p.purchaseUnit || p.stockUnitLabel || p.stockUnit,
            factor: p.unitsPerPurchaseUnit?.toString() || "1",
            quantityScale: inventoryQuantityScale({ ...p, category: c }),
          })),
        )}
        vendors={vendors}
        canManage={hasPermission(actor.role, "operations:post")}
        today={new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Toronto",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date())}
      />
    </>
  );
}
