import { inventoryQuantityScale } from "@/lib/quantity-policy";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  CountWorkspace,
  type CountCategory,
  type CountHistoryRow,
  type SeasonOpeningData,
} from "@/app/counts/count-client";
import { hasPermission } from "@/lib/authorization";
import {
  isValidSeasonYear,
  SEASON_OPENING_SOURCE_SYSTEM,
  seasonOpeningSourceId,
} from "@/lib/inventory-count";
import { prisma } from "@/lib/prisma";
import { requireInventoryWorkspaceUser } from "@/lib/session";

function unitLabel(product: {
  stockUnit: string;
  stockUnitLabel: string | null;
}) {
  return product.stockUnit === "OTHER"
    ? (product.stockUnitLabel ?? "Other")
    : product.stockUnit;
}

export default async function CountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    success?: string;
    error?: string;
    openingYear?: string;
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
          title="Counts"
          description="Compare a physical count with the tracked quantity at the Bar or Starter Shack."
        />
        <section className="empty-panel">
          <h2>No active Locations</h2>
          <p>Ask an Administrator to configure an active Location.</p>
        </section>
      </>
    );

  const requestedYear = Number(parameters.openingYear);
  const openingYear = isValidSeasonYear(requestedYear)
    ? requestedYear
    : new Date().getUTCFullYear();

  const [draft, history, seasonOpeningProducts, seasonOpeningCount] =
    await Promise.all([
      prisma.inventoryCount.findFirst({
        where: { locationId: selectedLocation.id, status: "DRAFT" },
        select: {
          id: true,
          notes: true,
          lines: {
            select: {
              id: true,
              productId: true,
              expectedQuantity: true,
              countedQuantity: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  packageSize: true,
                  stockUnit: true,
                  stockUnitLabel: true,
                  quantityScale: true,
                  allowFractionalStock: true,
                  displayOrder: true,
                  category: {
                    select: { id: true, name: true, displayOrder: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.inventoryCount.findMany({
        where: { locationId: selectedLocation.id },
        orderBy: [{ countDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          countDate: true,
          status: true,
          notes: true,
          createdAt: true,
          acceptedAt: true,
          createdBy: { select: { name: true, email: true } },
          acceptedBy: { select: { name: true, email: true } },
          lines: {
            select: {
              productId: true,
              expectedQuantity: true,
              countedQuantity: true,
              difference: true,
              product: {
                select: { name: true, stockUnit: true, stockUnitLabel: true },
              },
            },
          },
        },
      }),
      prisma.product.findMany({
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
        orderBy: [
          { category: { displayOrder: "asc" } },
          { displayOrder: "asc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          name: true,
          stockUnit: true,
          stockUnitLabel: true,
          quantityScale: true,
          allowFractionalStock: true,
          category: { select: { name: true } },
        },
      }),
      prisma.inventoryCount.findUnique({
        where: {
          sourceSystem_sourceId: {
            sourceSystem: SEASON_OPENING_SOURCE_SYSTEM,
            sourceId: seasonOpeningSourceId(selectedLocation.code, openingYear),
          },
        },
        select: {
          lines: { select: { productId: true, countedQuantity: true } },
        },
      }),
    ]);

  const categoriesById = new Map<string, CountCategory>();
  if (draft) {
    for (const line of draft.lines) {
      const category = line.product.category;
      if (!categoriesById.has(category.id))
        categoriesById.set(category.id, {
          id: category.id,
          name: category.name,
          displayOrder: category.displayOrder,
          products: [],
        });
      categoriesById.get(category.id)!.products.push({
        lineId: line.id,
        productId: line.productId,
        name: line.product.name,
        packageSize: line.product.packageSize,
        unitLabel: unitLabel(line.product),
        quantityScale: inventoryQuantityScale(line.product),
        displayOrder: line.product.displayOrder,
        expectedQuantity: line.expectedQuantity.toString(),
        countedQuantity: line.countedQuantity?.toString() ?? null,
      });
    }
  }
  const draftCategories = [...categoriesById.values()]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .map((category) => ({
      ...category,
      products: category.products.sort(
        (a, b) =>
          a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
      ),
    }));

  const openingValueByProduct = new Map(
    (seasonOpeningCount?.lines ?? []).map((line) => [
      line.productId,
      line.countedQuantity?.toString() ?? null,
    ]),
  );
  const seasonOpening: SeasonOpeningData = {
    year: openingYear,
    entries: seasonOpeningProducts.map((product) => ({
      productId: product.id,
      name: product.name,
      categoryName: product.category.name,
      unitLabel: unitLabel(product),
      quantityScale: inventoryQuantityScale(product),
      value: openingValueByProduct.get(product.id) ?? null,
    })),
  };

  const historyRows: CountHistoryRow[] = history.map((count) => ({
    id: count.id,
    countDate: count.countDate.toISOString().slice(0, 10),
    status: count.status,
    notes: count.notes,
    createdBy: count.createdBy.name || count.createdBy.email,
    acceptedBy: count.acceptedBy
      ? count.acceptedBy.name || count.acceptedBy.email
      : null,
    acceptedAt: count.acceptedAt?.toISOString() ?? null,
    lines: count.lines.map((line) => ({
      productId: line.productId,
      productName: line.product.name,
      unitLabel: unitLabel(line.product),
      expectedQuantity: line.expectedQuantity.toString(),
      countedQuantity: line.countedQuantity?.toString() ?? null,
      difference: line.difference?.toString() ?? null,
    })),
  }));

  return (
    <>
      <PageHeading
        eyebrow="Inventory"
        title="Counts"
        description="Compare a physical count with the tracked quantity at the Bar or Starter Shack."
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
      <CountWorkspace
        canEditDraft={hasPermission(actor.role, "operations:draft")}
        canAccept={hasPermission(actor.role, "operations:post")}
        canSetSeasonOpening={hasPermission(actor.role, "operations:post")}
        seasonOpening={seasonOpening}
        draft={
          draft
            ? { id: draft.id, notes: draft.notes, categories: draftCategories }
            : null
        }
        history={historyRows}
        locations={locations}
        selectedLocation={selectedLocation}
      />
    </>
  );
}
