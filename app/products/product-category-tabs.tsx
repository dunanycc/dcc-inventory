"use client";

import { useState, useTransition, type DragEvent } from "react";
import { addProductNoteAction, createProductAction, deleteProductNoteAction, reorderProductsAction, setProductActiveAction, updateProductAction } from "@/app/(protected)/products/actions";
import { STOCK_UNITS, type ProductStockUnit } from "@/lib/product-management";

export type ProductRow = { id: string; name: string; categoryId: string; displayOrder?: number; packageSize: string | null; stockUnit: ProductStockUnit; stockUnitLabel: string | null; allowFractionalStock: boolean; quantityScale: number; purchaseUnit: string | null; unitsPerPurchaseUnit: string | null; active: boolean; starterShackRequestEligible: boolean; notes?: Array<{ id: string; body: string; createdAt: string; author: string }> };
export type ProductCategoryRow = { id: string; name: string; displayOrder: number; active: boolean; products: ProductRow[] };

function ProductFields({ product, categories, defaultCategoryId }: { product?: ProductRow; categories: ProductCategoryRow[]; defaultCategoryId: string }) {
  const initialCategoryId = product?.categoryId ?? defaultCategoryId;
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [allowFractionalStock, setAllowFractionalStock] = useState(product?.allowFractionalStock ?? false);
  const initialPurchaseUnit = product?.purchaseUnit && ["CASE", "BOTTLE", "BOX", "OTHER"].includes(product.purchaseUnit.toUpperCase()) ? product.purchaseUnit.toUpperCase() : product?.purchaseUnit ? "OTHER" : "";
  const [purchaseUnit, setPurchaseUnit] = useState(initialPurchaseUnit);
  const isHardLiquor = categories.find((category) => category.id === categoryId)?.name.trim().toLowerCase() === "hard liquor";
  return <div className="product-form-grid">
    {product && <input name="productId" type="hidden" value={product.id}/>}
    <label>Name<input defaultValue={product?.name ?? ""} maxLength={160} name="name" required/></label>
    <label>Category<select name="categoryId" onChange={(event) => { setCategoryId(event.target.value); if (categories.find((category) => category.id === event.target.value)?.name.trim().toLowerCase() !== "hard liquor") setAllowFractionalStock(false); }} value={categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
    <label>Counted as<select defaultValue={product?.stockUnit ?? "EACH"} name="stockUnit">{STOCK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
    <label>Other unit name<input defaultValue={product?.stockUnitLabel ?? ""} maxLength={80} name="stockUnitLabel" placeholder="Only needed for OTHER"/></label>
    <label>Package size<input defaultValue={product?.packageSize ?? ""} maxLength={120} name="packageSize" placeholder="e.g. 355 mL"/></label>
    <label>Purchased by<select name="purchaseUnit" onChange={(event) => setPurchaseUnit(event.target.value)} value={purchaseUnit}><option value="">Not specified</option><option value="CASE">CASE</option><option value="BOTTLE">BOTTLE</option><option value="BOX">BOX</option><option value="OTHER">OTHER</option></select></label>
    <label>Units in one case/package<input defaultValue={product?.unitsPerPurchaseUnit ?? ""} disabled={!purchaseUnit} min="0.001" name="unitsPerPurchaseUnit" required={Boolean(purchaseUnit)} step="0.001" type="number"/><small>{purchaseUnit ? "Required when Purchased by is selected." : "Select Purchased by to enter a conversion."}</small></label>
    <input name="quantityScale" type="hidden" value={isHardLiquor && allowFractionalStock ? 2 : 0}/>
    <div className="product-form-options">{isHardLiquor && <label className="product-check"><input checked={allowFractionalStock} name="allowFractionalStock" onChange={(event) => setAllowFractionalStock(event.target.checked)} type="checkbox"/><span>Allow partial quantities<small>Hard Liquor partial quantities use 2 decimal places.</small></span></label>}<label className="product-check"><input defaultChecked={product?.starterShackRequestEligible ?? false} name="starterShackRequestEligible" type="checkbox"/><span>Available to Starter Shack<small>Allow Starter Shack staff to request this Product from the Bar.</small></span></label></div>
  </div>;
}

export function ProductCategoryTabs({ categories, canManageCatalog = false, initialCategoryId }: { categories: ProductCategoryRow[]; canManageCatalog?: boolean; initialCategoryId?: string }) {
  const visibleCategories = categories.filter((category) => category.active);
  const [selectedId, setSelectedId] = useState(visibleCategories.find((category) => category.id === initialCategoryId)?.id ?? visibleCategories[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [productOrders, setProductOrders] = useState<Record<string, ProductRow[]>>(() => Object.fromEntries(categories.map((category) => [category.id, category.products])));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [isSavingOrder, startSavingOrder] = useTransition();
  const selected = visibleCategories.find((category) => category.id === selectedId) ?? visibleCategories[0];
  const selectedProducts = selected ? productOrders[selected.id] ?? selected.products : [];
  function saveOrder(products: ProductRow[]) {
    if (!selected) return;
    setProductOrders((current) => ({ ...current, [selected.id]: products }));
    setOrderMessage("Saving order…");
    const formData = new FormData();
    formData.set("categoryId", selected.id);
    formData.set("productIds", JSON.stringify(products.map((product) => product.id)));
    startSavingOrder(async () => {
      const result = await reorderProductsAction(formData);
      if (!result.ok) setProductOrders((current) => ({ ...current, [selected.id]: selectedProducts }));
      setOrderMessage(result.message);
    });
  }
  function moveProduct(productId: string, targetId: string) {
    if (productId === targetId) return;
    const next = [...selectedProducts];
    const from = next.findIndex((product) => product.id === productId);
    const to = next.findIndex((product) => product.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  }
  function moveProductBy(productId: string, offset: number) {
    const index = selectedProducts.findIndex((product) => product.id === productId);
    const target = selectedProducts[index + offset];
    if (target) moveProduct(productId, target.id);
  }
  if (!selected) return <section className="empty-panel"><h2>No categories yet</h2><p>Create or import a Category in Admin before adding Products.</p></section>;
  return <section className="catalog-panel">
    <div className="category-tabs" role="tablist" aria-label="Product categories">{visibleCategories.map((category) => <button key={category.id} role="tab" aria-selected={selected.id === category.id} className={selected.id === category.id ? "active" : ""} onClick={() => { setSelectedId(category.id); setEditingId(null); setCreating(false); }}>{category.name}<span aria-hidden="true" className="category-count">{category.products.length}</span></button>)}</div>
    <div className="table-toolbar"><div><h2>{selected.name}</h2>{canManageCatalog && <small aria-live="polite" className="product-order-status">{isSavingOrder ? "Saving order…" : orderMessage}</small>}</div><div className="product-toolbar-actions"><span className={`status-pill ${selected.active ? "" : "muted-pill"}`}>{selected.active ? "Active category" : "Inactive category"}</span>{canManageCatalog && <button className="admin-primary" onClick={() => setCreating((value) => !value)} type="button">{creating ? "Cancel" : "Add Product"}</button>}</div></div>
    {creating && <form action={createProductAction} className="product-editor"><h3>New Product</h3><ProductFields categories={visibleCategories} defaultCategoryId={selected.id}/><div className="product-editor-actions"><button className="admin-primary" type="submit">Create Product</button></div></form>}
    {selectedProducts.length === 0 ? <div className="empty-inline">No Products in this category.</div> : <div className="table-scroll"><table className="product-table product-admin-table"><thead><tr>{canManageCatalog && <th className="reorder-column"><span className="sr-only">Order</span></th>}<th>Product</th><th>Starter Shack</th><th>Status</th>{canManageCatalog && <th>Actions</th>}</tr></thead><tbody>{selectedProducts.map((product) => <ProductTableRow dragging={draggingId === product.id} key={product.id} product={product} canManageCatalog={canManageCatalog} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) moveProduct(draggingId, product.id); setDraggingId(null); }} onEdit={() => setEditingId(product.id)} onMove={(offset) => moveProductBy(product.id, offset)} onNotes={() => setNotesId(product.id)} onDragStart={() => setDraggingId(product.id)}/>)}</tbody></table></div>}
    {editingId && <ProductEditDialog categories={visibleCategories} product={selectedProducts.find((product) => product.id === editingId)} onClose={() => setEditingId(null)}/>}
    {notesId && <ProductNotesDialog product={selectedProducts.find((product) => product.id === notesId)} onClose={() => setNotesId(null)}/>}
  </section>;
}

function ProductTableRow({ product, canManageCatalog, dragging, onDragEnd, onDragOver, onDragStart, onDrop, onEdit, onMove, onNotes }: { product: ProductRow; canManageCatalog: boolean; dragging: boolean; onDragEnd(): void; onDragOver(event: DragEvent): void; onDragStart(): void; onDrop(): void; onEdit(): void; onMove(offset: number): void; onNotes(): void }) {
  const unitLabel = product.stockUnit === "OTHER" ? product.stockUnitLabel : product.stockUnit;
  const details = [unitLabel, product.packageSize, product.purchaseUnit && product.unitsPerPurchaseUnit ? `${product.unitsPerPurchaseUnit} per ${product.purchaseUnit}` : null, product.allowFractionalStock ? `${product.quantityScale} decimal places` : null].filter(Boolean).join(" · ");
  return <tr className={`${product.active ? "" : "inactive-row"} ${dragging ? "dragging-row" : ""}`} onDragOver={onDragOver} onDrop={onDrop}>
    {canManageCatalog && <td className="reorder-column"><button aria-label={`Reorder ${product.name}. Use arrow keys or drag.`} className="drag-handle" draggable onDragEnd={onDragEnd} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1); } }} title="Drag to reorder"><svg aria-hidden="true" viewBox="0 0 18 18"><path d="M4 5h10M4 9h10M4 13h10"/></svg></button></td>}
    <td><strong>{product.name}</strong>{details && <span className="product-inline-details">{details}</span>}</td><td>{product.starterShackRequestEligible ? <span className="availability-pill available">Available</span> : null}</td><td><span className={`status-dot ${product.active ? "on" : ""}`}/>{product.active ? "Active" : "Inactive"}</td>
    {canManageCatalog && <td><div className="product-row-actions"><button className="admin-secondary compact-action" onClick={onEdit} type="button">Edit</button><button className={`admin-secondary compact-action notes-button ${product.notes?.length ? "has-notes" : ""}`} onClick={onNotes} type="button">Notes{product.notes?.length ? ` (${product.notes.length})` : ""}</button></div></td>}
  </tr>;
}

