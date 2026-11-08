"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import { receivedQuantityScale } from "@/lib/quantity-policy";
import { receiptTotals } from "@/lib/purchase-order";
import {
  finalizeOrderAction,
  editOrderAction,
} from "@/app/(protected)/orders/actions";
import { SubmitOrder } from "./new-order";
function ReceiptFiles({
  order,
  canManage,
}: {
  order: OrderRow;
  canManage: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("Uploading receipt…");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/orders/${order.id}/receipts`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setMessage("Receipt saved.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-receipts">
      <h3>Receipts</h3>
      {order.receipts.map((r) => (
        <p key={r.id}>
          <a
            href={`/api/orders/${order.id}/receipts/${r.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {r.name}
          </a>
        </p>
      ))}
      {canManage && (
        <>
          <p>PDF, JPEG, PNG, WebP, or HEIC; up to 3 MB per file.</p>
          <label className="order-field">
            Attach file
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="order-field">
            Take receipt photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
function OrderDetail({
  order,
  canManage,
  vendors,
  today,
}: {
  order: OrderRow;
  canManage: boolean;
  vendors: { id: string; name: string }[];
  today: string;
}) {
  const pending = order.status === "PENDING";
  const [lines, setLines] = useState(
    order.lines.map((l) => ({
      id: l.id,
      quantity: l.receivedQuantity ?? l.orderedQuantity,
      price: l.unitPrice ?? "",
    })),
  );
  const [taxIncluded, setTaxIncluded] = useState(order.taxIncluded);
  const [gst, setGst] = useState(order.gst);
  const [pst, setPst] = useState(order.pst);
  let totals;
  try {
    totals = receiptTotals(lines, taxIncluded, gst || "0", pst || "0");
  } catch {
    totals = null;
  }
  return (
    <div className="order-detail">
      {order.mergedIntoId && (
        <p className="notice">
          This original record was merged.{" "}
          <Link href={`/orders?id=${order.mergedIntoId}`}>
            View the combined order
          </Link>
          .
        </p>
      )}
      <p>{order.notes}</p>
      {order.isPrivate && (
        <p className="notice">
          Private order — manual products, outside club inventory. Finalizing
          will not create a stock delivery.
        </p>
      )}
      {order.historical && (
        <p className="notice">
          Imported history. No inventory is posted by this record. Historical
          prices may be unavailable.
        </p>
      )}
      <form
        action={finalizeOrderAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              order.isPrivate
                ? "Finalize this private order using the received quantities and prices shown? Club inventory will not change."
                : "Finalize this order using the received quantities and prices shown? This closes the order and posts stock once.",
            )
          )
            e.preventDefault();
        }}
      >
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <div className="table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Price per unit</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l, i) => {
                let total: string | null = null;
                try {
                  total = receiptTotals([lines[i]], true).total;
                } catch {}
                return (
                  <tr key={l.id}>
                    <td>
                      {l.productName}
                      <small className="order-muted">{l.categoryName}</small>
                    </td>
                    <td>
                      {l.unit}
                      {l.unitsPerEntry !== "1" && (
                        <small className="order-muted">
                          {l.unitsPerEntry} stock units
                        </small>
                      )}
                    </td>
                    <td>{l.orderedQuantity}</td>
                    <td>
                      {pending && canManage ? (
                        <input
                          className="order-number"
                          aria-label={`Received ${l.productName}`}
                          type="number"
                          required
                          min="0"
                          step={
                            receivedQuantityScale(l, order.isPrivate)
                              ? "0.01"
                              : "1"
                          }
                          value={lines[i].quantity}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, j) =>
                                j === i
                                  ? { ...x, quantity: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      ) : (
                        (l.receivedQuantity ?? "—")
                      )}
                    </td>
                    <td>
                      {pending && canManage ? (
                        <input
                          className="order-number"
                          aria-label={`Price per ${l.unit} for ${l.productName}`}
                          type="number"
                          min="0"
                          step="0.01"
                          required={Number(lines[i].quantity) > 0}
                          value={lines[i].price}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, j) =>
                                j === i ? { ...x, price: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      ) : l.unitPrice === null ? (
                        "Unavailable"
                      ) : (
                        `$${l.unitPrice}`
                      )}
                    </td>
                    <td>{total === null ? "Unavailable" : `$${total}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="order-totals">
          <p>
            Subtotal{" "}
            <strong>
              {totals?.subtotal == null ? "Unavailable" : `$${totals.subtotal}`}
            </strong>
          </p>
          <label className="product-check">
            <input
              type="checkbox"
              name="taxIncluded"
              checked={taxIncluded}
              disabled={!pending || !canManage}
              onChange={(e) => setTaxIncluded(e.target.checked)}
            />{" "}
            Tax included
          </label>
          <label className="order-field">
            GST ($)
            <input
              name="gst"
              type="number"
              min="0"
              step="0.01"
              value={taxIncluded ? "0" : gst}
              disabled={taxIncluded || !pending || !canManage}
              onChange={(e) => setGst(e.target.value)}
            />
          </label>
          <label className="order-field">
            PST ($)
            <input
              name="pst"
              type="number"
              min="0"
              step="0.01"
              value={taxIncluded ? "0" : pst}
              disabled={taxIncluded || !pending || !canManage}
              onChange={(e) => setPst(e.target.value)}
            />
          </label>
          <p className="order-grand-total">
            Grand total{" "}
            <strong>
              {totals?.total == null ? "Unavailable" : `$${totals.total}`}
            </strong>
          </p>
          {pending && canManage && (
            <>
              <label className="order-field">
                Received date
                <input
                  type="date"
                  required
                  name="receivedDate"
                  defaultValue={today}
                />
              </label>
              <SubmitOrder>Finalize receiving</SubmitOrder>
            </>
          )}
          {!pending && order.receivedDate && (
            <p>Received {order.receivedDate}</p>
          )}
        </div>
      </form>
      <ReceiptFiles order={order} canManage={canManage} />
      {canManage && (pending || order.historical) && (
        <details>
          <summary>Correct order details</summary>
          <form action={editOrderAction} className="order-correction">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="year" value={order.year} />
            {order.historical && (
              <label className="product-check order-private-toggle">
                <input
                  type="checkbox"
                  name="isPrivate"
                  defaultChecked={order.isPrivate}
                />{" "}
                Private order (no club inventory)
              </label>
            )}
            <label className="order-field">
              Vendor
              <select name="vendorId" defaultValue={order.vendorId}>
                {vendors
                  .filter((v) => order.historical || v.id === order.vendorId)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="order-field">
              Order date
              <input
                type="date"
                name="date"
                defaultValue={order.orderDate ?? ""}
                required={!order.historical}
              />
            </label>
            <label className="order-field">
              Notes
              <textarea
                name="notes"
                defaultValue={order.notes ?? ""}
                maxLength={1000}
              />
            </label>
            <div className="table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Product / unit</th>
                    <th>Ordered</th>
                    {order.historical && (
                      <>
                        <th>Received</th>
                        <th>Price (optional)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {order.isPrivate ? (
                          <>
                            <label className="order-field">
                              Product name
                              <input
                                name={`name-${l.id}`}
                                defaultValue={l.productName}
                                maxLength={160}
                                required
                              />
                            </label>
                            <label className="order-field">
                              Unit
                              <input
                                name={`unit-${l.id}`}
                                defaultValue={l.unit}
                                maxLength={80}
                                required
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            {l.productName} ({l.unit})
                          </>
                        )}
                        <input type="hidden" name="lineId" value={l.id} />
                      </td>
                      <td>
                        <input
                          className="order-number"
                          aria-label={`Correct ordered ${l.productName}`}
                          name={`ordered-${l.id}`}
                          defaultValue={l.orderedQuantity}
                          type="number"
                          min="0"
                          step="1"
                          required
                        />
                      </td>
                      {order.historical && (
                        <>
                          <td>
                            <input
                              className="order-number"
                              aria-label={`Correct received ${l.productName}`}
                              name={`received-${l.id}`}
                              defaultValue={l.receivedQuantity ?? ""}
                              type="number"
                              min="0"
                              step={
                                receivedQuantityScale(l, order.isPrivate)
                                  ? "0.01"
                                  : "1"
                              }
                              required
                            />
                          </td>
                          <td>
                            <input
                              className="order-number"
                              aria-label={`Correct price ${l.productName}`}
                              name={`price-${l.id}`}
                              defaultValue={l.unitPrice ?? ""}
                              type="number"
                              min="0"
                              step="0.01"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.historical && (
              <p>
                Historical corrections update order history only; they do not
                change inventory or existing deliveries.
              </p>
            )}
            <label className="order-field">
              Reason for correction
              <input name="reason" maxLength={500} required />
            </label>
            <p>
              Vendor/year changes assign the next available number. Use Order
              History to reposition the whole order.
            </p>
            <SubmitOrder>Save correction</SubmitOrder>
          </form>
        </details>
      )}
    </div>
  );
}
export function Orders({
  orders,
  vendors,
  canManage,
  today,
}: {
  orders: OrderRow[];
  vendors: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const [vendor, setVendor] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  return (
    <>
      <div className="order-filters">
        <label className="order-field">
          Vendor
          <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="order-field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="RECEIVED">Received</option>
          </select>
        </label>
        <label className="order-field">
          Order type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All orders</option>
            <option value="inventory">Inventory</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>
      {!orders.length && <p>No orders yet.</p>}
      {orders
        .filter(
          (o) =>
            (!vendor || o.vendorId === vendor) &&
            (!status || o.status === status) &&
            (!kind || (kind === "private" ? o.isPrivate : !o.isPrivate)),
        )
        .map((o) => (
          <details
            className="order-panel"
            key={`${o.id}-${o.updatedAt}`}
            open={orders.length === 1}
          >
            <summary>
              <strong>
                {o.vendorName} · {o.year} · #{o.number}
                {o.isPrivate ? " · Private" : ""}
              </strong>{" "}
              — {o.orderDate ?? "Date needs review"} · {o.status.toLowerCase()}
            </summary>
            <OrderDetail
              order={o}
              vendors={vendors}
              canManage={canManage && !o.mergedIntoId}
              today={today}
            />
          </details>
        ))}
    </>
  );
}
