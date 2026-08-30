"use client";

import { useMemo, useState } from "react";
import { createProductAction, setProductActiveAction, updateProductAction } from "@/app/(protected)/products/actions";
import { STOCK_UNITS, type ProductStockUnit } from "@/lib/product-management";

export type ProductRow = { id: string; name: string; categoryId: string; packageSize: string | null; stockUnit: ProductStockUnit; stockUnitLabel: string | null; allowFractionalStock: boolean; quantityScale: number; purchaseUnit: string | null; unitsPerPurchaseUnit: string | null; active: boolean; starterShackRequestEligible: boolean };
export type ProductCategoryRow = { id: string; name: string; displayOrder: number; active: boolean; products: ProductRow[] };

function ProductFields({ product, categories, defaultCategoryId }: { product?: ProductRow; categories: ProductCategoryRow[]; defaultCategoryId: string }) {
  const [allowFractionalStock, setAllowFractionalStock] = useState(product?.allowFractionalStock ?? false);
  const [quantityScale, setQuantityScale] = useState(product?.quantityScale ?? 0);
  return <div className="product-form-grid">
    {product && <input name="productId" type="hidden" value={product.id}/>}
    <label>Name<input defaultValue={product?.name ?? ""} maxLength={160} name="name" required/></label>
    <label>Category<select defaultValue={product?.categoryId ?? defaultCategoryId} name="categoryId">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
    <label>Counted as<select defaultValue={product?.stockUnit ?? "EACH"} name="stockUnit">{STOCK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
    <label>Other unit name<input defaultValue={product?.stockUnitLabel ?? ""} maxLength={80} name="stockUnitLabel" placeholder="Only needed for OTHER"/></label>
    <label>Decimal places for partial quantities<input max={6} min={allowFractionalStock ? 1 : 0} name="quantityScale" onChange={(event) => setQuantityScale(Number(event.target.value))} readOnly={!allowFractionalStock} required type="number" value={quantityScale}/><small>{allowFractionalStock ? "Use 1–6 decimal places for partial quantities." : "Whole units use 0 decimal places."}</small></label>
    <label>Package size<input defaultValue={product?.packageSize ?? ""} maxLength={120} name="packageSize" placeholder="e.g. 355 mL"/></label>
    <label>Purchased by<input defaultValue={product?.purchaseUnit ?? ""} maxLength={80} name="purchaseUnit" placeholder="e.g. CASE"/></label>
    <label>Units in one case/package<input defaultValue={product?.unitsPerPurchaseUnit ?? ""} min="0.001" name="unitsPerPurchaseUnit" step="0.001" type="number"/></label>
    <label className="product-check"><input checked={allowFractionalStock} name="allowFractionalStock" onChange={(event) => { const checked = event.target.checked; setAllowFractionalStock(checked); setQuantityScale(checked ? Math.max(1, quantityScale) : 0); }} type="checkbox"/><span>Allow partial quantities<small>Useful for Products counted by part of a keg or package.</small></span></label>
    <label className="product-check"><input defaultChecked={product?.starterShackRequestEligible ?? false} name="starterShackRequestEligible" type="checkbox"/><span>Available to Starter Shack<small>Allow Starter Shack staff to request this Product from the Bar.</small></span></label>
  </div>;
}

export function ProductCategoryTabs({ categories, canManageCatalog = false }: { categories: ProductCategoryRow[]; canManageCatalog?: boolean }) {
  const [selectedId, setSelectedId] = useState(categories.find((category) => category.active)?.id ?? categories[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = useMemo(() => categories.find((category) => category.id === selectedId) ?? categories[0], [categories, selectedId]);
  if (!selected) return <section className="empty-panel"><h2>No categories yet</h2><p>Create or import a Category in Admin before adding Products.</p></section>;
  return <section className="catalog-panel">
    <div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((category) => <button key={category.id} role="tab" aria-selected={selected.id === category.id} className={selected.id === category.id ? "active" : ""} onClick={() => { setSelectedId(category.id); setEditingId(null); setCreating(false); }}>{category.name}{!category.active && <small>Inactive</small>}</button>)}</div>
    <div className="table-toolbar"><div><h2>{selected.name}</h2><p>{selected.products.length} product{selected.products.length === 1 ? "" : "s"} · order {selected.displayOrder}</p></div><div className="product-toolbar-actions"><span className={`status-pill ${selected.active ? "" : "muted-pill"}`}>{selected.active ? "Active category" : "Inactive category"}</span>{canManageCatalog && <button className="admin-primary" onClick={() => setCreating((value) => !value)} type="button">{creating ? "Cancel" : "Add Product"}</button>}</div></div>
    {creating && <form action={createProductAction} className="product-editor"><h3>New Product</h3><ProductFields categories={categories} defaultCategoryId={selected.id}/><div className="product-editor-actions"><button className="admin-primary" type="submit">Create Product</button></div></form>}
    {selected.products.length === 0 ? <div className="empty-inline">No Products in this category.</div> : <div className="table-scroll"><table className="product-table product-admin-table"><thead><tr><th>Product</th><th>Starter Shack</th><th>Status</th>{canManageCatalog && <th>Actions</th>}</tr></thead><tbody>{selected.products.map((product) => <ProductTableRows key={product.id} product={product} categories={categories} canManageCatalog={canManageCatalog} editing={editingId === product.id} onEdit={() => setEditingId(editingId === product.id ? null : product.id)}/>)}</tbody></table></div>}
  </section>;
}

function ProductTableRows({ product, categories, canManageCatalog, editing, onEdit }: { product: ProductRow; categories: ProductCategoryRow[]; canManageCatalog: boolean; editing: boolean; onEdit(): void }) {
  const unitLabel = product.stockUnit === "OTHER" ? product.stockUnitLabel : product.stockUnit;
  const details = [unitLabel, product.packageSize, product.purchaseUnit && product.unitsPerPurchaseUnit ? `${product.unitsPerPurchaseUnit} per ${product.purchaseUnit}` : null, product.allowFractionalStock ? `${product.quantityScale} decimal places` : null].filter(Boolean).join(" · ");
  return <><tr className={product.active ? "" : "inactive-row"}>
    <td><strong>{product.name}</strong><small>{details}</small></td><td><span className={`availability-pill ${product.starterShackRequestEligible ? "available" : ""}`}>{product.starterShackRequestEligible ? "Available" : "Bar only"}</span></td><td><span className={`status-dot ${product.active ? "on" : ""}`}/>{product.active ? "Active" : "Inactive"}</td>
    {canManageCatalog && <td><div className="product-row-actions"><button className="admin-secondary" onClick={onEdit} type="button">{editing ? "Close" : "Edit"}</button><form action={setProductActiveAction} onSubmit={(event) => { if (product.active && !window.confirm(`Deactivate ${product.name}? Existing relationships and history will be preserved.`)) event.preventDefault(); }}><input name="productId" type="hidden" value={product.id}/><input name="active" type="hidden" value={product.active ? "false" : "true"}/><button className={product.active ? "admin-danger" : "admin-secondary"} type="submit">{product.active ? "Deactivate" : "Activate"}</button></form></div></td>}
  </tr>{editing && <tr className="product-edit-row"><td colSpan={4}><form action={updateProductAction} className="product-editor"><h3>Edit {product.name}</h3><ProductFields categories={categories} defaultCategoryId={product.categoryId} product={product}/><div className="product-editor-actions"><button className="admin-primary" type="submit">Save Product</button></div></form></td></tr>}</>;
}