function ProductNotesDialog({ product, onClose }: { product?: ProductRow; onClose(): void }) {
  if (!product) return null;
  const notes = product.notes ?? [];
  return <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="product-notes-title" aria-modal="true" className="product-dialog product-notes-dialog" role="dialog">
      <div className="product-dialog-heading"><div><h3 id="product-notes-title">Notes for {product.name}</h3><small>Newest first</small></div><button aria-label="Close notes dialog" className="dialog-close" onClick={onClose} type="button">×</button></div>
      <form action={addProductNoteAction} className="add-note-form"><input name="productId" type="hidden" value={product.id}/><input name="categoryId" type="hidden" value={product.categoryId}/><label>Add note<textarea maxLength={2000} name="body" placeholder="Enter a note about this product" required rows={3}/></label><button className="admin-primary" type="submit">Add Note</button></form>
      <div className="product-note-list">{notes.length === 0 ? <p className="empty-note-list">No notes yet.</p> : notes.map((note) => <article className="product-note" key={note.id}><div><strong>{note.author}</strong><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time></div><p>{note.body}</p><form action={deleteProductNoteAction} onSubmit={(event) => { if (!window.confirm("Delete this note?")) event.preventDefault(); }}><input name="noteId" type="hidden" value={note.id}/><input name="categoryId" type="hidden" value={product.categoryId}/><button aria-label={`Delete note from ${note.author}`} className="note-delete" title="Delete note" type="submit"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg></button></form></article>)}</div>
    </section>
  </div>;
}

