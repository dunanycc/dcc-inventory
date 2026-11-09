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
  searchParams: Promise<{ year?: string }>;
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
  const orders = (await orderRows({ year })).filter(
    (o) => o.status !== "CANCELLED",
  );
  return (
    <>
      <PageHeading
        title="Order Summary"
        eyebrow="Purchasing"
        description="All orders for the year, grouped by vendor with private orders below."
      />
      <form className="order-filters">
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
        vendors={vendors}
        canManage={hasPermission(actor.role, "operations:post")}
      />
    </>
  );
}
