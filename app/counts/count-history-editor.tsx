"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctCountHistoryAction } from "@/app/(protected)/counts/actions";
import type { CountHistoryRow, SeasonOpeningEntry } from "./count-client";
export function CountHistoryEditor({
  count,
  products,
  onClose,
}: {
  count: CountHistoryRow;
  products: SeasonOpeningEntry[];
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    router = useRouter();
  const rows = [
    ...count.lines.map((line) => ({
      productId: line.productId,
      name: line.productName,
      unit: line.unitLabel,
      scale: line.quantityScale ?? 0,
      value: line.countedQuantity ?? "",
    })),
    ...products
      .filter(
        (p) => !count.lines.some((line) => line.productId === p.productId),
      )
      .map((p) => ({
        productId: p.productId,
        name: p.name,
        unit: p.unitLabel,
        scale: p.quantityScale,
        value: "",
      })),
  ];
  const [values, setValues] = useState(() =>
      Object.fromEntries(rows.map((row) => [row.productId, row.value])),
    ),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current;
    if (el?.showModal) el.showModal();
    else el?.setAttribute("open", "");
    return () => {
      el?.close?.();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="order-edit-dialog"
      aria-labelledby="count-edit-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const entries = rows
            .filter(
              (row) =>
                values[row.productId].trim() !== "" &&
                values[row.productId] !== row.value,
            )
            .map((row) => ({
              productId: row.productId,
              quantity: values[row.productId],
            }));
          if (!entries.length) {
            setMessage("Change at least one counted quantity.");
            return;
          }
          start(async () => {
            const result = await correctCountHistoryAction({
              countId: count.id,
              revision: count.revision ?? "",
              reason,
              entries,
            });
            if (result.ok) {
              router.refresh();
              onClose();
            } else setMessage(result.message);
          });
        }}
      >
        <h2 id="count-edit-title">Edit historical count — {count.countDate}</h2>
        <p>
          Correct selected counted quantities or enter missing products. Blank
          fields stay unchanged. This updates historical reporting only; current
          inventory and original stock movements stay unchanged.
        </p>
        <label className="order-field">
          Reason for correction
          <textarea
            required
            maxLength={1000}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="table-scroll count-history-edit-table">
          <table className="product-table count-review-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Counted as</th>
                <th>Counted quantity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td>
                    {row.name}
                    {row.value === "" && (
                      <small>Not recorded in this count</small>
                    )}
                  </td>
                  <td>{row.unit}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step={row.scale === 0 ? "1" : "0.01"}
                      aria-label={`Historical quantity for ${row.name}`}
                      value={values[row.productId]}
                      placeholder="Leave unchanged"
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          [row.productId]: e.target.value,
                        }))
                      }
                      disabled={busy}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && (
          <p role="alert" className="notice error">
            {message}
          </p>
        )}
        <div className="order-editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !reason.trim()}
          >
            {busy ? "Saving…" : "Save historical corrections"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
