"use client";

import { useState } from "react";
import { updateDeliveryAction } from "@/app/(protected)/deliveries/actions";

export type DeliveryHistoryRow = {
  id: string;
  deliveryDate: string;
  vendorId: string;
  vendorName: string;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  lines: Array<{ id: string; productName: string; entryQuantity: string; quantity: string; purchaseUnit: string | null; unitsPerPurchaseUnit: string | null; unit: string; active: boolean }>;
};

export function DeliveryHistory({ canEdit, deliveries, vendors }: { canEdit: boolean; deliveries: DeliveryHistoryRow[]; vendors: Array<{ id: string; name: string }> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const delivery = deliveries.find((item) => item.id === editingId);
  return <>{deliveries.length ? deliveries.map((item) => { const activeLines = item.lines.filter((line) => line.active); return <details className="delivery-card" key={item.id}><summary><strong>{new Date(`${item.deliveryDate}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} — {item.vendorName}</strong><span>{activeLines.length} product{activeLines.length === 1 ? "" : "s"}</span></summary><div className="delivery-card-meta"><p>Recorded by {item.recordedBy} on {new Date(item.recordedAt).toLocaleString("en-CA")}</p>{canEdit && <button className="admin-secondary compact-action" onClick={() => setEditingId(item.id)} type="button">Edit Delivery</button>}</div>{item.notes && <p>{item.notes}</p>}<ul>{activeLines.map((line) => <li key={line.id}><strong>{line.productName}</strong><span>{line.purchaseUnit && line.unitsPerPurchaseUnit ? `${line.entryQuantity} ${line.purchaseUnit.toLowerCase()} × ${line.unitsPerPurchaseUnit} = ` : ""}{line.quantity} {line.unit.toLowerCase()}</span></li>)}</ul></details>; }) : <p>No Deliveries have been recorded.</p>}{delivery && <DeliveryEditDialog delivery={delivery} onClose={() => setEditingId(null)} vendors={vendors}/>}</>;
}

function DeliveryEditDialog({ delivery, onClose, vendors }: { delivery: DeliveryHistoryRow; onClose(): void; vendors: Array<{ id: string; name: string }> }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(delivery.lines.map((line) => [line.id, line.active ? line.entryQuantity : "0"])));
  const items = delivery.lines.map((line) => ({ lineId: line.id, quantity: quantities[line.id] ?? "0" }));
  return <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="delivery-edit-title" aria-modal="true" className="product-dialog delivery-edit-dialog" role="dialog"><div className="product-dialog-heading"><div><h3 id="delivery-edit-title">Edit Delivery</h3><small>Inventory differences are recorded as correction movements.</small></div><button aria-label="Close delivery editor" className="dialog-close" onClick={onClose} type="button">×</button></div><form action={updateDeliveryAction} id="edit-delivery-form"><input name="deliveryId" type="hidden" value={delivery.id}/><input name="items" type="hidden" value={JSON.stringify(items)}/><div className="delivery-edit-meta"><label>Vendor<select defaultValue={delivery.vendorId} name="vendorId" required>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>Delivery date<input defaultValue={delivery.deliveryDate} name="deliveryDate" required type="date"/></label><label>Notes (optional)<input defaultValue={delivery.notes ?? ""} maxLength={1000} name="notes"/></label></div><div className="delivery-edit-lines"><div><span>Product</span><span>Quantity</span></div>{delivery.lines.map((line) => <label key={line.id}><span><strong>{line.productName}</strong><small>{line.purchaseUnit ?? line.unit}{line.unitsPerPurchaseUnit ? ` · ${line.unitsPerPurchaseUnit} ${line.unit} each` : ""}</small></span><input aria-label={`Delivered quantity for ${line.productName}`} min="0" onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })} step="any" type="number" value={quantities[line.id] ?? "0"}/></label>)}</div></form><div className="product-dialog-actions"><span className="delivery-edit-help">Set a quantity to 0 to remove that line.</span><div className="product-editor-actions"><button className="admin-secondary" onClick={onClose} type="button">Cancel</button><button className="admin-primary" form="edit-delivery-form" type="submit">Save Delivery</button></div></div></section></div>;
}
