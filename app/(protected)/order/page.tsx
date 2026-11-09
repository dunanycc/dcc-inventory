import Link from "next/link";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import { requireInventoryWorkspaceUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { NewOrder } from "@/app/orders/new-order";
export default async function Page() {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const [vendors, categories] = await Promise.all([
    prisma.vendor.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      include: {
        products: {
          where: { active: true, vendorId: { not: null } },
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        },
      },
    }),
  ]);
  return (
    <>
      <PageHeading
        title="Order"
        description="Choose a vendor, then select products and quantities."
        eyebrow="Purchasing"
      />
      <p>
        <Link href="/orders">Orders List</Link> ·{" "}
        <Link href="/order-history">Order Summary</Link>
      </p>
      {hasPermission(actor.role, "operations:post") ? (
        <NewOrder
          vendors={vendors}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            products: c.products.map((p) => ({
              id: p.id,
              name: p.name,
              vendorId: p.vendorId!,
              unit:
                p.purchaseUnit && p.unitsPerPurchaseUnit
                  ? p.purchaseUnit
                  : p.stockUnitLabel || p.stockUnit,
              factor:
                p.purchaseUnit && p.unitsPerPurchaseUnit
                  ? p.unitsPerPurchaseUnit.toString()
                  : "1",
              stockUnit: p.stockUnitLabel || p.stockUnit,
            })),
          }))}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Toronto",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())}
        />
      ) : (
        <p>You have read-only access to orders.</p>
      )}
    </>
  );
}
