"use client";
import Link from "next/link";
import { ReceiptFiles } from "./receipt-files";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import { receivedQuantityScale } from "@/lib/quantity-policy";
import { compareHistoryProducts } from "@/lib/purchase-order-history";
import { receiptTotals } from "@/lib/purchase-order";
import { receiveOrderAction } from "@/app/(protected)/orders/actions";
import { OrderEditor, type OrderProductOption } from "./order-editor";
import { CancelOrderDialog } from "./cancel-order-dialog";

function quantityText(value: string | null) {
  return value === null
    ? "—"
    : Number(value).toLocaleString("en-CA", { maximumFractionDigits: 2 });
}
function quantitySummary(lines: OrderRow["lines"], received = false) {
  if (received && lines.some((l) => l.receivedQuantity === null)) return "—";
  const units = new Map<string, number>();
  for (const l of lines) {
    const unit = l.unit.toLowerCase();
    units.set(
      unit,
      (units.get(unit) || 0) +
        Number(received ? l.receivedQuantity : l.orderedQuantity),
    );
  }
  return [...units]
    .map(([unit, n]) => {
      const plurals: Record<string, string> = {
        case: "cases",
        bottle: "bottles",
        can: "cans",
        keg: "kegs",
        box: "boxes",
        package: "packages",
      };
      return `${quantityText(String(n))} ${n === 1 ? unit : plurals[unit] || unit}`;
    })
    .join(" · ");
}
function printOrder(id: string) {
  const card = document.getElementById(`order-${id}`)!;
  card.setAttribute("data-printing", "true");
  document.body.classList.add("printing-order");
  try {
    window.print();
  } finally {
    card.removeAttribute("data-printing");
    document.body.classList.remove("printing-order");
  }
}
function OrderCard({
  order,
  products,
  vendors,
  canManage,
  today,
}: {
  order: OrderRow;
  products: OrderProductOption[];
  vendors: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false),
    [receiving, setReceiving] = useState(false);
  const [busy, start] = useTransition(),
    [message, setMessage] = useState("");
  const [lines, setLines] = useState(
    order.lines.map((l) => ({
      id: l.id,
      quantity: l.receivedQuantity ?? l.orderedQuantity,
      price: l.unitPrice ?? "",
    })),
  );
  const [taxIncluded, setTaxIncluded] = useState(order.taxIncluded),
    [gst, setGst] = useState(order.gst),
    [pst, setPst] = useState(order.pst);
  const router = useRouter();
  const pending = order.status === "PENDING";
  const manageable =
    canManage &&
    !order.mergedIntoId &&
    ["PENDING", "RECEIVED"].includes(order.status);
  const displayLines = receiving
    ? order.lines.map((l, i) => ({
        ...l,
        receivedQuantity: lines[i].quantity,
        unitPrice: lines[i].price || null,
      }))
    : order.lines.map((l) => {
        if (!l.historyCaseSize) return l;
        const ratio = Number(l.unitsPerEntry) / Number(l.historyCaseSize);
        return {
          ...l,
          unit: "Case",
          unitsPerEntry: l.historyCaseSize,
          orderedQuantity: String(Number(l.orderedQuantity) * ratio),
          receivedQuantity:
            l.receivedQuantity === null
              ? null
              : String(Number(l.receivedQuantity) * ratio),
          unitPrice:
            l.unitPrice === null
              ? null
              : (Number(l.unitPrice) / ratio).toFixed(2),
        };
      });
  const sorted = [...displayLines].sort(compareHistoryProducts);
  const categories = [...new Set(sorted.map((l) => l.categoryName))];
  let totals;
  try {
    totals = receiptTotals(
      receiving
        ? lines
        : order.lines.map((l) => ({
            quantity: l.receivedQuantity ?? l.orderedQuantity,
            price: l.unitPrice,
          })),
      taxIncluded,
      gst || "0",
      pst || "0",
    );
  } catch {
    totals = null;
  }
  const label = `${order.vendorName} ${order.year}-${order.number}`;
  const emailBody = `${label}\nOrder date: ${order.orderDate || "Not set"}\n${order.notes || ""}\n\n${sorted.map((l) => `${l.productName}: ordered ${quantityText(l.orderedQuantity)}, received ${quantityText(l.receivedQuantity)} ${l.unit}`).join("\n")}\n\nGrand total: ${totals?.total == null ? "Unavailable" : "$" + totals.total}`;
  return (
    <article id={`order-${order.id}`} className="order-panel submitted-order">
      <header className="order-card-header">
        <h2>
          {order.vendorName} · {order.year}-{order.number}
        </h2>
        <time dateTime={order.orderDate || undefined}>
          {order.orderDate || "Date needs review"}
        </time>
        <span
          className={`order-state ${pending ? "pending" : order.status === "CANCELLED" ? "cancelled" : "received"}`}
        >
          {pending
            ? "Submitted"
            : order.status === "RECEIVED"
              ? "Received"
              : order.status === "CANCELLED"
                ? "Cancelled"
                : order.status.toLowerCase()}
        </span>
        {order.isPrivate && (
          <span className="order-private-badge">Private</span>
        )}
        <span
          className={`receipt-marker ${order.receipts.length ? "receipt-attached" : "receipt-missing"}`}
        >
          {order.receipts.length
            ? `${order.receipts.length === 1 ? "Receipt attached" : `${order.receipts.length} receipts`}`
            : "No receipt"}
        </span>
        <div className="order-card-actions">
          {manageable && (
            <button
              className="btn-secondary"
              onClick={() => setCancelling(true)}
            >
              Cancel order
            </button>
          )}
          {manageable && (
            <button className="btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {pending && manageable && (
            <button
              className="btn-primary"
              onClick={() => setReceiving((v) => !v)}
            >
              {receiving ? "Cancel receiving" : "Receive"}
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => printOrder(order.id)}
          >
            Print
          </button>
          <a
            className="btn-secondary"
            href={`mailto:?subject=${encodeURIComponent(label)}&body=${encodeURIComponent(emailBody)}`}
          >
            Email
          </a>
        </div>
      </header>
      {order.mergedIntoId && (
        <p className="notice">
          Original merged record.{" "}
          <Link href={`/orders?id=${order.mergedIntoId}`}>
            View combined order
          </Link>
          .
        </p>
      )}
      {order.notes && <p className="order-card-comments">{order.notes}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const receivedDate = String(
            new FormData(e.currentTarget).get("receivedDate"),
          );
          start(async () => {
            setMessage("");
            const result = await receiveOrderAction({
              id: order.id,
              receivedDate,
              taxIncluded,
              gst: gst || "0",
              pst: pst || "0",
              lines,
            });
            if (!result.ok) setMessage(result.message);
            else {
              router.refresh();
              setReceiving(false);
            }
          });
        }}
      >
        <div className="table-scroll">
          <table className="inventory-table order-card-table">
            <colgroup>
              <col className="order-card-product-column" />
              <col className="order-card-quantity-column" />
              <col className="order-card-quantity-column" />
              <col className="order-card-price-column" />
              <col className="order-card-amount-column" />
            </colgroup>
            <thead>
              <tr>
                <th>Product</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Price / unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const group = sorted.filter((l) => l.categoryName === category);
                return (
                  <Fragment key={category}>
                    <tr className="order-card-category">
                      <th colSpan={5}>{category || "Other"}</th>
                    </tr>
                    {group.map((l) => {
                      const index = order.lines.findIndex((x) => x.id === l.id);
                      let amount: string | null = null;
                      try {
                        amount = receiptTotals(
                          [
                            {
                              quantity: receiving
                                ? lines[index].quantity
                                : (l.receivedQuantity ?? l.orderedQuantity),
                              price: receiving
                                ? lines[index].price
                                : l.unitPrice,
                            },
                          ],
                          true,
                        ).total;
                      } catch {}
                      return (
                        <tr key={l.id}>
                          <th scope="row">
                            {l.productName}
                            <small className="order-muted">{l.unit}</small>
                          </th>
                          <td>{quantityText(l.orderedQuantity)}</td>
                          <td className="received-quantity">
                            {receiving ? (
                              <input
                                className="order-number"
                                aria-label={`Received ${l.productName}`}
                                type="number"
                                min="0"
                                required
                                step={
                                  receivedQuantityScale(l, order.isPrivate)
                                    ? "0.01"
                                    : "1"
                                }
                                value={lines[index].quantity}
                                onChange={(e) =>
                                  setLines((old) =>
                                    old.map((x, i) =>
                                      i === index
                                        ? { ...x, quantity: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            ) : (
                              quantityText(l.receivedQuantity)
                            )}
                          </td>
                          <td>
                            {receiving ? (
                              <input
                                className="order-number"
                                aria-label={`Price per ${l.unit} for ${l.productName}`}
                                type="number"
                                min="0"
                                step="0.01"
                                required={Number(lines[index].quantity) > 0}
                                value={lines[index].price}
                                onChange={(e) =>
                                  setLines((old) =>
                                    old.map((x, i) =>
                                      i === index
                                        ? { ...x, price: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            ) : l.unitPrice === null ? (
                              "Unavailable"
                            ) : (
                              `$${Number(l.unitPrice).toFixed(2)}`
                            )}
                          </td>
                          <td>
                            {amount === null ? "Unavailable" : `$${amount}`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="order-card-subtotal">
                      <th scope="row">Subtotal</th>
                      <td>{quantitySummary(group)}</td>
                      <td>{quantitySummary(group, true)}</td>
                      <td />
                      <td>
                        {(() => {
                          try {
                            const total = receiptTotals(
                              group.map((l) => ({
                                quantity:
                                  l.receivedQuantity ?? l.orderedQuantity,
                                price: l.unitPrice,
                              })),
                              true,
                            ).total;
                            return total === null ? "Unavailable" : `$${total}`;
                          } catch {
                            return "Unavailable";
                          }
                        })()}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="order-card-total">
                <th scope="row" colSpan={4}>
                  Grand total
                </th>
                <td>
                  <strong>
                    {totals?.total == null ? "Unavailable" : `$${totals.total}`}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {(receiving || order.receivedDate || !taxIncluded) && (
          <div className="order-card-footer">
            {receiving ? (
              <div className="order-edit-taxes">
                <label className="product-check">
                  <input
                    type="checkbox"
                    checked={taxIncluded}
                    onChange={(e) => setTaxIncluded(e.target.checked)}
                  />
                  Tax included
                </label>
                <label className="order-field">
                  GST ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={taxIncluded}
                    value={taxIncluded ? "0" : gst}
                    onChange={(e) => setGst(e.target.value)}
                  />
                </label>
                <label className="order-field">
                  PST ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={taxIncluded}
                    value={taxIncluded ? "0" : pst}
                    onChange={(e) => setPst(e.target.value)}
                  />
                </label>
                <label className="order-field">
                  Received date
                  <input
                    type="date"
                    name="receivedDate"
                    defaultValue={today}
                    required
                  />
                </label>
                <button className="btn-primary" disabled={busy}>
                  {busy ? "Finalizing…" : "Finalize receiving"}
                </button>
              </div>
            ) : (
              <span className="order-muted">
                {order.receivedDate
                  ? `Received ${order.receivedDate}`
                  : pending
                    ? "Awaiting receipt of goods"
                    : ""}
                {!taxIncluded ? ` · GST $${gst} · PST $${pst}` : ""}
              </span>
            )}
          </div>
        )}
        {message && (
          <p role="alert" className="notice error">
            {message}
          </p>
        )}
      </form>
      {order.cancellationReason && (
        <p className="order-cancellation-reason">
          Cancelled: {order.cancellationReason}
        </p>
      )}
      <ReceiptFiles
        order={order}
        canManage={manageable}
        canDelete={canManage}
      />
      {cancelling && (
        <CancelOrderDialog order={order} onClose={() => setCancelling(false)} />
      )}
      {editing && (
        <OrderEditor
          order={order}
          products={products}
          vendors={vendors}
          onClose={() => setEditing(false)}
        />
      )}
    </article>
  );
}
function CheckboxFilter({
  label,
  options,
  selected,
  onChange,
  allLabel,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange(values: string[]): void;
  allLabel: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const all =
    options.length > 0 &&
    options.every((option) => selected.includes(option.value));
  const summary =
    all && options.length > 1
      ? allLabel
      : selected.length
        ? options
            .filter((option) => selected.includes(option.value))
            .map((option) => option.label)
            .join(", ")
        : "None selected";
  return (
    <div className="order-field order-checkbox-filter">
      <span>{label}</span>
      <details
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            ref.current!.open = false;
            ref.current?.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label={`${label}: ${summary}`}>{summary}</summary>
        <div
          className="order-filter-options"
          role="group"
          aria-label={`${label} selections`}
        >
          <label>
            <input
              type="checkbox"
              checked={all}
              onChange={() =>
                onChange(all ? [] : options.map((option) => option.value))
              }
            />
            {allLabel}
          </label>
          {options.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() =>
                  onChange(
                    selected.includes(option.value)
                      ? selected.filter((value) => value !== option.value)
                      : [...selected, option.value],
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
export function Orders({
  orders,
  vendors,
  products = [],
  canManage,
  today,
}: {
  orders: OrderRow[];
  vendors: { id: string; name: string }[];
  products?: OrderProductOption[];
  canManage: boolean;
  today: string;
}) {
  const vendorOptions = [
    ...new Map(
      [
        ...vendors,
        ...orders.map((order) => ({
          id: order.vendorId,
          name: order.vendorName,
        })),
      ].map((vendor) => [vendor.id, { value: vendor.id, label: vendor.name }]),
    ).values(),
  ];
  const [vendor, setVendor] = useState(() =>
    vendorOptions.map((option) => option.value),
  );
  const [status, setStatus] = useState(["PENDING", "RECEIVED"]);
  const [kind, setKind] = useState(["inventory", "private"]);
  const [year, setYear] = useState([today.slice(0, 4)]);
  const years = [
    ...new Set([
      today.slice(0, 4),
      ...orders.map((order) => String(order.year)),
    ]),
  ]
    .sort()
    .reverse();
  const filtered = orders
    .filter(
      (o) =>
        vendor.includes(o.vendorId) &&
        status.includes(o.status) &&
        kind.includes(o.isPrivate ? "private" : "inventory") &&
        year.includes(String(o.year)),
    )
    .sort(
      (a, b) =>
        (b.orderDate || "").localeCompare(a.orderDate || "") ||
        b.number - a.number ||
        a.vendorName.localeCompare(b.vendorName),
    );
  return (
    <>
      <div className="order-filters">
        <CheckboxFilter
          label="Vendor"
          options={vendorOptions}
          selected={vendor}
          onChange={setVendor}
          allLabel="All vendors"
        />
        <CheckboxFilter
          label="Year"
          options={years.map((value) => ({ value, label: value }))}
          selected={year}
          onChange={setYear}
          allLabel="All years"
        />
        <CheckboxFilter
          label="Status"
          options={[
            { value: "PENDING", label: "Submitted" },
            { value: "RECEIVED", label: "Received" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
          selected={status}
          onChange={setStatus}
          allLabel="All statuses"
        />
        <CheckboxFilter
          label="Order type"
          options={[
            { value: "inventory", label: "Inventory" },
            { value: "private", label: "Private" },
          ]}
          selected={kind}
          onChange={setKind}
          allLabel="All orders"
        />
      </div>
      {!filtered.length && <p>No orders match this view.</p>}
      {filtered.map((o) => (
        <OrderCard
          key={`${o.id}-${o.updatedAt}`}
          order={o}
          products={products}
          vendors={vendors}
          canManage={canManage}
          today={today}
        />
      ))}
    </>
  );
}
