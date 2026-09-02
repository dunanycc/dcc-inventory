"use client";

import { useState } from "react";
import {
  updateDeliveryAction,
  voidDeliveryAction,
} from "@/app/(protected)/deliveries/actions";
import type { DeliveryCategory } from "@/app/deliveries/delivery-client";

export type DeliveryHistoryRow = {
  id: string;
  deliveryDate: string;
  vendorId: string;
  vendorName: string;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidComment: string | null;
  lines: Array<{
    id: string;
    productId: string;
    productName: string;
    entryQuantity: string;
    quantity: string;
    purchaseUnit: string | null;
    unitsPerPurchaseUnit: string | null;
    unit: string;
    active: boolean;
  }>;
};

export function DeliveryHistory({
  canEdit,
  categories,
  deliveries,
  vendors,
}: {
  canEdit: boolean;
  categories: DeliveryCategory[];
  deliveries: DeliveryHistoryRow[];
  vendors: Array<{ id: string; name: string }>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const delivery = deliveries.find((item) => item.id === editingId);
  const voiding = deliveries.find((item) => item.id === voidingId);
  return (
    <>
      {deliveries.length ? (
        deliveries.map((item) => {
          const isVoided = Boolean(item.voidedAt);
          const displayLines = isVoided
            ? item.lines
            : item.lines.filter((line) => line.active);
          const isViewing = viewingId === item.id;
          return (
            <div
              className={`delivery-card ${isVoided ? "voided-delivery" : ""}`}
              key={item.id}
            >
              <div className="delivery-card-meta">
                <div>
                  <strong>
                    {new Date(
                      `${item.deliveryDate}T12:00:00`,
                    ).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    — {item.vendorName}
                  </strong>
                  <span>
                    {displayLines.length} product
                    {displayLines.length === 1 ? "" : "s"}
                    {isVoided && (
                      <span className="delivery-status">VOIDED</span>
                    )}
                  </span>
                </div>
                <div className="delivery-card-actions">
                  <button
                    className="btn-secondary compact-action"
                    onClick={() => setViewingId(isViewing ? null : item.id)}
                    type="button"
                  >
                    {isViewing ? "Hide" : "View"}
                  </button>
                  {canEdit && !isVoided && (
                    <button
                      className="btn-secondary compact-action"
                      onClick={() => setEditingId(item.id)}
                      type="button"
                    >
                      Edit
                    </button>
                  )}
                  {canEdit && !isVoided && (
                    <button
                      className="btn-danger compact-action"
                      onClick={() => setVoidingId(item.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {isViewing && (
                <>
                  <p>
                    Recorded by {item.recordedBy} on{" "}
                    {new Date(item.recordedAt).toLocaleString("en-CA")}
                  </p>
                  {item.notes && <p>{item.notes}</p>}
                  <ul>
                    {displayLines.map((line) => (
                      <li key={line.id}>
                        <strong>{line.productName}</strong>
                        <span>
                          {line.purchaseUnit && line.unitsPerPurchaseUnit
                            ? `${line.entryQuantity} ${line.purchaseUnit.toLowerCase()} × ${line.unitsPerPurchaseUnit} = `
                            : ""}
                          {line.quantity} {line.unit.toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isVoided && (
                    <p className="delivery-void-comment">
                      Deleted by {item.voidedBy} on{" "}
                      {new Date(item.voidedAt!).toLocaleString("en-CA")}:{" "}
                      {item.voidComment}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })
      ) : (
        <p>No Deliveries have been recorded.</p>
      )}
      {delivery && (
        <DeliveryEditDialog
          categories={categories}
          delivery={delivery}
          onClose={() => setEditingId(null)}
          vendors={vendors}
        />
      )}
      {voiding && (
        <DeliveryVoidDialog
          deliveryId={voiding.id}
          onClose={() => setVoidingId(null)}
        />
      )}
    </>
  );
}

function DeliveryVoidDialog({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose(): void;
}) {
  return (
    <div
      className="request-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="delivery-void-title"
        aria-modal="true"
        className="request-confirm-dialog request-closure-dialog"
        role="dialog"
      >
        <header>
          <div>
            <h2 id="delivery-void-title">Delete Delivery</h2>
            <p>
              Every product in this delivery will be reversed out of Bar
              inventory as a correction. The delivery stays on record for audit
              history but will be marked deleted.
            </p>
          </div>
          <button
            aria-label="Close confirmation dialog"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form action={voidDeliveryAction}>
          <input name="deliveryId" type="hidden" value={deliveryId} />
          <div className="request-closure-dialog-body">
            <label>
              Comment
              <textarea
                aria-label="Deletion comment"
                autoFocus
                maxLength={1000}
                name="voidComment"
                placeholder="Enter the reason for deleting this delivery"
                required
                rows={3}
              />
            </label>
          </div>
          <footer>
            <button className="btn-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="btn-danger" type="submit">
              Confirm Delete
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function DeliveryEditDialog({
  categories,
  delivery,
  onClose,
  vendors,
}: {
  categories: DeliveryCategory[];
  delivery: DeliveryHistoryRow;
  onClose(): void;
  vendors: Array<{ id: string; name: string }>;
}) {
  const existingByProduct = new Map(
    delivery.lines.map((line) => [line.productId, line]),
  );
  const orphanLines = delivery.lines.filter(
    (line) =>
      !categories.some((category) =>
        category.products.some((product) => product.id === line.productId),
      ),
  );
  const editorCategories: DeliveryCategory[] = orphanLines.length
    ? [
        ...categories,
        {
          id: "__other__",
          name: "Other",
          products: orphanLines.map((line) => ({
            id: line.productId,
            name: line.productName,
            stockUnit: line.unit,
            quantityScale: 0,
            purchaseUnit: line.purchaseUnit,
            unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
          })),
        },
      ]
    : categories;
  const editorProducts = editorCategories.flatMap(
    (category) => category.products,
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      editorProducts.map((product) => {
        const line = existingByProduct.get(product.id);
        return [product.id, line?.active ? line.entryQuantity : "0"];
      }),
    ),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => {
    const withExisting = editorCategories.find((category) =>
      category.products.some((product) => {
        const line = existingByProduct.get(product.id);
        return line?.active && Number(line.entryQuantity) > 0;
      }),
    );
    return (withExisting ?? editorCategories[0])?.id ?? "";
  });
  const selectedCategory =
    editorCategories.find((category) => category.id === selectedCategoryId) ??
    editorCategories[0];
  const items = editorProducts.map((product) => ({
    productId: product.id,
    quantity: quantities[product.id] ?? "0",
  }));
  return (
    <div
      className="product-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="delivery-edit-title"
        aria-modal="true"
        className="product-dialog delivery-edit-dialog"
        role="dialog"
      >
        <div className="product-dialog-heading">
          <div>
            <h3 id="delivery-edit-title">Edit Delivery</h3>
            <small>
              Add, change, or remove products. Inventory differences are
              recorded as correction movements.
            </small>
          </div>
          <button
            aria-label="Close delivery editor"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form action={updateDeliveryAction} id="edit-delivery-form">
          <input name="deliveryId" type="hidden" value={delivery.id} />
          <input name="items" type="hidden" value={JSON.stringify(items)} />
          <div className="delivery-edit-meta">
            <label>
              Vendor
              <select defaultValue={delivery.vendorId} name="vendorId" required>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delivery date
              <input
                defaultValue={delivery.deliveryDate}
                name="deliveryDate"
                required
                type="date"
              />
            </label>
            <label>
              Notes (optional)
              <input
                defaultValue={delivery.notes ?? ""}
                maxLength={1000}
                name="notes"
              />
            </label>
          </div>
          <div className="delivery-edit-catalog">
            <div
              aria-label="Product categories"
              className="category-tabs"
              role="tablist"
            >
              {editorCategories.map((category) => (
                <button
                  aria-selected={selectedCategoryId === category.id}
                  className={selectedCategoryId === category.id ? "active" : ""}
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  role="tab"
                  type="button"
                >
                  {category.name}
                  <span aria-hidden="true" className="category-count">
                    {category.products.length}
                  </span>
                </button>
              ))}
            </div>
            <div className="delivery-edit-lines">
              <div>
                <span>Product</span>
                <span>Quantity</span>
              </div>
              {selectedCategory?.products.map((product) => (
                <label
                  className={
                    Number(quantities[product.id] ?? "0") > 0
                      ? "has-quantity"
                      : ""
                  }
                  key={product.id}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.purchaseUnit ?? product.stockUnit}
                      {product.unitsPerPurchaseUnit
                        ? ` · ${product.unitsPerPurchaseUnit} ${product.stockUnit} each`
                        : ""}
                    </small>
                  </span>
                  <input
                    aria-label={`Delivered quantity for ${product.name}`}
                    min="0"
                    onChange={(event) =>
                      setQuantities({
                        ...quantities,
                        [product.id]: event.target.value,
                      })
                    }
                    step="any"
                    type="number"
                    value={quantities[product.id] ?? "0"}
                  />
                </label>
              ))}
            </div>
          </div>
        </form>
        <div className="product-dialog-actions">
          <span className="delivery-edit-help">
            Enter a quantity to add a Product, or set it to 0 to remove it.
          </span>
          <div className="product-editor-actions">
            <button
              className="btn-secondary compact-action"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn-primary compact-action"
              form="edit-delivery-form"
              type="submit"
            >
              Save Delivery
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
