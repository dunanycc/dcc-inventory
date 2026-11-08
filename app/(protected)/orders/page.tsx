import Link from "next/link";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import { requireInventoryWorkspaceUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { orderRows } from "@/lib/purchase-order-queries";
import { Orders } from "@/app/orders/orders";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; success?: string; error?: string }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const query = await searchParams;
  const [orders, vendors] = await Promise.all([
    orderRows(query.id ? { id: query.id } : {}),
    prisma.vendor.findMany({
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return (
    <>
      <PageHeading
        title="Orders"
        eyebrow="Purchasing"
        description="Review orders, attach receipts, and finalize quantities received."
      />
      <p>
        <Link href="/order">New order</Link> ·{" "}
        <Link href="/order-history">Order history</Link>
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
