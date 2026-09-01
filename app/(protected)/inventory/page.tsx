import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  InventoryCategoryTabs,
  type InventoryCategoryRow,
} from "@/app/inventory/inventory-category-tabs";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import {
  formatStockQuantity,
  inventoryBalancesForLocation,
} from "@/lib/inventory-balances";
import { prisma } from "@/lib/prisma";
import { PRODUCT_ORDER_BY } from "@/lib/product-order";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    category?: string;
    success?: string;
    error?: string;
  }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const parameters = await searchParams;
  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    select: { id: true, code: true, name: true },
  });
  const selectedLocation =
    locations.find((location) => location.code === parameters.location) ??
    locations.find((location) => location.code === "BAR") ??
    locations[0];

  if (!selectedLocation)
    return (
      <>
        <PageHeading
          eyebrow="Inventory"
          title="Inventory"
          description="View tracked stock at the Bar and Starter Shack by Category."
        />
        <section className="empty-panel">
          <h2>No active Locations</h2>
          <p>Ask an Administrator to configure an active Location.</p>
        </section>
      </>
    );

  const [categories, balances] = await Promise.all([
    prisma.category.findMany({
      where: {
        active: true,
        products: {
          some: {
            active: true,
            productLocations: {
              some: {
                locationId: selectedLocation.id,
                active: true,
                reviewRequired: false,
              },
            },
          },
        },
      },
      orderBy: CATEGORY_ORDER_BY,
      select: {
        id: true,
        name: true,
        products: {
          where: {
            active: true,
            productLocations: {
              some: {
                locationId: selectedLocation.id,
                active: true,
                reviewRequired: false,
              },
            },
          },
          orderBy: PRODUCT_ORDER_BY,
          select: {
            id: true,
            name: true,
            packageSize: true,
            stockUnit: true,
            stockUnitLabel: true,
            quantityScale: true,
            inventoryMovements: {
              where: {
                type: "OPENING",
                destinationLocationId: selectedLocation.id,
              },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    }),
    inventoryBalancesForLocation(selectedLocation.id),
  ]);

  const rows: InventoryCategoryRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    products: category.products.map((product) => ({
      id: product.id,
      name: product.name,
      packageSize: product.packageSize,
      unitLabel:
        product.stockUnit === "OTHER"
          ? (product.stockUnitLabel ?? "Other")
          : product.stockUnit,
      quantityScale: product.quantityScale,
      balance: formatStockQuantity(
        balances.get(product.id) ?? "0",
        product.quantityScale,
      ),
      openingSet: product.inventoryMovements.length > 0,
    })),
  }));

  return (
    <>
      <PageHeading
        eyebrow="Inventory"
        title="Inventory"
        description="View tracked stock at the Bar and Starter Shack by Category."
      />
      {parameters.success && (
        <p className="notice success" role="status">
          {parameters.success}
        </p>
      )}
      {parameters.error && (
        <p className="notice error" role="alert">
          {parameters.error}
        </p>
      )}
      <InventoryCategoryTabs
        canSetOpening={hasPermission(actor.role, "operations:post")}
        categories={rows}
        initialCategoryId={parameters.category}
        locations={locations}
        selectedLocation={selectedLocation}
      />
    </>
  );
}
