import { executiveSubtotal, type ExecutiveRow } from "./executive-report";
export const EXECUTIVE_COLUMNS = [
  "Product",
  "Orders",
  "Units ordered",
  "Units received",
  "Opening units",
  "Units consumed",
  "Remaining units",
  "Avg cost / unit",
  "Total cost",
];
export type ExecutiveExportRow = {
  section: string;
  category: string;
  kind: "Product" | "Category subtotal" | "Total";
  cells: (string | number | null)[];
  knownCost: number;
  note: string;
};
export function executiveExportRows(
  rows: ExecutiveRow[],
): ExecutiveExportRow[] {
  const output: ExecutiveExportRow[] = [];
  const number = (value: string | null) =>
    value === null ? null : Number(value);
  for (const isPrivate of [false, true]) {
    const group = rows.filter((row) => row.isPrivate === isPrivate);
    if (!group.length) continue;
    const section = isPrivate ? "Private purchases" : "Club inventory";
    function total(
      items: ExecutiveRow[],
      label: string,
      category: string,
      kind: "Category subtotal" | "Total",
    ) {
      const t = executiveSubtotal(items);
      const qty = (
        field: "ordered" | "received" | "opening" | "consumed" | "remaining",
      ) => {
        if (
          (kind === "Total" && !isPrivate) ||
          (isPrivate && ["opening", "consumed", "remaining"].includes(field))
        )
          return null;
        const q = t[field];
        if (q.missing) return "Incomplete";
        return q.values.length === 1
          ? Number(q.values[0].quantity)
          : q.values
              .map((v) => `${v.quantity} ${v.unit.toLowerCase()}`)
              .join("; ");
      };
      output.push({
        section,
        category,
        kind,
        cells: [
          label,
          t.orders,
          qty("ordered"),
          qty("received"),
          qty("opening"),
          qty("consumed"),
          qty("remaining"),
          kind === "Total" && !isPrivate ? null : number(t.averageCost),
          number(t.totalCost),
        ],
        knownCost: Number(t.knownCost),
        note:
          t.totalCost === null
            ? "Incomplete cost: one or more receipts have no price"
            : "",
      });
    }
    for (const category of [...new Set(group.map((row) => row.categoryName))]) {
      const items = group.filter((row) => row.categoryName === category);
      for (const row of items)
        output.push({
          section,
          category,
          kind: "Product",
          cells: [
            row.name,
            row.orders.length,
            number(row.ordered),
            number(row.received),
            number(row.opening),
            number(row.consumed),
            number(row.remaining),
            number(row.averageCost),
            number(row.totalCost),
          ],
          knownCost: Number(row.knownCost),
          note: [
            row.missingPrices ? `${row.missingPrices} unpriced receipt(s)` : "",
            !row.isPrivate && (row.opening === null || row.remaining === null)
              ? "Missing stock boundary"
              : "",
            row.consumed !== null && Number(row.consumed) < 0
              ? "Negative consumption: review source stock/purchases"
              : "",
          ]
            .filter(Boolean)
            .join("; "),
        });
      total(
        items,
        `${category || "Other"} subtotal`,
        category,
        "Category subtotal",
      );
    }
    total(group, isPrivate ? "Private total" : "Club total", "", "Total");
  }
  return output;
}
export function executiveCsv(
  rows: ExecutiveRow[],
  year: number,
  vendors: string[],
) {
  const escape = (value: string | number | null) => {
    if (value === null) return '""';
    let text = String(value);
    if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
      text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const records = executiveExportRows(rows);
  return (
    "\uFEFF" +
    [
      [
        "Year",
        "Selected vendors",
        "Section",
        "Category",
        "Row type",
        ...EXECUTIVE_COLUMNS,
        "Known cost",
        "Notes",
      ],
      ...records.map((row) => [
        year,
        vendors.join("; "),
        row.section,
        row.category,
        row.kind,
        ...row.cells,
        row.knownCost,
        row.note,
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")
  );
}
