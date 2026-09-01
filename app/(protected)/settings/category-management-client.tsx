"use client";

import { useState, useTransition, type DragEvent } from "react";
import { createCategoryAction, renameCategoryAction, reorderCategoriesAction, setCategoryActiveAction } from "./category-actions";

export type CategoryManagementRow = {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
};

export function CategoryManagementClient({ categories }: { categories: CategoryManagementRow[] }) {
  const [orderedCategories, setOrderedCategories] = useState(categories);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, startSaving] = useTransition();
  function saveOrder(next: CategoryManagementRow[]) {
    const previous = orderedCategories;
    setOrderedCategories(next);
    setMessage("Saving order…");
    const formData = new FormData();
    formData.set("categoryIds", JSON.stringify(next.map((category) => category.id)));
    startSaving(async () => {
      const result = await reorderCategoriesAction(formData);
      if (!result.ok) setOrderedCategories(previous);
      setMessage(result.message);
    });
  }
  function moveCategory(categoryId: string, targetId: string) {
    if (categoryId === targetId) return;
    const next = [...orderedCategories];
    const from = next.findIndex((category) => category.id === categoryId);
    const to = next.findIndex((category) => category.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  }
  function moveCategoryBy(categoryId: string, offset: number) {
    const index = orderedCategories.findIndex((category) => category.id === categoryId);
    const target = orderedCategories[index + offset];
    if (target) moveCategory(categoryId, target.id);
  }
  return (
    <section className="admin-panel categories-panel">
      <div className="category-admin-heading">
        <div><p className="eyebrow">Master data</p><h2>Categories</h2><p>Drag Categories into the order used by tabs throughout the application.</p><small aria-live="polite" className="category-order-status">{isSaving ? "Saving order…" : message}</small></div>
        <form action={createCategoryAction} className="category-create-form">
          <label>Name<input maxLength={120} name="name" placeholder="Category name" required /></label>
          <button className="admin-primary" type="submit">Add category</button>
        </form>
      </div>
      <div className="table-scroll">
        <table className="category-admin-table">
          <thead><tr><th className="category-reorder-column"><span className="sr-only">Order</span></th><th>Category</th><th>Status</th><th>Rename</th><th>Availability</th></tr></thead>
          <tbody>{orderedCategories.map((category) => (
            <tr className={draggingId === category.id ? "dragging-row" : ""} key={category.id} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => { if (draggingId) moveCategory(draggingId, category.id); setDraggingId(null); }}>
              <td className="category-reorder-column"><button aria-label={`Reorder ${category.name}. Use arrow keys or drag.`} className="drag-handle" draggable onDragEnd={() => setDraggingId(null)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggingId(category.id); }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); moveCategoryBy(category.id, event.key === "ArrowUp" ? -1 : 1); } }} title="Drag to reorder"><svg aria-hidden="true" viewBox="0 0 18 18"><path d="M4 5h10M4 9h10M4 13h10"/></svg></button></td>
              <td><strong>{category.name}</strong></td>
              <td><span className={`status-pill ${category.active ? "" : "muted-pill"}`}>{category.active ? "Active" : "Inactive"}</span></td>
              <td><form action={renameCategoryAction} className="category-inline-form" onSubmit={(event) => { if (!window.confirm(`Rename ${category.name}?`)) event.preventDefault(); }}><input name="categoryId" type="hidden" value={category.id}/><input aria-label={`New name for ${category.name}`} defaultValue={category.name} maxLength={120} name="name" required/><button className="admin-secondary" type="submit">Rename</button></form></td>
              <td><form action={setCategoryActiveAction} onSubmit={(event) => { if (category.active && !window.confirm(`Deactivate ${category.name}? Its products and history will be preserved.`)) event.preventDefault(); }}><input name="categoryId" type="hidden" value={category.id}/><input name="active" type="hidden" value={category.active ? "false" : "true"}/><button className={category.active ? "admin-danger" : "admin-secondary"} type="submit">{category.active ? "Deactivate" : "Reactivate"}</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
