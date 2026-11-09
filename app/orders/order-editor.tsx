"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import type { OrderEditInput } from "@/lib/order-editor";
import { PRIVATE_ORDER_UNITS, receiptTotals } from "@/lib/purchase-order";
import { receivedQuantityScale } from "@/lib/quantity-policy";
import { saveOrderEditorAction } from "@/app/(protected)/orders/actions";

export type OrderProductOption = {
  id: string;
  name: string;
  vendorId: string | null;
  categoryName: string;
  unit: string;
  factor: string;
  quantityScale: number;
};
type EditLine = OrderEditInput["lines"][number] & {
  key: string;
  categoryName: string;
  quantityScale: number;
};
export function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}

export function OrderEditor({
  order,
  vendors,
  products,
  onClose,
}: {
  order: OrderRow;
  vendors: { id: string; name: string }[];
  products: OrderProductOption[];
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    router = useRouter();
  const [busy, start] = useTransition(),
    [error, setError] = useState("");
  const [vendorId, setVendorId] = useState(order.vendorId),
    [isPrivate, setPrivate] = useState(order.isPrivate);
  const [date, setDate] = useState(order.orderDate || ""),
    [receivedDate, setReceivedDate] = useState(order.receivedDate || "");
  const [number, setNumber] = useState(String(order.number)),
    [notes, setNotes] = useState(order.notes || "");
  const [taxIncluded, setTaxIncluded] = useState(order.taxIncluded),
    [gst, setGst] = useState(order.gst),
    [pst, setPst] = useState(order.pst);
  const [addId, setAddId] = useState("");
  const [lines, setLines] = useState<EditLine[]>(() =>
    order.lines.map((l) => {
      const factor = l.historyCaseSize || l.unitsPerEntry;
      const ratio = Number(l.unitsPerEntry) / Number(factor);
      return {
        key: l.id,
        id: l.id,
        productId: l.productId,
        name: l.productName,
        categoryName: l.categoryName,
        unit: l.historyCaseSize ? "Case" : l.unit,
        factor,
        ordered: String(Number(l.orderedQuantity) * ratio),
        received:
          l.receivedQuantity === null
            ? null
            : String(Number(l.receivedQuantity) * ratio),
        price:
          l.unitPrice === null
            ? null
            : (Number(l.unitPrice) / ratio).toFixed(2),
        quantityScale: l.quantityScale,
      };
    }),
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    return () => {
      if (typeof node.close === "function") node.close();
      previous?.focus();
    };
  }, []);
  const pending = order.status === "PENDING";
  const available = products.filter(
    (p) =>
      (order.historical || p.vendorId === vendorId) &&
      !lines.some((l) => l.productId === p.id),
  );
  const patch = (key: string, values: Partial<EditLine>) =>
    setLines((old) =>
      old.map((l) => (l.key === key ? { ...l, ...values } : l)),
    );
  const add = () => {
    const p = products.find((p) => p.id === addId);
    if (!isPrivate && !p) return;
    setLines((old) => [
      ...old,
      {
        key: crypto.randomUUID(),
        productId: isPrivate ? null : p!.id,
        name: isPrivate ? "" : p!.name,
        categoryName: isPrivate ? "Private" : p!.categoryName,
        unit: isPrivate ? "BOTTLE" : p!.unit,
        factor: isPrivate ? "1" : p!.factor,
        ordered: "1",
        received: pending ? null : "1",
        price: null,
        quantityScale: p?.quantityScale || 0,
      },
    ]);
    setAddId("");
  };
  let total: string | null = null;
  try {
    total = receiptTotals(
      lines.map((l) => ({
        quantity: pending ? l.ordered : l.received || "0",
        price: l.price,
      })),
      taxIncluded,
      gst || "0",
      pst || "0",
    ).total;
  } catch {}
  return (
    <dialog
      ref={dialog}
      className="order-edit-dialog"
      aria-labelledby="edit-order-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="product-dialog-heading">
        <h2 id="edit-order-title">Edit order</h2>
        <button
          type="button"
          className="dialog-close"
          aria-label="Close edit order"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            const result = await saveOrderEditorAction({
              id: order.id,
              updatedAt: order.updatedAt,
              vendorId,
              number: Number(number),
              year: order.year,
              date,
              receivedDate,
              notes,
              isPrivate,
              taxIncluded,
              gst,
              pst,
              lines: lines.map((l) => ({
                id: l.id,
                productId: l.productId,
                name: l.name,
                unit: l.unit,
                factor: l.factor,
                ordered: l.ordered,
                received: l.received,
                price: l.price,
              })),
            });
            if (!result.ok) setError(result.message);
            else {
              router.refresh();
              onClose();
            }
          });
        }}
      >
        <fieldset disabled={busy} className="order-editor-fields">
          <div className="order-editor-grid">
            <label className="order-field">
              Order number
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                required
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
            <label className="order-field">
              Order date
              <input
                type="date"
                required={!order.historical}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="order-field">
              Vendor
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {!pending && (
              <label className="order-field">
                Received date
                <input
                  type="date"
                  required={!order.historical}
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </label>
            )}
          </div>
          <label className="product-check">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setPrivate(e.target.checked)}
            />{" "}
            Private order
          </label>
          <div className="table-scroll">
            <table className="inventory-table order-edit-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Ordered</th>
                  {!pending && <th>Received</th>}
                  <th>Price / unit</th>
                  <th>
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      {isPrivate ? (
                        <input
                          aria-label={`Product name ${l.name || "new product"}`}
                          maxLength={160}
                          required
                          value={l.name}
                          onChange={(e) =>
                            patch(l.key, { name: e.target.value })
                          }
                        />
                      ) : (
                        <select
                          aria-label={`Product ${l.name}`}
                          value={l.productId || ""}
                          onChange={(e) => {
                            const p = products.find(
                              (p) => p.id === e.target.value,
                            );
                            if (p)
                              patch(l.key, {
                                productId: p.id,
                                name: p.name,
                                categoryName: p.categoryName,
                                unit: p.unit,
                                factor: p.factor,
                                quantityScale: p.quantityScale,
                              });
                          }}
                        >
                          {!l.productId && (
                            <option value="">
                              {l.name || "Select product"}
                            </option>
                          )}
                          {l.productId &&
                            !products.some(
                              (p) =>
                                p.id === l.productId &&
                                (order.historical || p.vendorId === vendorId),
                            ) && <option value={l.productId}>{l.name}</option>}
                          {products
                            .filter(
                              (p) =>
                                order.historical || p.vendorId === vendorId,
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} · {p.categoryName}
                              </option>
                            ))}
                        </select>
                      )}
                      {!isPrivate && order.historical && (
                        <input
                          className="order-snapshot-name"
                          aria-label={`Historical product name ${l.name}`}
                          maxLength={160}
                          required
                          value={l.name}
                          onChange={(e) =>
                            patch(l.key, { name: e.target.value })
                          }
                        />
                      )}
                    </td>
                    <td>
                      {isPrivate ? (
                        <select
                          aria-label={`Unit for ${l.name || "new product"}`}
                          value={l.unit}
                          onChange={(e) =>
                            patch(l.key, { unit: e.target.value, factor: "1" })
                          }
                        >
                          {!PRIVATE_ORDER_UNITS.some((u) => u === l.unit) && (
                            <option>{l.unit}</option>
                          )}
                          {PRIVATE_ORDER_UNITS.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      ) : (
                        l.unit
                      )}
                    </td>
                    <td>
                      <input
                        className="order-number"
                        aria-label={`Ordered ${l.name || "new product"}`}
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={l.ordered}
                        onChange={(e) =>
                          patch(l.key, { ordered: e.target.value })
                        }
                      />
                    </td>
                    {!pending && (
                      <td>
                        <input
                          className="order-number"
                          aria-label={`Received ${l.name || "new product"}`}
                          type="number"
                          min="0"
                          step={
                            receivedQuantityScale(
                              {
                                categoryName: l.categoryName,
                                unitsPerEntry: l.factor,
                                quantityScale: l.quantityScale,
                              },
                              isPrivate,
                            )
                              ? "0.01"
                              : "1"
                          }
                          required
                          value={l.received || "0"}
                          onChange={(e) =>
                            patch(l.key, { received: e.target.value })
                          }
                        />
                      </td>
                    )}
                    <td>
                      <input
                        className="order-number"
                        aria-label={`Price for ${l.name || "new product"}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.price || ""}
                        onChange={(e) =>
                          patch(l.key, { price: e.target.value || null })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary private-product-trash"
                        aria-label={`Remove ${l.name || "new product"}`}
                        onClick={() =>
                          setLines((old) => old.filter((x) => x.key !== l.key))
                        }
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="order-add-line">
            {!isPrivate && (
              <select
                aria-label="Add product"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">Select product to add</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.categoryName}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={!isPrivate && !addId}
              onClick={add}
            >
              {isPrivate ? "Add private product" : "Add product"}
            </button>
          </div>
          <label className="order-field order-comments">
            Comments
            <textarea
              rows={3}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
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
            <p>
              Grand total{" "}
              <strong>{total === null ? "Unavailable" : `$${total}`}</strong>
            </p>
          </div>
          <p className="order-muted">
            {order.historical
              ? "Historical edits update order history only."
              : pending
                ? "Inventory updates when this order is received."
                : "Changes to received inventory products adjust Bar stock by the difference."}
          </p>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="order-editor-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !lines.length}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
