"use client";

import { createCategoryAction, renameCategoryAction, reorderCategoryAction, setCategoryActiveAction } from "./category-actions";

export type CategoryManagementRow = {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  productCount: number;
};

export function CategoryManagementClient({ categories }: { categories: CategoryManagementRow[] }) {
  const nextOrder = categories.length ? Math.max(...categories.map((category) => category.displayOrder)) + 1 : 0;
  return (
    <section className="admin-panel categories-panel">
      <div className="category-admin-heading">
        <div><p className="eyebrow">Master data</p><h2>Categories</h2><p>Tabs use display order, then name, then stable database identity.</p></div>
        <form action={createCategoryAction} className="category-create-form">
          <label>Name<input maxLength={120} name="name" placeholder="Category name" required /></label>
          <label>Order<input defaultValue={nextOrder} min={0} name="displayOrder" required type="number" /></label>
          <button className="admin-primary" type="submit">Add category</button>
        </form>
      </div>
      <div className="table-scroll">
        <table className="category-admin-table">
          <thead><tr><th>Category</th><th>Status</th><th>Products</th><th>Rename</th><th>Display order</th><th>Availability</th></tr></thead>
          <tbody>{categories.map((category) => (
            <tr key={category.id}>
              <td><strong>{category.name}</strong><small>ID {category.id.slice(0, 8)}</small></td>
              <td><span className={`status-pill ${category.active ? "" : "muted-pill"}`}>{category.active ? "Active" : "Inactive"}</span></td>
              <td>{category.productCount}</td>
              <td><form action={renameCategoryAction} className="category-inline-form" onSubmit={(event) => { if (!window.confirm(`Rename ${category.name}?`)) event.preventDefault(); }}><input name="categoryId" type="hidden" value={category.id}/><input aria-label={`New name for ${category.name}`} defaultValue={category.name} maxLength={120} name="name" required/><button className="admin-secondary" type="submit">Rename</button></form></td>
              <td><form action={reorderCategoryAction} className="category-inline-form"><input name="categoryId" type="hidden" value={category.id}/><input aria-label={`Display order for ${category.name}`} defaultValue={category.displayOrder} min={0} name="displayOrder" required type="number"/><button className="admin-secondary" type="submit">Save order</button></form></td>
              <td><form action={setCategoryActiveAction} onSubmit={(event) => { if (category.active && !window.confirm(`Deactivate ${category.name}? Its products and history will be preserved.`)) event.preventDefault(); }}><input name="categoryId" type="hidden" value={category.id}/><input name="active" type="hidden" value={category.active ? "false" : "true"}/><button className={category.active ? "admin-danger" : "admin-secondary"} type="submit">{category.active ? "Deactivate" : "Reactivate"}</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
