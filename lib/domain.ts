export type CategorySummary = { id: string; name: string; displayOrder: number; active: boolean };

export function visibleCategories(categories: readonly CategorySummary[]) {
  return categories
    .filter((category) => category.active)
    .toSorted((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

export function duplicateNormalizedValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLocaleLowerCase("en-CA");
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

export function validateProductUnits(input: {
  purchaseUnit?: string | null;
  unitsPerPurchaseUnit?: number | null;
  allowFractionalStock: boolean;
  quantityScale: number;
}) {
  if (input.purchaseUnit && (!input.unitsPerPurchaseUnit || input.unitsPerPurchaseUnit <= 0)) {
    return "A purchase unit requires a positive conversion.";
  }
  if (!input.purchaseUnit && input.unitsPerPurchaseUnit != null) {
    return "A conversion requires a purchase unit.";
  }
  if (!input.allowFractionalStock && input.quantityScale !== 0) {
    return "Integer-only products must use scale 0.";
  }
  if (input.quantityScale < 0 || input.quantityScale > 6) return "Quantity scale must be between 0 and 6.";
  return null;
}
