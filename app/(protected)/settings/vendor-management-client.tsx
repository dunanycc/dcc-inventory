"use client";

import { useState, useTransition, type DragEvent } from "react";
import {
  createVendorAction,
  deleteVendorAction,
  reorderVendorsAction,
  setVendorActiveAction,
  updateVendorAction,
} from "./vendor-actions";

export type VendorRow = {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  notes: string | null;
  deliveryCount: number;
};

export function VendorManagementClient({ vendors }: { vendors: VendorRow[] }) {
  const [orderedVendors, setOrderedVendors] = useState(vendors);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, startSaving] = useTransition();
  const editing = orderedVendors.find((vendor) => vendor.id === editingId);
  function saveOrder(next: VendorRow[]) {
    const previous = orderedVendors;
    setOrderedVendors(next);
    setMessage("Saving order…");
    const formData = new FormData();
    formData.set("vendorIds", JSON.stringify(next.map((vendor) => vendor.id)));
    startSaving(async () => {
      const result = await reorderVendorsAction(formData);
      if (!result.ok) setOrderedVendors(previous);
      setMessage(result.message);
    });
  }
  function moveVendor(vendorId: string, targetId: string) {
    if (vendorId === targetId) return;
    const next = [...orderedVendors];
    const from = next.findIndex((vendor) => vendor.id === vendorId);
    const to = next.findIndex((vendor) => vendor.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  }
  function moveVendorBy(vendorId: string, offset: number) {
    const index = orderedVendors.findIndex((vendor) => vendor.id === vendorId);
    const target = orderedVendors[index + offset];
    if (target) moveVendor(vendorId, target.id);
  }
  return (
    <section className="admin-panel vendor-panel">
      <div className="category-admin-heading vendor-admin-heading">
        <div>
          <p className="eyebrow">Deliveries</p>
          <h2>Vendors</h2>
          <p>
            Drag Vendors into the order used when recording delivered stock.
          </p>
          <small aria-live="polite" className="category-order-status">
            {isSaving ? "Saving order…" : message}
          </small>
        </div>
        <form action={createVendorAction} className="vendor-create-form">
          <label>
            Name
            <input maxLength={120} name="name" required />
          </label>
          <label>
            Notes (optional)
            <input maxLength={1000} name="notes" />
          </label>
          <button className="btn-primary">Add Vendor</button>
        </form>
      </div>
      <div className="table-scroll">
        <table className="category-admin-table vendor-admin-table">
          <thead>
            <tr>
              <th className="category-reorder-column">
                <span className="sr-only">Order</span>
              </th>
              <th>Vendor</th>
              <th>Notes</th>
              <th>Deliveries</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedVendors.map((vendor) => (
              <tr
                className={draggingId === vendor.id ? "dragging-row" : ""}
                key={vendor.id}
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDrop={() => {
                  if (draggingId) moveVendor(draggingId, vendor.id);
                  setDraggingId(null);
                }}
              >
                <td className="category-reorder-column">
                  <button
                    aria-label={`Reorder ${vendor.name}. Use arrow keys or drag.`}
                    className="drag-handle"
                    draggable
                    onDragEnd={() => setDraggingId(null)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingId(vendor.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowUp" ||
                        event.key === "ArrowDown"
                      ) {
                        event.preventDefault();
                        moveVendorBy(
                          vendor.id,
                          event.key === "ArrowUp" ? -1 : 1,
                        );
                      }
                    }}
                    title="Drag to reorder"
                  >
                    <svg aria-hidden="true" viewBox="0 0 18 18">
                      <path d="M4 5h10M4 9h10M4 13h10" />
                    </svg>
                  </button>
                </td>
                <td>
                  <strong>{vendor.name}</strong>
                  {!vendor.active && <small>Hidden</small>}
                </td>
                <td>{vendor.notes || "—"}</td>
                <td>{vendor.deliveryCount}</td>
                <td>
                  <div className="vendor-row-actions">
                    <button
                      className="btn-secondary compact-action"
                      onClick={() => setEditingId(vendor.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    {vendor.deliveryCount === 0 && (
                      <form
                        action={deleteVendorAction}
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `Delete ${vendor.name}? This cannot be undone.`,
                            )
                          )
                            event.preventDefault();
                        }}
                      >
                        <input
                          name="vendorId"
                          type="hidden"
                          value={vendor.id}
                        />
                        <button
                          className="btn-danger compact-action"
                          type="submit"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                    <form action={setVendorActiveAction}>
                      <input name="vendorId" type="hidden" value={vendor.id} />
                      <input
                        name="active"
                        type="hidden"
                        value={String(!vendor.active)}
                      />
                      <button
                        className={
                          vendor.active
                            ? "btn-danger compact-action"
                            : "btn-secondary compact-action"
                        }
                      >
                        {vendor.active ? "Hide" : "Unhide"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div
          className="product-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingId(null);
          }}
        >
          <section
            aria-labelledby="vendor-edit-title"
            aria-modal="true"
            className="product-dialog vendor-edit-dialog"
            role="dialog"
          >
            <div className="product-dialog-heading">
              <h3 id="vendor-edit-title">Edit {editing.name}</h3>
              <button
                aria-label="Close vendor editor"
                className="dialog-close"
                onClick={() => setEditingId(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form action={updateVendorAction} id="edit-vendor-form">
              <input name="vendorId" type="hidden" value={editing.id} />
              <div className="vendor-edit-fields">
                <label>
                  Name
                  <input
                    defaultValue={editing.name}
                    maxLength={120}
                    name="name"
                    required
                  />
                </label>
                <label>
                  Notes (optional)
                  <textarea
                    defaultValue={editing.notes ?? ""}
                    maxLength={1000}
                    name="notes"
                    rows={4}
                  />
                </label>
              </div>
            </form>
            <div className="product-dialog-actions">
              <span />
              <div className="product-editor-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setEditingId(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  form="edit-vendor-form"
                  type="submit"
                >
                  Save Vendor
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
