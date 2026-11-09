"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
import { cancelOrderAction } from "@/app/(protected)/orders/actions";
export function CancelOrderDialog({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute("open", "");
    return () => {
      element?.close?.();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="order-edit-dialog order-cancel-dialog"
      aria-labelledby="cancel-order-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!reason.trim() || busy) return;
          start(async () => {
            const result = await cancelOrderAction({
              id: order.id,
              updatedAt: order.updatedAt,
              reason,
            });
            if (!result.ok) setError(result.message);
            else {
              router.refresh();
              onClose();
            }
          });
        }}
      >
        <h2 id="cancel-order-title">Cancel order</h2>
        <p>
          Cancel {order.vendorName} {order.year}-{order.number}?
        </p>
        <p>
          {order.status === "RECEIVED" && !order.historical && !order.isPrivate
            ? "The quantities received on this order will be removed from inventory."
            : "This order will remain in the audit history as cancelled."}
        </p>
        <label className="order-field">
          Reason for cancellation
          <textarea
            autoFocus
            required
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="order-editor-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Keep order
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={busy || !reason.trim()}
          >
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
