"use client";
import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import { moveOrderAction } from "@/app/(protected)/orders/actions";
import {
  historyLineKey,
  historyReceivedQuantity,
  compareHistoryProducts,
} from "@/lib/purchase-order-history";
import { receiptTotals } from "@/lib/purchase-order";

export function OrderHistory({
  orders,
  vendors,
  canManage,
}: {
  orders: OrderRow[];
  vendors: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [extra, setExtra] = useState(0);
  const router = useRouter();
  const priority = ["saq", "beer", "groceries"];
  const sections = [...vendors]
    .sort((a, b) => {
      const rank = (name: string) => {
        const i = priority.indexOf(name.toLowerCase());
        return i < 0 ? 3 : i;
      };
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    })
    .map((v) => ({
      ...v,
      orders: orders.filter((o) => !o.isPrivate && o.vendorId === v.id),
    }));
  sections.push({
    id: "private",
    name: "Private",
    orders: orders.filter((o) => o.isPrivate),
  });
  const count = Math.max(5, ...orders.map((o) => o.number)) + extra;
  const columns = Array.from({ length: count }, (_, i) => i + 1);
  function move(id: string, position: number) {
    if (busy) return;
    start(async () => {
      const result = await moveOrderAction(id, position);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  const keyOf = historyLineKey;
  const valuesFor = (group: OrderRow[], key: string) =>
    group.flatMap((o) =>
      o.lines.filter((l) => keyOf(l) === key).map(historyReceivedQuantity),
    );
  const display = (values: (string | null)[], category: string) =>
    !values.length
      ? "—"
      : values.some((v) => v === null)
        ? "Pending"
        : values
            .reduce((sum, v) => sum + Number(v), 0)
            .toLocaleString("en-CA", {
              maximumFractionDigits:
                category.trim().toLowerCase() === "hard liquor" ? 2 : 0,
            });
  const totalFor = (group: OrderRow[]) => {
    if (!group.length) return "—";
    if (group.some((o) => o.lines.some((l) => l.receivedQuantity === null)))
      return "Pending";
    const totals = group.map(
      (o) =>
        receiptTotals(
          o.lines.map((l) => ({
            quantity: l.receivedQuantity ?? "0",
            price: l.unitPrice,
          })),
          o.taxIncluded,
          o.gst,
          o.pst,
        ).total,
    );
    return totals.some((v) => v === null)
      ? "Unavailable"
      : `$${totals.reduce((sum, v) => sum + Number(v), 0).toFixed(2)}`;
  };
  return (
    <section className="order-panel">
      <div className="order-filters">
        <div className="order-vendor-pills" aria-label="Show order sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn-secondary ${hidden.includes(s.id) ? "" : "is-selected"}`}
              aria-pressed={!hidden.includes(s.id)}
              onClick={() =>
                setHidden((old) =>
                  old.includes(s.id)
                    ? old.filter((id) => id !== s.id)
                    : [...old, s.id],
                )
              }
            >
              {s.name}
            </button>
          ))}
        </div>
        {canManage && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setExtra((n) => n + 1)}
          >
            Add column
          </button>
        )}
      </div>
      {canManage && (
        <p>
          Drag a handle to a numbered column, or focus a handle and use
          left/right arrow keys. Empty columns are preserved; distinct orders
          can share a column without being merged.
        </p>
      )}
      <p role="status">{busy ? "Saving sequence…" : message}</p>
      <div className="table-scroll">
        <table className="inventory-table order-history-table order-year-table">
          <thead>
            <tr>
              <th>Product</th>
              {columns.map((n) => (
                <th key={n} className="order-column-number">
                  #{n}
                </th>
              ))}
              <th className="order-history-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {sections
              .filter((s) => !hidden.includes(s.id))
              .map((section) => {
                const products = [
                  ...new Map(
                    section.orders.flatMap((o) =>
                      o.lines.map((l) => [keyOf(l), l] as const),
                    ),
                  ).entries(),
                ].sort((a, b) => compareHistoryProducts(a[1], b[1]));
                return (
                  <Fragment key={section.id}>
                    <tr className="order-section-row">
                      <th scope="row">{section.name}</th>
                      {columns.map((n) => (
                        <td
                          key={n}
                          className={`order-column-drop ${dragging ? "is-drop-target" : ""}`}
                          onDragOver={(e) => {
                            if (canManage && dragging && !busy)
                              e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragging) move(dragging, n);
                            setDragging(null);
                          }}
                        >
                          {section.orders
                            .filter((o) => o.number === n)
                            .map((o) => (
                              <div key={o.id} className="order-column-card">
                                {section.id === "private" && (
                                  <span className="order-muted">
                                    {o.vendorName}
                                  </span>
                                )}
                                <div className="order-date-row">
                                  <Link
                                    href={`/orders?id=${o.id}`}
                                    className="order-muted"
                                    aria-label={`Open ${o.vendorName} order ${o.number}, ${o.orderDate ?? "date needs review"}`}
                                  >
                                    {o.orderDate ?? "Date needs review"}
                                  </Link>
                                  {canManage && (
                                    <button
                                      type="button"
                                      className="order-grab-handle"
                                      title="Drag to a column; use left or right arrow keys"
                                      aria-label={`Move ${o.vendorName} order ${o.number}${o.isPrivate ? " private" : ""}`}
                                      disabled={busy}
                                      draggable={!busy}
                                      onDragStart={(e) => {
                                        setDragging(o.id);
                                        e.dataTransfer.setData(
                                          "text/plain",
                                          o.id,
                                        );
                                      }}
                                      onDragEnd={() => setDragging(null)}
                                      onKeyDown={(e) => {
                                        if (
                                          e.key !== "ArrowLeft" &&
                                          e.key !== "ArrowRight"
                                        )
                                          return;
                                        e.preventDefault();
                                        const next =
                                          o.number +
                                          (e.key === "ArrowLeft" ? -1 : 1);
                                        if (next >= 1 && next <= 1000)
                                          move(o.id, next);
                                      }}
                                    >
                                      <svg
                                        width="12"
                                        height="18"
                                        viewBox="0 0 12 18"
                                        fill="currentColor"
                                        aria-hidden="true"
                                      >
                                        {[4, 9, 14].map((y) => (
                                          <g key={y}>
                                            <circle cx="3" cy={y} r="1.3" />
                                            <circle cx="8" cy={y} r="1.3" />
                                          </g>
                                        ))}
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                        </td>
                      ))}
                      <td className="order-history-total" />
                    </tr>
                    {!section.orders.length && (
                      <tr>
                        <th scope="row">No orders</th>
                        {columns.map((n) => (
                          <td key={n} />
                        ))}
                        <td className="order-history-total" />
                      </tr>
                    )}
                    {products.map(([key, p], index) => (
                      <Fragment key={key}>
                        {(index === 0 ||
                          products[index - 1][1].categoryName !==
                            p.categoryName) && (
                          <tr className="order-category-row">
                            <th scope="row">
                              <button
                                type="button"
                                className="order-category-toggle"
                                aria-expanded={
                                  !collapsed.includes(
                                    JSON.stringify([
                                      section.id,
                                      p.categoryName,
                                    ]),
                                  )
                                }
                                aria-label={`${collapsed.includes(JSON.stringify([section.id, p.categoryName])) ? "Expand" : "Collapse"} ${section.name} ${p.categoryName || "Other"}`}
                                onClick={() => {
                                  const categoryKey = JSON.stringify([
                                    section.id,
                                    p.categoryName,
                                  ]);
                                  setCollapsed((old) =>
                                    old.includes(categoryKey)
                                      ? old.filter(
                                          (value) => value !== categoryKey,
                                        )
                                      : [...old, categoryKey],
                                  );
                                }}
                              >
                                <span aria-hidden="true">
                                  {collapsed.includes(
                                    JSON.stringify([
                                      section.id,
                                      p.categoryName,
                                    ]),
                                  )
                                    ? "▸"
                                    : "▾"}
                                </span>
                                {p.categoryName || "Other"}
                              </button>
                            </th>
                            {columns.map((n) => (
                              <td key={n} />
                            ))}
                            <td className="order-history-total" />
                          </tr>
                        )}
                        <tr
                          hidden={collapsed.includes(
                            JSON.stringify([section.id, p.categoryName]),
                          )}
                        >
                          <th scope="row">{p.historyName}</th>
                          {columns.map((n) => (
                            <td key={n}>
                              {display(
                                valuesFor(
                                  section.orders.filter((o) => o.number === n),
                                  key,
                                ),
                                p.categoryName,
                              )}
                            </td>
                          ))}
                          <td className="order-history-total">
                            {display(
                              valuesFor(section.orders, key),
                              p.categoryName,
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                    <tr>
                      <th scope="row">Grand total</th>
                      {columns.map((n) => (
                        <td key={n}>
                          {totalFor(
                            section.orders.filter((o) => o.number === n),
                          )}
                        </td>
                      ))}
                      <td className="order-history-total">
                        {totalFor(section.orders)}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
