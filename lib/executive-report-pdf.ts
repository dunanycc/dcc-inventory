import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import {
  EXECUTIVE_COLUMNS,
  executiveExportRows,
} from "./executive-report-export";
import type { ExecutiveRow } from "./executive-report";
export function executivePdf(
  rows: ExecutiveRow[],
  year: number,
  vendors: string[],
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const records = executiveExportRows(rows);
  const tableRows: {
    record: (typeof records)[number] | null;
    cells: RowInput;
  }[] = [];
  let lastGroup = "";
  for (const record of records) {
    const key = JSON.stringify([record.section, record.category]);
    const startsGroup = record.kind !== "Total" && key !== lastGroup;
    if (startsGroup) lastGroup = key;
    tableRows.push({
      record,
      cells: record.cells.map((cell, index) => {
        if (index === 0 && startsGroup)
          return {
            content: `${record.section} / ${record.category || "Other"}\n${cell}`,
            styles: {
              halign: "left",
              fillColor: [226, 238, 222],
              textColor: [25, 65, 40],
            },
          };
        if (cell === null)
          return index === 8
            ? `Unavailable${record.kind !== "Product" ? `\nKnown: $${record.knownCost.toFixed(2)}` : ""}`
            : "";
        if (typeof cell === "number")
          return index >= 7
            ? `$${cell.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : cell.toLocaleString("en-CA", { maximumFractionDigits: 2 });
        return cell;
      }),
    });
  }
  doc.setFontSize(16);
  doc.setTextColor(25, 65, 40);
  doc.text(`DCC Executive Inventory Report - ${year}`, 12, 14);
  doc.setFontSize(9);
  doc.setTextColor(65);
  const filters = doc.splitTextToSize(
    `Selected: ${vendors.join(", ") || "None"} | Exported ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "medium" }).format(new Date())}`,
    273,
  );
  doc.text(filters, 12, 21);
  const notes = doc.splitTextToSize(
    "Consumption = opening + receipts during year - remaining. Current year uses live stock; earlier years use closing counts. Costs exclude separately entered GST/PST. Missing data is unavailable; known cost is shown for incomplete totals.",
    273,
  );
  doc.text(notes, 12, 24 + filters.length * 4);
  autoTable(doc, {
    startY: 28 + filters.length * 4 + notes.length * 4,
    margin: { left: 12, right: 12, bottom: 13, top: 20 },
    head: [EXECUTIVE_COLUMNS],
    body: tableRows.map((row) => row.cells),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2,
      halign: "right",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 80, 49],
      fontStyle: "normal",
      halign: "right",
    },
    columnStyles: { 0: { cellWidth: 60, halign: "left" } },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 0)
        data.cell.styles.halign = "left";
      if (data.section === "body") {
        const row = tableRows[data.row.index].record;
        if (!row) return;
        if (row.kind !== "Product") {
          data.cell.styles.fillColor = [236, 243, 233];
          data.cell.styles.fontStyle = "normal";
        }
        if (data.column.index === 0 && row.kind === "Category subtotal")
          data.cell.text = [`${row.section} / ${String(row.cells[0])}`];
        if (row.kind === "Product" && row.note && data.column.index === 8)
          data.cell.text.push(row.note);
      }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFontSize(10);
      doc.setTextColor(25, 65, 40);
      doc.text(`DCC Executive Inventory Report - ${year}`, 12, 12);
    }
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`${year} Executive view`, 12, 203);
    doc.text(`Page ${page} of ${pages}`, 285, 203, { align: "right" });
  }
  return doc;
}
