import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  NewDelivery,
  type DeliveryCategory,
} from "@/app/deliveries/delivery-client";
import {
  DeliveryHistory,
  type DeliveryHistoryRow,
} from "@/app/deliveries/delivery-history-client";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { PRODUCT_ORDER_BY } from "@/lib/product-order";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const query = await searchParams;
  const bar = await prisma.location.findUnique({
    where: { code: "BAR" },
    select: { id: true },
  });
  const [vendors, categories, history] = await Promise.all([
    prisma.vendor.findMany({
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    bar
      ? prisma.category.findMany({
          where: { active: true },
          orderBy: CATEGORY_ORDER_BY,
          select: {
            id: true,
            name: true,
            products: {
              where: {
                active: true,
                productLocations: {
                  some: {
                    locationId: bar.id,
                    active: true,
                    reviewRequired: false,
                  },
                },
              },
              orderBy: PRODUCT_ORDER_BY,
              select: {
                id: true,
                name: true,
                stockUnit: true,
                stockUnitLabel: true,
                quantityScale: true,
                purchaseUnit: true,
                unitsPerPurchaseUnit: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.delivery.findMany({
      take: 30,
      orderBy: [{ deliveryDate: "desc" }, { recordedAt: "desc" }],
      include: {
        vendor: true,
        recordedBy: { select: { name: true, email: true } },
        voidedBy: { select: { name: true, email: true } },
        lines: {
          orderBy: [
            { product: { displayOrder: "asc" } },
            { product: { name: "asc" } },
          ],
          include: {
            product: {
              select: { name: true, stockUnit: true, stockUnitLabel: true },
            },
          },
        },
      },
    }),
  ]);
  const rows: DeliveryCategory[] = categories.map((category) => ({
    ...category,
    products: category.products.map((product) => ({
      ...product,
      stockUnit:
        product.stockUnit === "OTHER"
          ? (product.stockUnitLabel ?? "Other")
          : product.stockUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit?.toString() ?? null,
    })),
  }));
  const historyRows: DeliveryHistoryRow[] = history.map((delivery) => ({
    id: delivery.id,
    deliveryDate: delivery.deliveryDate.toISOString().slice(0, 10),
    vendorId: delivery.vendorId,
    vendorName: delivery.vendor.name,
    notes: delivery.notes,
    recordedBy: delivery.recordedBy.name || delivery.recordedBy.email,
    recordedAt: delivery.recordedAt.toISOString(),
    voidedAt: delivery.voidedAt?.toISOString() ?? null,
    voidedBy: delivery.voidedBy
      ? delivery.voidedBy.name || delivery.voidedBy.email
      : null,
    voidComment: delivery.voidComment,
    lines: delivery.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.product.name,
      entryQuantity: line.entryQuantity.toString(),
      quantity: line.quantity.toString(),
      purchaseUnit: line.purchaseUnit,
      unitsPerPurchaseUnit: line.unitsPerPurchaseUnit?.toString() ?? null,
      unit:
        line.product.stockUnit === "OTHER"
          ? (line.product.stockUnitLabel ?? "Other")
          : line.product.stockUnit,
      active: line.active,
    })),
  }));
  const canPost = hasPermission(actor.role, "operations:post");
  return (
    <>
      <PageHeading
        eyebrow="Bar inventory"
        title="Deliveries"
        description="Record what arrived from a Vendor and add it directly to Bar inventory."
      />
      {query.success && <p className="notice success">{query.success}</p>}
      {query.error && <p className="notice error">{query.error}</p>}
      {canPost && (
        <section className="delivery-panel">
          <h2>New Delivery</h2>
          <NewDelivery
            categories={rows}
            vendors={vendors
              .filter((vendor) => vendor.active)
              .map(({ id, name }) => ({ id, name }))}
          />
        </section>
      )}
      <section className="delivery-history">
        <h2>Recent Deliveries</h2>
        <DeliveryHistory
          canEdit={canPost}
          categories={rows}
          deliveries={historyRows}
          vendors={vendors.map(({ id, name }) => ({ id, name }))}
        />
      </section>
    </>
  );
}
