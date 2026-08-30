"use client";

import { useState } from "react";
import { parseProductImportCsv, type ProductImportPreview } from "@/lib/product-import";
import { importProductsAction } from "./import-actions";

export function ProductImportClient() {
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  return <section className="admin-panel import-panel">
    <div className="import-heading"><div><p className="eyebrow">Master data</p><h2>Import Categories and Products</h2><p>Preview a CSV, then import it atomically. This does not create quantities or inventory movements.</p></div><a className="admin-secondary template-link" download href="/product-import-template.csv">Download CSV template</a></div>
    <form action={importProductsAction} className="import-form">
      <label>Product CSV<input accept=".csv,text/csv" name="file" required type="file" onChange={async (event) => { const file = event.target.files?.[0]; setFileName(file?.name ?? ""); setPreview(file ? parseProductImportCsv(await file.text()) : null); }}/></label>
      <p className="import-help">Use the template or export the current DCC worksheet directly as CSV. Opening Count and Consumed are ignored; quantities are not imported in this phase.</p>
      {preview && <div className="import-preview" aria-live="polite">
        <header><strong>{fileName}</strong><span>{preview.rows.length} Product row{preview.rows.length === 1 ? "" : "s"}</span></header>
        {preview.errors.length > 0 ? <ul className="import-errors">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <>{preview.warnings.length > 0 && <details className="import-warnings"><summary>{preview.warnings.length} unit warning{preview.warnings.length === 1 ? "" : "s"} — review before importing</summary><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}<div className="table-scroll"><table className="import-preview-table"><thead><tr><th>Product</th><th>Category</th><th>Unit</th><th>Bar</th><th>Starter Shack</th></tr></thead><tbody>{preview.rows.slice(0, 12).map((row) => <tr key={row.sourceId}><td><strong>{row.product}</strong><small>{row.sourceId}</small></td><td>{row.category}</td><td>{row.stockUnit}{row.stockUnitLabel ? ` · ${row.stockUnitLabel}` : ""}{row.packageSize ? ` · ${row.packageSize}` : ""}</td><td>{row.bar ? "Yes" : "No"}</td><td>{row.starterShack ? "Yes" : "No"}</td></tr>)}</tbody></table>{preview.rows.length > 12 && <p className="import-more">Plus {preview.rows.length - 12} more rows.</p>}</div></>}
      </div>}
      <button className="admin-primary" disabled={!preview || preview.errors.length > 0 || preview.rows.length === 0} type="submit">Import Products</button>
    </form>
  </section>;
}