function ProductEditDialog({ product, categories, onClose }: { product?: ProductRow; categories: ProductCategoryRow[]; onClose(): void }) {
  if (!product) return null;
  return <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="product-dialog-title" aria-modal="true" className="product-dialog" role="dialog">
      <div className="product-dialog-heading"><h3 id="product-dialog-title">Edit {product.name}</h3><button aria-label="Close edit dialog" className="dialog-close" onClick={onClose} type="button">×</button></div>
      <form action={updateProductAction} id="edit-product-form"><ProductFields categories={categories} defaultCategoryId={product.categoryId} product={product}/></form>
      <div className="product-dialog-actions"><form action={setProductActiveAction} onSubmit={(event) => { if (product.active && !window.confirm(`Hide ${product.name}? Existing relationships and history will be preserved.`)) event.preventDefault(); }}><input name="productId" type="hidden" value={product.id}/><input name="categoryId" type="hidden" value={product.categoryId}/><input name="active" type="hidden" value={product.active ? "false" : "true"}/><button className={product.active ? "admin-danger" : "admin-secondary"} type="submit">{product.active ? "Hide" : "Unhide"}</button></form><div className="product-editor-actions"><button className="admin-secondary" onClick={onClose} type="button">Cancel</button><button className="admin-primary" form="edit-product-form" type="submit">Save Product</button></div></div>
    </section>
  </div>;
}
