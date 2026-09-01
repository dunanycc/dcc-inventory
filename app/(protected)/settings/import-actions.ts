"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/authorization";
import {
  categoryDisplayName,
  normalizeCategoryName,
} from "@/lib/category-management";
import { parseProductImportCsv } from "@/lib/product-import";
import { normalizeProductInput } from "@/lib/product-management";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

const SOURCE_SYSTEM = "DCC_PRODUCT_CSV";
const MAX_FILE_BYTES = 500_000;

class ProductImportError extends Error {}

function destination(kind: "success" | "error", message: string) {
  return `/settings?tab=imports&${kind}=${encodeURIComponent(message)}`;
}

export async function importProductsAction(formData: FormData) {
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor)
      throw new ProductImportError(
        "Catalog management permission is required.",
      );
    const upload = formData.get("file");
    if (
      !(upload instanceof File) ||
      !upload.name.toLowerCase().endsWith(".csv") ||
      upload.size === 0 ||
      upload.size > MAX_FILE_BYTES
    ) {
      throw new ProductImportError(
        "Choose a non-empty CSV file no larger than 500 KB.",
      );
    }
    const preview = parseProductImportCsv(await upload.text());
    if (preview.errors.length)
      throw new ProductImportError(preview.errors.slice(0, 3).join(" "));

    const result = await prisma.$transaction(
      async (transaction) => {
        const freshActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (
          !freshActor ||
          freshActor.status !== "ACTIVE" ||
          !hasPermission(freshActor.role, "catalog:manage")
        )
          throw new ProductImportError(
            "Catalog management permission is required.",
          );
        const locations = await transaction.location.findMany({
          where: { code: { in: ["BAR", "STARTER_SHACK"] } },
          select: { id: true, code: true, active: true },
        });
        const bar = locations.find((location) => location.code === "BAR");
        const shack = locations.find(
          (location) => location.code === "STARTER_SHACK",
        );
        if (!bar?.active || !shack?.active)
          throw new ProductImportError(
            "Bar and Starter Shack must both be active before importing Products.",
          );

        const categories = await transaction.category.findMany({
          select: { id: true, name: true, displayOrder: true },
        });
        const categoriesByName = new Map(
          categories.map((category) => [
            normalizeCategoryName(category.name),
            category,
          ]),
        );
        let nextDisplayOrder = categories.length
          ? Math.max(...categories.map((category) => category.displayOrder)) + 1
          : 0;
        let categoriesCreated = 0;
        for (const row of preview.rows) {
          const normalized = normalizeCategoryName(row.category);
          if (categoriesByName.has(normalized)) continue;
          const name = categoryDisplayName(row.category);
          const category = await transaction.category.create({
            data: {
              name,
              nameNormalized: normalized,
              displayOrder: nextDisplayOrder,
              active: true,
              sourceSystem: SOURCE_SYSTEM,
              sourceId: `category:${normalized}`,
            },
            select: { id: true, name: true, displayOrder: true },
          });
          await transaction.auditEvent.create({
            data: {
              actorId: freshActor.id,
              action: "CATEGORY_CREATED",
              entityType: "Category",
              entityId: category.id,
              after: {
                name: category.name,
                displayOrder: category.displayOrder,
                active: true,
                source: { system: SOURCE_SYSTEM, id: `category:${normalized}` },
              },
              reason: "Created by Product CSV import",
              correlationId: randomUUID(),
            },
          });
          categoriesByName.set(normalized, category);
          nextDisplayOrder += 1;
          categoriesCreated += 1;
        }

        const existing = await transaction.product.findMany({
          where: {
            sourceSystem: SOURCE_SYSTEM,
            sourceId: { in: preview.rows.map((row) => row.sourceId) },
          },
          select: { sourceId: true },
        });
        const existingIds = new Set(
          existing.map((product) => product.sourceId),
        );
        let productsCreated = 0;
        let productsSkipped = 0;
        for (const row of preview.rows) {
          if (existingIds.has(row.sourceId)) {
            productsSkipped += 1;
            continue;
          }
          const category = categoriesByName.get(
            normalizeCategoryName(row.category),
          );
          if (!category)
            throw new ProductImportError(
              `Line ${row.line}: Category could not be resolved.`,
            );
          const normalized = normalizeProductInput({
            name: row.product,
            categoryId: category.id,
            stockUnit: row.stockUnit,
            stockUnitLabel: row.stockUnitLabel,
            allowFractionalStock: false,
            quantityScale: 0,
            packageSize: row.packageSize,
            purchaseUnit: null,
            unitsPerPurchaseUnit: null,
            active: true,
            starterShackRequestEligible: row.starterShack,
            source: { system: SOURCE_SYSTEM, id: row.sourceId },
          });
          const { source, ...data } = normalized;
          const product = await transaction.product.create({
            data: {
              ...data,
              sourceSystem: source?.system,
              sourceId: source?.id,
              productLocations: {
                create: [
                  ...(row.bar
                    ? [
                        {
                          locationId: bar.id,
                          active: true,
                          reviewRequired: false,
                          sourceSystem: SOURCE_SYSTEM,
                          sourceId: `${row.sourceId}:BAR`,
                        },
                      ]
                    : []),
                  ...(row.starterShack
                    ? [
                        {
                          locationId: shack.id,
                          active: true,
                          reviewRequired: false,
                          sourceSystem: SOURCE_SYSTEM,
                          sourceId: `${row.sourceId}:STARTER_SHACK`,
                        },
                      ]
                    : []),
                ],
              },
            },
            select: {
              id: true,
              name: true,
              categoryId: true,
              stockUnit: true,
              packageSize: true,
              starterShackRequestEligible: true,
            },
          });
          await transaction.auditEvent.create({
            data: {
              actorId: freshActor.id,
              action: "PRODUCT_CREATED",
              entityType: "Product",
              entityId: product.id,
              after: {
                ...product,
                bar: row.bar,
                starterShack: row.starterShack,
                source: { system: SOURCE_SYSTEM, id: row.sourceId },
              },
              reason: "Created by Product CSV import",
              correlationId: randomUUID(),
            },
          });
          productsCreated += 1;
        }
        return { categoriesCreated, productsCreated, productsSkipped };
      },
      { isolationLevel: "Serializable" },
    );

    revalidatePath("/settings");
    revalidatePath("/products");
    revalidatePath("/inventory");
    revalidatePath("/requests");
    target = destination(
      "success",
      `Import complete: ${result.productsCreated} Products and ${result.categoriesCreated} Categories created; ${result.productsSkipped} previously imported Products skipped.`,
    );
  } catch (error) {
    const message =
      error instanceof ProductImportError
        ? error.message
        : "The Product import could not be completed. No rows were imported.";
    if (!(error instanceof ProductImportError))
      console.error("Product CSV import failed", error);
    target = destination("error", message);
  }
  redirect(target);
}
