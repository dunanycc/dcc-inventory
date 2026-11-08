import { historicalVendor, quantity } from "./purchase-order";
export type LegacyLine = {
  sourceProductId: string;
  productName: string;
  categoryName: string;
  unit: string;
  orderedQuantity: string;
  receivedQuantity: string;
};
export type LegacyOrder = {
  sourceId: string;
  originalId: string;
  originalLabel: string;
  vendorName: string;
  year: number;
  date: string | null;
  notes: string;
  lines: LegacyLine[];
  warnings: string[];
  originalDate: string;
};
function text(value: unknown) {
  return String(value ?? "").trim();
}
function date(value: unknown) {
  if (typeof value === "number" && value > 0 && value < 2958465)
    return new Date(Math.round((value - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}
export function planLegacyOrders(
  orderRows: unknown[][],
  productRows: unknown[][],
) {
  const header = orderRows[0]?.map(text) ?? [];
  const required = [
    "Orderd",
    "Order GUID",
    "Order Date",
    "Product GUID",
    "Catgegory",
    "Name",
    "Ordered",
    "Recieved",
    "Status",
  ];
  if (required.some((h) => !header.includes(h)))
    throw new Error("Orders sheet is missing required legacy columns.");
  const productsHeader = productRows[0]?.map(text) ?? [];
  if (!productsHeader.includes("ID"))
    throw new Error("Products sheet is missing the ID column.");
  const products = new Map(
    productRows.slice(1).map((r) => [text(r[productsHeader.indexOf("ID")]), r]),
  );
  const groups = new Map<string, LegacyOrder>();
  const errors: string[] = [];
  const cancelled = new Set<string>();
  const originalIds = new Set<string>();
  for (let i = 1; i < orderRows.length; i++) {
    const row = orderRows[i];
    const get = (name: string) => row[header.indexOf(name)];
    const id = text(get("Order GUID"));
    if (!id) continue;
    originalIds.add(id);
    const status = text(get("Status")).toLowerCase();
    if (status === "cancelled" || status === "canceled") {
      cancelled.add(id);
      continue;
    }
    if (status !== "received") {
      errors.push(`Row ${i + 1}: status '${status}' needs review.`);
      continue;
    }
    const category = text(get("Catgegory"));
    const vendor = historicalVendor(category);
    if (!vendor) {
      errors.push(
        `Row ${i + 1}: no historical vendor mapping for '${category}'.`,
      );
      continue;
    }
    const productId = text(get("Product GUID"));
    if (!productId) {
      errors.push(`Row ${i + 1}: missing Product GUID.`);
      continue;
    }
    const sourceLabel = get("Orderd");
    const label = date(sourceLabel) ?? text(sourceLabel);
    const originalDate = date(get("Order Date"));
    const labelYear = Number(label.slice(0, 4));
    const year = [2025, 2026].includes(labelYear)
      ? labelYear
      : Number(originalDate?.slice(0, 4));
    if (![2025, 2026].includes(year)) {
      errors.push(`Row ${i + 1}: unsupported or missing year.`);
      continue;
    }
    const key = `${id}:${vendor.toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceId: key,
        originalId: id,
        originalLabel: label,
        vendorName: vendor,
        year,
        date: originalDate?.startsWith(String(year)) ? originalDate : null,
        originalDate: text(get("Order Date")),
        notes: text(get("Column 1")),
        lines: [],
        warnings: [],
      };
      groups.set(key, group);
    }
    if (
      group.originalLabel !== label ||
      group.originalDate !== text(get("Order Date"))
    )
      errors.push(
        `Order ${label}: inconsistent dates or labels within the same order.`,
      );
    const note = text(get("Column 1"));
    if (note && !group.notes.includes(note)) group.notes += "\n" + note;
    const ordered = text(get("Ordered"));
    const received = text(get("Recieved"));
    try {
      quantity(ordered);
      quantity(received);
    } catch {
      errors.push(
        `Row ${i + 1}: missing or invalid quantity; blank is not treated as zero.`,
      );
      continue;
    }
    const p = products.get(productId);
    const unit = p ? text(p[productsHeader.indexOf("Unit Format")]) : "";
    if (!unit)
      group.warnings.push(
        `Original unit unavailable for ${text(get("Name"))}; verify before comparison.`,
      );
    group.lines.push({
      sourceProductId: productId,
      productName: text(get("Name")),
      categoryName: category,
      unit: unit || "Legacy stock unit",
      orderedQuantity: ordered,
      receivedQuantity: received,
    });
  }
  // Never import a partly cancelled group or silently drop cancelled lines from it.
  for (const [key, group] of groups)
    if (cancelled.has(group.originalId)) {
      errors.push(
        `Order ${group.originalLabel} has mixed cancelled/received statuses; resolve before import.`,
      );
      groups.delete(key);
    }
  for (const g of groups.values()) {
    if (!g.date)
      g.warnings.push(
        "Missing or conflicting year/date; order date needs review.",
      );
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(g.originalLabel) &&
      g.originalLabel !== g.date
    )
      g.warnings.push(
        `Original label date ${g.originalLabel} differs from Order Date ${g.date}.`,
      );
    if (g.notes)
      g.warnings.push(
        "Original notes retained; verify any date mentioned in the notes against Order Date.",
      );
    if (
      g.lines.some(
        (l, i) =>
          g.lines.findIndex((x) => x.sourceProductId === l.sourceProductId) !==
          i,
      )
    )
      g.warnings.push("Repeated product lines retained separately.");
  }
  return {
    orders: [...groups.values()].sort(
      (a, b) =>
        a.year - b.year ||
        (a.date ?? "").localeCompare(b.date ?? "") ||
        a.originalLabel.localeCompare(b.originalLabel) ||
        a.sourceId.localeCompare(b.sourceId),
    ),
    errors,
    cancelledOrders: cancelled.size,
    originalOrders: originalIds.size,
  };
}
