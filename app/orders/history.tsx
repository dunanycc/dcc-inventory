"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
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
          Drag an order heading to another position to move the whole order and
          renumber this vendor/year. You can also use the position selector or
          arrow keys.
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
                <th>Product / unit</th>
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
                    <span className="order-muted">
                      {o.orderDate ?? "Date needs review"}
                    </span>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
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
                              orders[
                                orders.findIndex((order) => order.id === o.id) +
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
                          Move ↔
                        </button>
                        <select
                          aria-label={`Position for order ${o.number}`}
                          disabled={busy}
                          value={o.id}
                          onChange={(e) => move(o.id, e.target.value)}
                        >
                          {orders.map((target) => (
                            <option key={target.id} value={target.id}>
                              Position {target.number}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(([key, p]) => (
                <tr key={key}>
                  <th scope="row">
                    {p.name}
                    <small className="order-muted">
                      {p.category} · {p.unit}
                    </small>
                  </th>
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
                </tr>
              ))}
              <tr>
                <th scope="row">Grand total</th>
                {visibleOrders.map((o) => {
                  const total = receiptTotals(
                    o.lines.map((l) => ({
                      quantity: l.receivedQuantity ?? l.orderedQuantity,
                      price: l.unitPrice,
                    })),
                    o.taxIncluded,
                    o.gst,
                    o.pst,
                  ).total;
                  return (
                    <td key={o.id}>
                      {total === null ? "Unavailable" : `$${total}`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
