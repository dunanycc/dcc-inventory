"use client";

import { useMemo, useState } from "react";
import { createProductAction, setProductActiveAction, updateProductAction } from "@/app/(protected)/products/actions";
import { STOCK_UNITS, type ProductStockUnit } from "@/lib/product-management";

export type ProductRow = { id: string; name: string; categoryId: string; packageSize: string | null; stockUnit: ProductStockUnit; stockUnitLabel: string | null; allowFractionalStock: boolean; quantityScale: number; purchaseUnit: string | null; unitsPerPurchaseUnit: string | null; active: boolean; starterShackRequestEligible: boolean };
export type ProductCategoryRow = { id: string; name: string; displayOrder: number; active: boolean; products: ProductRow[] };

function ProductFields({ product, categories, defaultCategoryId }: { product?: ProductRow; categories: ProductCategoryRow[]; defaultCategoryId: string }) {
  const initialCategoryId = product?.categoryId ?? defaultCategoryId;
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [allowFractionalStock, setAllowFractionalStock] = useState(product?.allowFractionalStock ?? false);
  const isHardLiquor = categories.find((category) => category.id === categoryId)?.name.trim().toLowerCase() === "hard liquor";
  return <div className="product-form-grid">
    {product && <input name="productId" type="hidden" value={product.id}/>}
    <label>Name<input defaultValue={product?.name ?? ""} maxLength={160} name="name" required/></label>
    <label>Category<select name="categoryId" onChange={(event) => { setCategoryId(event.target.value); if (categories.find((category) => category.id === event.target.value)?.name.trim().toLowerCase() !== "hard liquor") setAllowFractionalStock(false); }} value={categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
    <label>Counted as<select defaultValue={product?.stockUnit ?? "EACH"} name="stockUnit">{STOCK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
    <label>Other unit name<input defaultValue={product?.stockUnitLabel ?? ""} maxLength={80} name="stockUnitLabel" placeholder="Only needed for OTHER"/></label>
    <label>Package size<input defaultValue={product?.packageSize ?? ""} maxLength={120} name="packageSize" placeholder="e.g. 355 mL"/></label>
    <label>Purchased by<input defaultValue={product?.purchaseUnit ?? ""} maxLength={80} name="purchaseUnit" placeholder="e.g. CASE"/></label>
    <label>Units in one case/package<input defaultValue={product?.unitsPerPurchaseUnit ?? ""} min="0.001" name="unitsPerPurchaseUnit" step="0.001" type="number"/></label>
    <input name="quantityScale" type="hidden" value={isHardLiquor && allowFractionalStock ? 2 : 0}/>
    <div className="product-form-options">{isHardLiquor && <label className="product-check"><input checked={allowFractionalStock} name="allowFractionalStock" onChange={(event) => setAllowFractionalStock(event.target.checked)} type="checkbox"/><span>Allow partial quantities<small>Hard Liquor partial quantities use 2 decimal places.</small></span></label>}<label className="product-check"><input defaultChecked={product?.starterShackRequestEligible ?? false} name="starterShackRequestEligible" type="checkbox"/><span>Available to Starter Shack<small>Allow Starter Shack staff to request this Product from the Bar.</small></span></label></div>
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
    {selected.products.length === 0 ? <div className="empty-inline">No Products in this category.</div> : <div className="table-scroll"><table className="product-table product-admin-table"><thead><tr><th>Product</th><th>Starter Shack</th><th>Status</th>{canManageCatalog && <th>Actions</th>}</tr></thead><tbody>{selected.products.map((product) => <ProductTableRow key={product.id} product={product} canManageCatalog={canManageCatalog} onEdit={() => setEditingId(product.id)}/>)}</tbody></table></div>}
    {editingId && <ProductEditDialog categories={categories} product={selected.products.find((product) => product.id === editingId)} onClose={() => setEditingId(null)}/>}
  </section>;
}

function ProductTableRow({ product, canManageCatalog, onEdit }: { product: ProductRow; canManageCatalog: boolean; onEdit(): void }) {
  const unitLabel = product.stockUnit === "OTHER" ? product.stockUnitLabel : product.stockUnit;
  const details = [unitLabel, product.packageSize, product.purchaseUnit && product.unitsPerPurchaseUnit ? `${product.unitsPerPurchaseUnit} per ${product.purchaseUnit}` : null, product.allowFractionalStock ? `${product.quantityScale} decimal places` : null].filter(Boolean).join(" · ");
  return <tr className={product.active ? "" : "inactive-row"}>
    <td><strong>{product.name}</strong>{details && <span className="product-inline-details">{details}</span>}</td><td>{product.starterShackRequestEligible ? <span className="availability-pill available">Available</span> : null}</td><td><span className={`status-dot ${product.active ? "on" : ""}`}/>{product.active ? "Active" : "Inactive"}</td>
    {canManageCatalog && <td><button className="admin-secondary" onClick={onEdit} type="button">Edit</button></td>}
  </tr>;
}

function ProductEditDialog({ product, categories, onClose }: { product?: ProductRow; categories: ProductCategoryRow[]; onClose(): void }) {
  if (!product) return null;
  return <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="product-dialog-title" aria-modal="true" className="product-dialog" role="dialog">
      <div className="product-dialog-heading"><h3 id="product-dialog-title">Edit {product.name}</h3><button aria-label="Close edit dialog" className="dialog-close" onClick={onClose} type="button">×</button></div>
      <form action={updateProductAction} id="edit-product-form"><ProductFields categories={categories} defaultCategoryId={product.categoryId} product={product}/></form>
      <div className="product-dialog-actions"><form action={setProductActiveAction} onSubmit={(event) => { if (product.active && !window.confirm(`Hide ${product.name}? Existing relationships and history will be preserved.`)) event.preventDefault(); }}><input name="productId" type="hidden" value={product.id}/><input name="active" type="hidden" value={product.active ? "false" : "true"}/><button className={product.active ? "admin-danger" : "admin-secondary"} type="submit">{product.active ? "Hide" : "Unhide"}</button></form><div className="product-editor-actions"><button className="admin-secondary" onClick={onClose} type="button">Cancel</button><button className="admin-primary" form="edit-product-form" type="submit">Save Product</button></div></div>
    </section>
  </div>;
}
