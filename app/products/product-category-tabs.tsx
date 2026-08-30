"use client";

import { useMemo, useState } from "react";
import { createProductAction, setProductActiveAction, updateProductAction } from "@/app/(protected)/products/actions";
import { configureProductLocationAction } from "@/app/(protected)/products/location-actions";
import { STOCK_UNITS, type ProductStockUnit } from "@/lib/product-management";

export type ProductLocationRow = { locationId: string; active: boolean; reviewRequired: boolean };
export type LocationOption = { id: string; code: string; name: string; active: boolean };
export type ProductRow = { id: string; name: string; categoryId: string; packageSize: string | null; stockUnit: ProductStockUnit; stockUnitLabel: string | null; allowFractionalStock: boolean; quantityScale: number; purchaseUnit: string | null; unitsPerPurchaseUnit: string | null; active: boolean; starterShackRequestEligible: boolean; productLocations: ProductLocationRow[] };
export type ProductCategoryRow = { id: string; name: string; displayOrder: number; active: boolean; products: ProductRow[] };

function ProductFields({ product, categories, defaultCategoryId }: { product?: ProductRow; categories: ProductCategoryRow[]; defaultCategoryId: string }) {
  return <div className="product-form-grid">
    {product && <input name="productId" type="hidden" value={product.id}/>}
    <label>Name<input defaultValue={product?.name ?? ""} maxLength={160} name="name" required/></label>
    <label>Category<select defaultValue={product?.categoryId ?? defaultCategoryId} name="categoryId">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
    <label>Counted as<select defaultValue={product?.stockUnit ?? "EACH"} name="stockUnit">{STOCK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
    <label>Other unit name<input defaultValue={product?.stockUnitLabel ?? ""} maxLength={80} name="stockUnitLabel" placeholder="Only needed for OTHER"/></label>
    <label>Decimal places for partial quantities<input defaultValue={product?.quantityScale ?? 0} max={6} min={0} name="quantityScale" required type="number"/><small>Use 0 for whole cans, bottles, packages, and other whole units.</small></label>
    <label>Package size<input defaultValue={product?.packageSize ?? ""} maxLength={120} name="packageSize" placeholder="e.g. 355 mL"/></label>
    <label>Purchased by<input defaultValue={product?.purchaseUnit ?? ""} maxLength={80} name="purchaseUnit" placeholder="e.g. CASE"/></label>
    <label>Units in one case/package<input defaultValue={product?.unitsPerPurchaseUnit ?? ""} min="0.001" name="unitsPerPurchaseUnit" step="0.001" type="number"/></label>
    <label className="product-check"><input defaultChecked={product?.allowFractionalStock ?? false} name="allowFractionalStock" type="checkbox"/><span>Allow partial quantities<small>Useful for Products counted by part of a keg or package.</small></span></label>
    <label className="product-check"><input defaultChecked={product?.starterShackRequestEligible ?? false} name="starterShackRequestEligible" type="checkbox"/><span>Available to Starter Shack<small>Shows this Product on the future transfer list; it does not mean stock is currently there.</small></span></label>
  </div>;
}

export function ProductCategoryTabs({ categories, locations = [], canManageCatalog = false }: { categories: ProductCategoryRow[]; locations?: LocationOption[]; canManageCatalog?: boolean }) {
  const [selectedId, setSelectedId] = useState(categories.find((category) => category.active)?.id ?? categories[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = useMemo(() => categories.find((category) => category.id === selectedId) ?? categories[0], [categories, selectedId]);
  if (!selected) return <section className="empty-panel"><h2>No categories yet</h2><p>Create a Category in Settings before adding Products.</p></section>;
  return <section className="catalog-panel">
    <div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((category) => <button key={category.id} role="tab" aria-selected={selected.id === category.id} className={selected.id === category.id ? "active" : ""} onClick={() => { setSelectedId(category.id); setEditingId(null); setCreating(false); }}>{category.name}{!category.active && <small>Inactive</small>}</button>)}</div>
    <div className="table-toolbar"><div><h2>{selected.name}</h2><p>{selected.products.length} product{selected.products.length === 1 ? "" : "s"} · order {selected.displayOrder}</p></div><div className="product-toolbar-actions"><span className={`status-pill ${selected.active ? "" : "muted-pill"}`}>{selected.active ? "Active category" : "Inactive category"}</span>{canManageCatalog && <button className="admin-primary" onClick={() => setCreating((value) => !value)} type="button">{creating ? "Cancel" : "Add Product"}</button>}</div></div>
    {creating && <form action={createProductAction} className="product-editor"><h3>New Product</h3><ProductFields categories={categories} defaultCategoryId={selected.id}/><div className="product-editor-actions"><button className="admin-primary" type="submit">Create Product</button></div></form>}
    {selected.products.length === 0 ? <div className="empty-inline">No Products in this category.</div> : <div className="table-scroll"><table className="product-table product-admin-table"><thead><tr><th>Product</th><th>Size</th><th>Counted as</th><th>Purchased as</th><th>Partial quantities</th><th>Stocked at</th><th>Available to Shack</th><th>Status</th>{canManageCatalog && <th>Actions</th>}</tr></thead><tbody>{selected.products.map((product) => <ProductTableRows key={product.id} product={product} categories={categories} locations={locations} canManageCatalog={canManageCatalog} editing={editingId === product.id} onEdit={() => setEditingId(editingId === product.id ? null : product.id)}/>)}</tbody></table></div>}
  </section>;
}

function ProductTableRows({ product, categories, locations, canManageCatalog, editing, onEdit }: { product: ProductRow; categories: ProductCategoryRow[]; locations: LocationOption[]; canManageCatalog: boolean; editing: boolean; onEdit(): void }) {
  const unitLabel = product.stockUnit === "OTHER" ? product.stockUnitLabel : product.stockUnit;
  return <><tr className={product.active ? "" : "inactive-row"}>
    <td><strong>{product.name}</strong><small>ID {product.id.slice(0, 8)}</small></td><td>{product.packageSize || "—"}</td><td>{unitLabel}</td><td>{product.purchaseUnit ? `${product.purchaseUnit} · ${product.unitsPerPurchaseUnit} ${unitLabel}` : "—"}</td><td>{product.allowFractionalStock ? `Yes · ${product.quantityScale} decimals` : "No"}</td><td><LocationConfiguration product={product} locations={locations} canManageCatalog={canManageCatalog}/></td><td>{product.starterShackRequestEligible ? "Yes" : "No"}</td><td><span className={`status-dot ${product.active ? "on" : ""}`}/>{product.active ? "Active" : "Inactive"}</td>
    {canManageCatalog && <td><div className="product-row-actions"><button className="admin-secondary" onClick={onEdit} type="button">{editing ? "Close" : "Edit"}</button><form action={setProductActiveAction} onSubmit={(event) => { if (product.active && !window.confirm(`Deactivate ${product.name}? Existing relationships and history will be preserved.`)) event.preventDefault(); }}><input name="productId" type="hidden" value={product.id}/><input name="active" type="hidden" value={product.active ? "false" : "true"}/><button className={product.active ? "admin-danger" : "admin-secondary"} type="submit">{product.active ? "Deactivate" : "Activate"}</button></form></div></td>}
  </tr>{editing && <tr className="product-edit-row"><td colSpan={9}><form action={updateProductAction} className="product-editor"><h3>Edit {product.name}</h3><ProductFields categories={categories} defaultCategoryId={product.categoryId} product={product}/><div className="product-editor-actions"><button className="admin-primary" type="submit">Save Product</button></div></form></td></tr>}</>;
}

function LocationConfiguration({ product, locations, canManageCatalog }: { product: ProductRow; locations: LocationOption[]; canManageCatalog: boolean }) {
  return <div className="location-config">{locations.map((location) => {
    const relationship = product.productLocations.find((item) => item.locationId === location.id);
    const stocked = relationship?.active ?? false;
    return <div className={`location-config-item ${stocked ? "stocked" : ""}`} key={location.id}><span><strong>{location.name}</strong><small>{stocked ? "Stocked" : "Not stocked"}{relationship?.reviewRequired ? " · Review required" : ""}</small></span>{canManageCatalog && location.active && <><form action={configureProductLocationAction}><input name="productId" type="hidden" value={product.id}/><input name="locationId" type="hidden" value={location.id}/><input name="active" type="hidden" value={stocked ? "false" : "true"}/><input name="reviewRequired" type="hidden" value="false"/><button className={stocked ? "location-remove" : "location-add"} type="submit">{stocked ? "Remove" : "Add"}</button></form>{relationship?.reviewRequired && <form action={configureProductLocationAction}><input name="productId" type="hidden" value={product.id}/><input name="locationId" type="hidden" value={location.id}/><input name="active" type="hidden" value={String(stocked)}/><input name="reviewRequired" type="hidden" value="false"/><button className="location-review" type="submit">Resolve</button></form>}</>}</div>;
  })}</div>;
}
