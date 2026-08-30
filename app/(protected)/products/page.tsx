import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import { ProductCategoryTabs, type ProductCategoryRow } from "@/app/products/product-category-tabs";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const actor = await requireCurrentUser();
  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ orderBy: CATEGORY_ORDER_BY, include: { products: { orderBy: [{ name: "asc" }, { id: "asc" }], include: { productLocations: true } } } }),
    prisma.location.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true, active: true } }),
  ]);
  const rows: ProductCategoryRow[] = categories.map((category) => ({
    id: category.id, name: category.name, displayOrder: category.displayOrder, active: category.active,
    products: category.products.map((product) => ({
      id: product.id, name: product.name, categoryId: product.categoryId, packageSize: product.packageSize,
      stockUnit: product.stockUnit, stockUnitLabel: product.stockUnitLabel, allowFractionalStock: product.allowFractionalStock,
      quantityScale: product.quantityScale, purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit?.toString() ?? null, active: product.active,
      starterShackRequestEligible: product.starterShackRequestEligible,
      productLocations: product.productLocations.map((item) => ({ locationId: item.locationId, active: item.active, reviewRequired: item.reviewRequired })),
    })),
  }));
  const message = await searchParams;
  return <><PageHeading eyebrow="Product setup" title="Products" description="Manage Products by Category, including how they are counted, purchased, and stocked at each Location."/>{message.success && <p className="notice success" role="status">{message.success}</p>}{message.error && <p className="notice error" role="alert">{message.error}</p>}<ProductCategoryTabs canManageCatalog={hasPermission(actor.role, "catalog:manage")} categories={rows} locations={locations}/></>;
}
