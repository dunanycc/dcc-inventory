import { expect, it } from "vitest";
import { executiveCsv, executiveExportRows } from "./executive-report-export";
import { executivePdf } from "./executive-report-pdf";
import type { ExecutiveRow } from "./executive-report";
const row: ExecutiveRow = {
  key: "one",
  productId: "one",
  name: 'Cola "Special", red',
  categoryName: "Mixers",
  unit: "CAN",
  isPrivate: false,
  orders: ["order"],
  ordered: "12",
  received: "12",
  opening: "0",
  remaining: "2",
  consumed: "10",
  knownCost: "24.00",
  totalCost: "24.00",
  averageCost: "2.00",
  missingPrices: 0,
  historyCategoryOrder: 0,
  historyProductOrder: 0,
};
it("exports all detail and category subtotals but omits Club total unit summaries", () => {
  const records = executiveExportRows([row]);
  expect(records).toHaveLength(3);
  expect(records[0].cells).toEqual([row.name, 1, 12, 12, 0, 10, 2, 2, 24]);
  expect(records[1].cells).toEqual([
    "Mixers subtotal",
    1,
    12,
    12,
    0,
    10,
    2,
    2,
    24,
  ]);
  expect(records[2].cells).toEqual([
    "Club total",
    1,
    null,
    null,
    null,
    null,
    null,
    null,
    24,
  ]);
});
it("quotes CSV correctly, preserves numeric negatives, and neutralizes formula-like names", () => {
  const csv = executiveCsv(
    [row, { ...row, key: "two", name: "=HYPERLINK(1)", consumed: "-1" }],
    2026,
    ["Groceries"],
  );
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"Cola ""Special"", red"');
  expect(csv).toContain('"\'=HYPERLINK(1)"');
  expect(csv).toContain('"-1"');
  expect(csv).toContain('"2026","Groceries","Club inventory"');
});
it("preserves incomplete costs and private stock exclusions", () => {
  const records = executiveExportRows([
    {
      ...row,
      isPrivate: true,
      productId: null,
      totalCost: null,
      averageCost: null,
      missingPrices: 1,
      opening: null,
      remaining: null,
      consumed: null,
    },
  ]);
  expect(records[0]).toMatchObject({
    knownCost: 24,
    note: expect.stringContaining("unpriced"),
  });
  expect(records[0].cells[8]).toBeNull();
  expect(records[2].cells.slice(4, 7)).toEqual([null, null, null]);
});
it("produces a downloadable landscape PDF with multiple pages for a long report", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    ...row,
    key: String(i),
    name: `Long product name for pagination ${i}`,
  }));
  const pdf = executivePdf(rows, 2026, ["Groceries"]);
  expect(pdf.output().startsWith("%PDF-")).toBe(true);
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(pdf.internal.pageSize.getWidth()).toBeGreaterThan(
    pdf.internal.pageSize.getHeight(),
  );
});

it("combines bottle and can quantities into a single numeric category subtotal", () => {
  const records = executiveExportRows([
    row,
    {
      ...row,
      key: "two",
      productId: "two",
      unit: "BOTTLE",
      ordered: "3",
      received: "3",
      opening: "1",
      remaining: "1",
      consumed: "3",
    },
  ]);
  const subtotal = records.find(
    (record) => record.kind === "Category subtotal",
  )!;
  expect(subtotal.cells.slice(2, 7)).toEqual([15, 15, 1, 13, 3]);
  expect(
    executiveCsv([row, { ...row, key: "two", unit: "BOTTLE" }], 2026, [
      "Groceries",
    ]),
  ).not.toContain("bottle");
});
