"use client";
import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import { moveOrderAction } from "@/app/(protected)/orders/actions";
import { receiptTotals } from "@/lib/purchase-order";
export function OrderHistory({
  orders,
  canManage,
}: {
  orders: OrderRow[];
  canManage: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const [mode, setMode] = useState("received");
  const [includePrivate, setIncludePrivate] = useState(true);
  const visibleOrders = orders.filter((o) => includePrivate || !o.isPrivate);
  const router = useRouter();
  function move(id: string, target: string) {
    if (id === target || busy) return;
    start(async () => {
      const result = await moveOrderAction(id, target);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  const rows = new Map<
    string,
    { name: string; category: string; unit: string }
  >();
  for (const o of visibleOrders)
    for (const l of o.lines)
      rows.set(JSON.stringify([l.productName, l.categoryName, l.unit]), {
        name: l.productName,
        category: l.categoryName,
        unit: l.unit,
      });
  const products = [...rows.entries()].sort(
    (a, b) =>
      a[1].category.localeCompare(b[1].category) ||
      a[1].name.localeCompare(b[1].name),
  );
  const orderTotals = visibleOrders.map(
    (o) =>
      receiptTotals(
        o.lines.map((l) => ({
          quantity: l.receivedQuantity ?? l.orderedQuantity,
          price: l.unitPrice,
        })),
        o.taxIncluded,
        o.gst,
        o.pst,
      ).total,
  );
  return (
    <section className="order-panel">
      <div className="order-filters">
        <label className="order-field">
          Quantities
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="received">Received</option>
            <option value="ordered">Ordered</option>
          </select>
        </label>
        <label className="product-check">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => setIncludePrivate(e.target.checked)}
          />{" "}
          Include private orders
        </label>
      </div>
      {canManage && (
        <p>
          Drag the grab handle to move a whole order. Use left or right arrow
          keys when the handle is focused.
        </p>
      )}
      <p role="status">{busy ? "Saving sequence…" : message}</p>
      {!visibleOrders.length ? (
        <p>No orders for this vendor and year.</p>
      ) : (
        <div className="table-scroll">
          <table className="inventory-table order-history-table">
            <thead>
              <tr>
                <th>Product</th>
                {visibleOrders.map((o) => (
                  <th
                    key={o.id}
                    onDragOver={(e) => {
                      if (canManage && !busy) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging) move(dragging, o.id);
                      setDragging(null);
                    }}
                  >
                    <Link href={`/orders?id=${o.id}`}>#{o.number}</Link>
                    {o.isPrivate && (
                      <span className="order-private-badge">Private</span>
                    )}
                    <div className="order-date-row">
                      <span className="order-muted">
                        {o.orderDate ?? "Date needs review"}
                      </span>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="order-grab-handle"
                            title="Drag to reorder; use left or right arrow keys"
                            disabled={busy}
                            draggable={!busy}
                            aria-label={`Move order ${o.number}`}
                            onDragStart={(e) => {
                              setDragging(o.id);
                              e.dataTransfer.setData("text/plain", o.id);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onKeyDown={(e) => {
                              const target =
                                visibleOrders[
                                  visibleOrders.findIndex(
                                    (order) => order.id === o.id,
                                  ) +
                                    (e.key === "ArrowLeft"
                                      ? -1
                                      : e.key === "ArrowRight"
                                        ? 1
                                        : 0)
                                ];
                              if (target && target.id !== o.id) {
                                e.preventDefault();
                                move(o.id, target.id);
                              }
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
                        </>
                      )}
                    </div>
                  </th>
                ))}
                <th className="order-history-total" scope="col">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map(([key, p], index) => (
                <Fragment key={key}>
                  {(index === 0 ||
                    products[index - 1][1].category !== p.category) && (
                    <tr className="order-category-row">
                      <th scope="row">{p.category || "Other"}</th>
                      {visibleOrders.map((o) => (
                        <td key={o.id} />
                      ))}
                      <td className="order-history-total" />
                    </tr>
                  )}
                  <tr>
                    <th scope="row">{p.name}</th>
                    {visibleOrders.map((o) => {
                      const matches = o.lines.filter(
                        (l) =>
                          JSON.stringify([
                            l.productName,
                            l.categoryName,
                            l.unit,
                          ]) === key,
                      );
                      const values = matches.map((l) =>
                        mode === "ordered"
                          ? l.orderedQuantity
                          : l.receivedQuantity,
                      );
                      return (
                        <td key={o.id}>
                          {!matches.length
                            ? "—"
                            : values.some((v) => v === null)
                              ? "Pending"
                              : values
                                  .reduce((sum, v) => sum + Number(v), 0)
                                  .toLocaleString("en-CA", {
                                    maximumFractionDigits:
                                      p.category.trim().toLowerCase() ===
                                      "hard liquor"
                                        ? 2
                                        : 0,
                                  })}
                        </td>
                      );
                    })}
                    <td className="order-history-total">
                      {(() => {
                        const values = visibleOrders.flatMap((o) =>
                          o.lines
                            .filter(
                              (l) =>
                                JSON.stringify([
                                  l.productName,
                                  l.categoryName,
                                  l.unit,
                                ]) === key,
                            )
                            .map((l) =>
                              mode === "ordered"
                                ? l.orderedQuantity
                                : l.receivedQuantity,
                            ),
                        );
                        return values.some((v) => v === null)
                          ? "Pending"
                          : values
                              .reduce((sum, v) => sum + Number(v), 0)
                              .toLocaleString("en-CA", {
                                maximumFractionDigits:
                                  p.category.trim().toLowerCase() ===
                                  "hard liquor"
                                    ? 2
                                    : 0,
                              });
                      })()}
                    </td>
                  </tr>
                </Fragment>
              ))}
              <tr>
                <th scope="row">Grand total</th>
                {orderTotals.map((total, index) => (
                  <td key={visibleOrders[index].id}>
                    {total === null ? "Unavailable" : `$${total}`}
                  </td>
                ))}
                <td className="order-history-total">
                  {orderTotals.some((total) => total === null)
                    ? "Unavailable"
                    : `$${orderTotals.reduce((sum, total) => sum + Number(total), 0).toFixed(2)}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
