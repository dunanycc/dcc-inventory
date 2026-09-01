import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  ProductCategoryTabs,
  type ProductCategoryRow,
} from "@/app/products/product-category-tabs";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { PRODUCT_ORDER_BY } from "@/lib/product-order";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    success?: string;
    error?: string;
  }>;
}) {
  await connection();
  const actor = await requireInventoryWorkspaceUser();
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: CATEGORY_ORDER_BY,
    include: {
      products: {
        orderBy: PRODUCT_ORDER_BY,
        include: {
          notes: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            include: { author: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  const rows: ProductCategoryRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    displayOrder: category.displayOrder,
    active: category.active,
    products: category.products.map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      displayOrder: product.displayOrder,
      packageSize: product.packageSize,
      stockUnit: product.stockUnit,
      stockUnitLabel: product.stockUnitLabel,
      allowFractionalStock: product.allowFractionalStock,
      quantityScale: product.quantityScale,
      purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit?.toString() ?? null,
      active: product.active,
      starterShackRequestEligible: product.starterShackRequestEligible,
      notes: product.notes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: note.author.name || note.author.email,
      })),
    })),
  }));
  const message = await searchParams;
  return (
    <>
      <PageHeading
        eyebrow="Product setup"
        title="Products"
        description="Manage Products by Category. Products are stocked at the Bar by default; select which ones Starter Shack staff may request."
      />
      {message.success && (
        <p className="notice success" role="status">
          {message.success}
        </p>
      )}
      {message.error && (
        <p className="notice error" role="alert">
          {message.error}
        </p>
      )}
      <ProductCategoryTabs
        canManageCatalog={hasPermission(actor.role, "catalog:manage")}
        categories={rows}
        initialCategoryId={message.category}
      />
    </>
  );
}
