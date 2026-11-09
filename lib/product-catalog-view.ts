/** Reset editors for catalog edits, but keep the current view mounted while sorting. */
export function productCatalogViewKey<
  T extends { products: { id: string; displayOrder?: number }[] },
>(categories: T[]) {
  return JSON.stringify(
    categories.map((category) => ({
      ...category,
      products: category.products
        .map((product) => ({ ...product, displayOrder: 0 }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    })),
  );
}
