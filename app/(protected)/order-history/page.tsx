import Link from "next/link";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import { requireInventoryWorkspaceUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { orderRows } from "@/lib/purchase-order-queries";
import { OrderHistory } from "@/app/orders/history";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; year?: string }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const query = await searchParams;
  const [vendors, years] = await Promise.all([
    prisma.vendor.findMany({
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.purchaseOrder.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);
  const vendor = vendors.find((v) => v.id === query.vendor) ?? vendors[0];
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Toronto",
      year: "numeric",
    }).format(new Date()),
  );
  const year = Number(query.year) || currentYear;
  const options = [...new Set([currentYear, ...years.map((y) => y.year)])].sort(
    (a, b) => b - a,
  );
  const orders = vendor ? await orderRows({ vendorId: vendor.id, year }) : [];
  return (
    <>
      <PageHeading
        title="Order History"
        eyebrow="Purchasing"
        description="Products by order, with a separate sequence for each vendor and year."
      />
      <p>
        <Link href="/order">New order</Link> ·{" "}
        <Link href="/orders">Orders</Link> ·{" "}
        {hasPermission(actor.role, "imports:review") && (
          <Link href="/order-history/import">Import legacy orders</Link>
        )}
      </p>
      <form className="order-filters">
        <label className="order-field">
          Vendor
          <select name="vendor" defaultValue={vendor?.id}>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="order-field">
          Year
          <select name="year" defaultValue={year}>
            {options.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Show history</button>
      </form>
      <OrderHistory
        orders={orders}
        canManage={hasPermission(actor.role, "operations:post")}
      />
    </>
  );
}
