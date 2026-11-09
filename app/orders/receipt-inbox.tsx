"use client";
import { useState } from "react";
import { ReceiptFiles } from "./receipt-files";
export type ReceiptOrder = {
  id: string;
  vendorId: string;
  vendorName: string;
  number: number;
  year: number;
  orderDate: string | null;
  status: string;
  isPrivate: boolean;
  receipts: { id: string; name: string; mimeType: string }[];
  lines: { productName: string }[];
};
export function ReceiptInbox({
  vendors,
  orders,
  currentYear,
}: {
  vendors: { id: string; name: string }[];
  orders: ReceiptOrder[];
  currentYear: number;
}) {
  const [vendor, setVendor] = useState(""),
    [showExisting, setShowExisting] = useState(false),
    [year, setYear] = useState(String(currentYear)),
    [message, setMessage] = useState("");
  const years = [
    ...new Set([currentYear, ...orders.map((order) => order.year)]),
  ].sort((a, b) => b - a);
  const visible = orders.filter(
    (order) =>
      order.vendorId === vendor &&
      (!year || order.year === Number(year)) &&
      (showExisting || order.receipts.length === 0),
  );
  return (
    <section className="receipt-inbox">
      <h1>Add Receipts</h1>
      <p>
        Select the vendor for your receipt. Take a photo or choose a file; large
        photos are resized automatically.
      </p>
      <div
        className="order-vendor-pills receipt-vendor-pills"
        aria-label="Receipt vendor"
      >
        {vendors.map((v) => (
          <button
            type="button"
            key={v.id}
            className={`btn-secondary ${vendor === v.id ? "is-selected" : ""}`}
            aria-pressed={vendor === v.id}
            onClick={() => {
              setVendor(v.id);
              setMessage("");
            }}
          >
            {v.name}
          </button>
        ))}
      </div>
      {vendor && (
        <>
          <div className="receipt-inbox-filters">
            <label className="order-field">
              Year
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="product-check">
              <input
                type="checkbox"
                checked={showExisting}
                onChange={(e) => setShowExisting(e.target.checked)}
              />
              Show orders with existing receipts
            </label>
          </div>
          <p>
            {visible.length} order{visible.length === 1 ? "" : "s"}
            {showExisting ? "" : " missing receipts"}
          </p>
          {message && (
            <p role="status" className="notice success">
              {message}
            </p>
          )}
          {visible.map((order) => (
            <article
              key={order.id}
              className="submitted-order order-panel receipt-inbox-order"
            >
              <header>
                <h2>
                  {order.vendorName} · {order.year}-{order.number}
                </h2>
                <time>{order.orderDate || "Date needs review"}</time>
                {order.isPrivate && (
                  <span className="order-private-badge">Private</span>
                )}
                <span
                  className={`receipt-marker ${order.receipts.length ? "receipt-attached" : "receipt-missing"}`}
                >
                  {order.receipts.length
                    ? `${order.receipts.length} receipt${order.receipts.length === 1 ? "" : "s"}`
                    : "No receipt"}
                </span>
              </header>
              <p className="receipt-order-products">
                {order.lines
                  .slice(0, 3)
                  .map((line) => line.productName)
                  .join(", ")}
                {order.lines.length > 3
                  ? ` +${order.lines.length - 3} more`
                  : ""}
              </p>
              <ReceiptFiles
                order={order}
                canManage
                uploadLabel="Add receipt"
                onChanged={setMessage}
              />
            </article>
          ))}
          {!visible.length && (
            <p className="empty-panel">
              {showExisting
                ? "No orders for this vendor and year."
                : "All orders for this vendor and year have receipts."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
