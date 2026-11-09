"use client";
import { Fragment, useState } from "react";
import { executiveCsv } from "@/lib/executive-report-export";
import type { OrderRow } from "@/lib/purchase-order-queries";
import {
  executiveRows,
  hasExecutiveValues,
  executiveSubtotal,
  type ExecutiveProduct,
  type ExecutiveStock,
  type ExecutiveRow,
} from "@/lib/executive-report";
const quantity = (value: string | null) =>
  value === null
    ? "—"
    : Number(value).toLocaleString("en-CA", { maximumFractionDigits: 2 });
const money = (value: string | null) =>
  value === null
    ? "Unavailable"
    : `$${Number(value).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function Total({
  rows,
  label,
  clubTotal = false,
}: {
  rows: ExecutiveRow[];
  label: string;
  clubTotal?: boolean;
}) {
  const t = executiveSubtotal(rows);
  const quantities = (
    field: "ordered" | "received" | "opening" | "remaining" | "consumed",
  ) =>
    rows.every((row) => row.isPrivate) &&
    ["opening", "remaining", "consumed"].includes(field)
      ? "—"
      : quantity(t[field].total) + (t[field].missing ? " *" : "");
  return (
    <tr className="executive-subtotal">
      <th scope="row">{label}</th>
      <td>{t.orders}</td>
      <td>{clubTotal ? "" : quantities("ordered")}</td>
      <td>{clubTotal ? "" : quantities("received")}</td>
      <td>{clubTotal ? "" : quantities("opening") || "—"}</td>
      <td>{clubTotal ? "" : quantities("consumed") || "—"}</td>
      <td>{clubTotal ? "" : quantities("remaining") || "—"}</td>
      <td>
        {clubTotal ? "" : t.averageCost === null ? "—" : money(t.averageCost)}
      </td>
      <td>
        {money(t.totalCost)}
        {t.totalCost === null && <small>Known: {money(t.knownCost)}</small>}
      </td>
    </tr>
  );
}
export function ExecutiveView({
  orders,
  products,
  stocks,
  vendors,
  year,
  years,
  currentYear,
}: {
  orders: OrderRow[];
  products: ExecutiveProduct[];
  stocks: ExecutiveStock[];
  vendors: { id: string; name: string }[];
  year: number;
  years: number[];
  currentYear: number;
}) {
  const sections = [...vendors].sort((a, b) => {
    const rank = (n: string) => {
      const i = ["saq", "beer", "groceries"].indexOf(n.toLowerCase());
      return i < 0 ? 3 : i;
    };
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
  const [hidden, setHidden] = useState<string[]>([]),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const selected = [...vendors.map((v) => v.id), "private"].filter(
    (id) => !hidden.includes(id),
  );
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const selectedNames = [...sections, { id: "private", name: "Private" }]
    .filter((v) => !hidden.includes(v.id))
    .map((v) => v.name);
  const [showZero, setShowZero] = useState(false);
  const rows = executiveRows(orders, products, stocks, selected).filter(
    (row) => showZero || hasExecutiveValues(row),
  );
  return (
    <section className="order-panel executive-view">
      <div className="executive-toolbar">
        <form className="order-filters">
          <input type="hidden" name="view" value="executive" />
          <label className="order-field">
            Year
            <select name="year" defaultValue={year}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <button className="btn-secondary">Show report</button>
        </form>
        <div
          className="order-vendor-pills"
          aria-label="Executive vendor filters"
        >
          {[...sections, { id: "private", name: "Private" }].map((v) => (
            <button
              key={v.id}
              type="button"
              className={`btn-secondary ${hidden.includes(v.id) ? "" : "is-selected"}`}
              aria-pressed={!hidden.includes(v.id)}
              onClick={() =>
                setHidden((old) =>
                  old.includes(v.id)
                    ? old.filter((id) => id !== v.id)
                    : [...old, v.id],
                )
              }
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
      <div className="executive-export-actions">
        <label className="product-check">
          <input
            type="checkbox"
            checked={showZero}
            onChange={(event) => setShowZero(event.target.checked)}
          />
          Show zero-value products
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={!rows.length || exporting}
          onClick={() => {
            const blob = new Blob([executiveCsv(rows, year, selectedNames)], {
              type: "text/csv;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `dcc-executive-${year}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!rows.length || exporting}
          onClick={async () => {
            setExporting(true);
            setExportError("");
            try {
              const { executivePdf } =
                await import("@/lib/executive-report-pdf");
              executivePdf(rows, year, selectedNames).save(
                `dcc-executive-${year}.pdf`,
              );
            } catch {
              setExportError("PDF export failed. Please try again.");
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing PDF…" : "Export PDF"}
        </button>
        <small>
          Exports include all products in the selected filters, including
          collapsed categories.
        </small>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      <p className="executive-description">
        {year === currentYear
          ? `${year} year to date · remaining units use current tracked stock.`
          : `${year} year end · remaining units use accepted closing counts.`}{" "}
        Vendor filters select purchases and products; stock and consumption are
        club-wide.
      </p>
      <p className="executive-description">
        Cases are converted to bottles/cans or the product’s counted unit.
        Consumption = opening + all units received − remaining. Average cost is
        weighted by received units. Separate GST/PST amounts are excluded from
        product costs.
      </p>
      {[false, true].map((isPrivate) => {
        const group = rows.filter((row) => row.isPrivate === isPrivate);
        if (!group.length) return null;
        const categories = [...new Set(group.map((row) => row.categoryName))];
        return (
          <section key={String(isPrivate)} className="executive-section">
            <h2>{isPrivate ? "Private purchases" : "Club inventory"}</h2>
            {isPrivate && (
              <p className="order-muted">
                Private purchases do not affect club inventory or consumption.
              </p>
            )}
            <div className="table-scroll">
              <table className="inventory-table executive-table">
                <colgroup>
                  <col className="executive-product-column" />
                  {Array.from({ length: 8 }, (_, i) => (
                    <col key={i} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {[
                      "Product",
                      "Orders",
                      "Units ordered",
                      "Units received",
                      "Opening units",
                      "Units consumed",
                      "Remaining units",
                      "Avg cost / unit",
                      "Total cost",
                    ].map((title) => (
                      <th key={title}>{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const categoryRows = group.filter(
                        (row) => row.categoryName === category,
                      ),
                      key = JSON.stringify([isPrivate, category]);
                    return (
                      <Fragment key={key}>
                        <tr className="executive-category">
                          <th colSpan={9}>
                            <button
                              type="button"
                              aria-expanded={!collapsed.includes(key)}
                              onClick={() =>
                                setCollapsed((old) =>
                                  old.includes(key)
                                    ? old.filter((k) => k !== key)
                                    : [...old, key],
                                )
                              }
                            >
                              <span aria-hidden="true">
                                {collapsed.includes(key) ? "▸" : "▾"}
                              </span>{" "}
                              {category || "Other"}
                            </button>
                          </th>
                        </tr>
                        {!collapsed.includes(key) &&
                          categoryRows.map((row) => (
                            <tr key={row.key}>
                              <th scope="row">
                                {row.name}
                                {!row.productId && !row.isPrivate && (
                                  <small>Archived label</small>
                                )}
                              </th>
                              <td>{row.orders.length}</td>
                              <td>{quantity(row.ordered)}</td>
                              <td>{quantity(row.received)}</td>
                              <td>{quantity(row.opening)}</td>
                              <td
                                className={
                                  row.consumed !== null &&
                                  Number(row.consumed) < 0
                                    ? "executive-warning"
                                    : ""
                                }
                              >
                                {quantity(row.consumed)}
                              </td>
                              <td>{quantity(row.remaining)}</td>
                              <td>
                                {row.averageCost === null
                                  ? "—"
                                  : money(row.averageCost)}
                              </td>
                              <td>
                                {money(row.totalCost)}
                                {row.totalCost === null && (
                                  <small>
                                    {row.missingPrices} unpriced receipt
                                    {row.missingPrices === 1 ? "" : "s"}
                                  </small>
                                )}
                              </td>
                            </tr>
                          ))}
                        <Total
                          rows={categoryRows}
                          label={`${category || "Other"} subtotal`}
                        />
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <Total
                    rows={group}
                    clubTotal={!isPrivate}
                    label={isPrivate ? "Private total" : "Club total"}
                  />
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
      {!rows.length && <p>No products match these filters.</p>}
      <p className="executive-description">
        — means unavailable or not applicable. * Quantity subtotal is incomplete
        where stock records are missing. Negative consumption needs review.
        Archived labels without a product match have no stock balance. Mapped
        legacy labels are combined under their current product to avoid counting
        stock twice.
      </p>
    </section>
  );
}
