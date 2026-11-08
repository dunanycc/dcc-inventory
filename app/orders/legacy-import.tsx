"use client";
import Link from "next/link";
import { useState } from "react";
import type { LegacyPurchasePreview } from "@/lib/legacy-purchase-import";
export function LegacyOrderImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LegacyPurchasePreview | null>(null);
  const [privateIds, setPrivateIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(execute = false) {
    if (!file || busy) return;
    if (
      execute &&
      !window.confirm(
        "Import the previewed order history? This creates historical order records only and does not add stock.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      if (execute) {
        form.set("execute", "true");
        form.set("fileHash", preview!.fileHash);
        form.set("privateSourceIds", JSON.stringify(privateIds));
      }
      const response = await fetch("/api/order-import", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (execute) {
        setMessage(
          `Imported ${result.created} orders; ${result.skipped} already imported and skipped.`,
        );
        setPreview(null);
      } else {
        setPreview(result);
        setPrivateIds([]);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-panel">
      <p>
        <Link href="/order-history">Back to Order History</Link>
      </p>
      <p>
        Use the original Excel workbook containing Orders and Products.
        Cancelled orders are excluded. Historical Mixed Drinks belong to Beer.
        Prices remain unavailable. Files are processed privately and are not
        added to the public repository.
      </p>
      <label className="order-field">
        Legacy workbook (.xlsx)
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setPrivateIds([]);
            setMessage("");
          }}
        />
      </label>
      <button
        className="btn-secondary"
        disabled={!file || busy}
        onClick={() => void send()}
      >
        Preview import
      </button>
      <p role="status">{busy ? "Processing…" : message}</p>
      {preview && (
        <>
          <p>
            {preview.originalOrders} original orders · {preview.cancelledOrders}{" "}
            cancelled excluded ·{" "}
            {preview.orders.filter((o) => !o.alreadyImported).length} vendor
            orders to create ·{" "}
            {preview.orders.filter((o) => o.alreadyImported).length} already
            imported.
          </p>
          {preview.errors.map((error, i) => (
            <p className="notice error" key={i}>
              {error}
            </p>
          ))}
          <p>
            Numbers are assigned independently for each vendor/year on import.
            Review date warnings below; original labels and notes are retained
            for correction.
          </p>
          <p>
            Mark non-inventory orders as Private before import. They retain this
            vendor and are stored as manual products. Missing catalog matches
            alone do not automatically make an order private.
          </p>
          <div className="table-scroll order-import-report">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Original order</th>
                  <th>Vendor</th>
                  <th>Private</th>
                  <th>Date</th>
                  <th>Products</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {preview.orders.map((o) => (
                  <tr key={o.sourceId}>
                    <td>
                      {o.originalLabel}
                      {o.alreadyImported && (
                        <small className="order-muted">Already imported</small>
                      )}
                    </td>
                    <td>{o.vendorName}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Private ${o.originalLabel} ${o.vendorName}`}
                        disabled={o.alreadyImported || busy}
                        checked={privateIds.includes(o.sourceId)}
                        onChange={(e) =>
                          setPrivateIds(
                            e.target.checked
                              ? [...privateIds, o.sourceId]
                              : privateIds.filter((id) => id !== o.sourceId),
                          )
                        }
                      />
                      {privateIds.includes(o.sourceId) && (
                        <small className="order-muted">
                          Manual products; no inventory
                        </small>
                      )}
                    </td>
                    <td>{o.date ?? "Needs review"}</td>
                    <td>{o.lines.length}</td>
                    <td>
                      {o.warnings
                        .filter(
                          (w) =>
                            !privateIds.includes(o.sourceId) ||
                            !w.includes(
                              "preserved as an archived product label",
                            ),
                        )
                        .map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn-primary"
            disabled={
              busy ||
              !!preview.errors.length ||
              preview.orders.every((o) => o.alreadyImported)
            }
            onClick={() => void send(true)}
          >
            Import reviewed history
          </button>
        </>
      )}
    </section>
  );
}
