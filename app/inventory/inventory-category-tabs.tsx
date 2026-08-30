"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setOpeningInventoryAction } from "@/app/(protected)/inventory/actions";

export type InventoryLocationOption = { id: string; code: string; name: string };
export type InventoryProductRow = { id: string; name: string; packageSize: string | null; unitLabel: string; quantityScale: number; balance: string; openingSet: boolean };
export type InventoryCategoryRow = { id: string; name: string; products: InventoryProductRow[] };

export function InventoryCategoryTabs({ locations, selectedLocation, categories, canSetOpening }: { locations: InventoryLocationOption[]; selectedLocation: InventoryLocationOption; categories: InventoryCategoryRow[]; canSetOpening: boolean }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [showOpening, setShowOpening] = useState(false);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === selectedCategoryId) ?? categories[0], [categories, selectedCategoryId]);
  const availableOpeningProducts = selectedCategory?.products.filter((product) => !product.openingSet) ?? [];

  return <div className="inventory-workspace">
    <nav className="location-tabs" aria-label="Inventory location">{locations.map((location) => <Link className={location.id === selectedLocation.id ? "active" : ""} href={`/inventory?location=${encodeURIComponent(location.code)}`} key={location.id}>{location.name}</Link>)}</nav>
    {!selectedCategory ? <section className="empty-panel"><h2>No stocked Products</h2><p>Configure active Products for {selectedLocation.name} from the Products workspace.</p></section> : <section className="catalog-panel">
      <div className="category-tabs" role="tablist" aria-label="Inventory categories">{categories.map((category) => <button aria-selected={category.id === selectedCategory.id} className={category.id === selectedCategory.id ? "active" : ""} key={category.id} onClick={() => { setSelectedCategoryId(category.id); setShowOpening(false); }} role="tab" type="button">{category.name}</button>)}</div>
      <div className="table-toolbar"><div><h2>{selectedCategory.name}</h2><p>{selectedCategory.products.length} Product{selectedCategory.products.length === 1 ? "" : "s"} stocked at {selectedLocation.name}</p></div>{canSetOpening && <button className="admin-secondary" onClick={() => setShowOpening((value) => !value)} type="button">{showOpening ? "Cancel" : "Set opening inventory"}</button>}</div>
      {showOpening && <form action={setOpeningInventoryAction} className="opening-panel" onSubmit={(event) => { if (!window.confirm(`Set opening inventory for ${selectedLocation.name}? Saved opening quantities cannot be replaced; later corrections should use a physical count.`)) event.preventDefault(); }}>
        <input name="locationId" type="hidden" value={selectedLocation.id}/><input name="locationCode" type="hidden" value={selectedLocation.code}/>
        <div><h3>Set opening inventory</h3><p>Enter the quantity currently on hand in each Product&apos;s counted-as unit. Leave blank or 0 when there is no opening stock.</p></div>
        {availableOpeningProducts.length === 0 ? <p className="opening-complete">Opening inventory is already set for every Product in this Category.</p> : <div className="opening-grid">{availableOpeningProducts.map((product) => <label key={product.id}><span><strong>{product.name}</strong><small>{product.unitLabel}</small></span><input inputMode="decimal" min="0" name={`quantity-${product.id}`} placeholder="0" step={product.quantityScale === 0 ? "1" : `0.${"0".repeat(product.quantityScale - 1)}1`} type="number"/><input name="productId" type="hidden" value={product.id}/></label>)}</div>}
        {availableOpeningProducts.length > 0 && <><label className="opening-notes">Notes (optional)<input maxLength={1000} name="notes" placeholder="e.g. 2026 opening count"/></label><div className="opening-actions"><button className="admin-primary" type="submit">Confirm opening inventory</button></div></>}
      </form>}
      <div className="table-scroll"><table className="inventory-table"><thead><tr><th>Product</th><th>Package</th><th>Counted as</th><th>Current tracked quantity</th></tr></thead><tbody>{selectedCategory.products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.packageSize || "—"}</td><td>{product.unitLabel}</td><td className="inventory-quantity">{product.balance}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}
