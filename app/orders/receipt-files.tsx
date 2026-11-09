"use client";
import { prepareReceiptPhoto } from "@/lib/receipt-photo";
import { MAX_RECEIPT_BYTES } from "@/lib/order-receipts";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "@/lib/purchase-order-queries";
export function ReceiptFiles({
  order,
  canManage,
  canDelete = canManage,
  uploadLabel = "Attach receipt",
  onChanged,
}: {
  order: Pick<OrderRow, "id" | "receipts">;
  canManage: boolean;
  canDelete?: boolean;
  uploadLabel?: string;
  onChanged?: (message: string) => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("Preparing receipt…");
    try {
      const prepared = await prepareReceiptPhoto(file);
      if (prepared.size > MAX_RECEIPT_BYTES)
        throw new Error("Choose a receipt up to 3 MB.");
      setMessage("Uploading receipt…");
      const form = new FormData();
      form.set("file", prepared);
      const response = await fetch(`/api/orders/${order.id}/receipts`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setMessage("Receipt saved.");
      onChanged?.("Receipt saved.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(receipt: { id: string; name: string }) {
    if (!window.confirm(`Delete receipt "${receipt.name}" from this order?`))
      return;
    setBusy(true);
    setMessage("Deleting receipt…");
    try {
      const response = await fetch(
        `/api/orders/${order.id}/receipts/${receipt.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Receipt could not be deleted.");
      setMessage("Receipt deleted.");
      onChanged?.("Receipt deleted.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Receipt could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="order-card-receipts" aria-label="Order receipts">
      {canManage && (
        <label
          className={`btn-secondary receipt-upload ${busy ? "is-uploading" : ""}`}
          title="Choose a file or take a photo on your phone. PDF or image, up to 3 MB."
        >
          {busy ? "Working…" : uploadLabel}
          <input
            type="file"
            aria-label="Receipt photo or file"
            accept="application/pdf,image/*"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {order.receipts.map((r) => (
        <span className="receipt-file-item" key={r.id}>
          <a
            className="receipt-file-link"
            href={`/api/orders/${order.id}/receipts/${r.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {r.name}
          </a>
          {canDelete && (
            <button
              type="button"
              className="btn-secondary receipt-delete"
              aria-label={`Delete receipt ${r.name}`}
              disabled={busy}
              onClick={() => void remove(r)}
            >
              Delete
            </button>
          )}
        </span>
      ))}
      {message && <span role="status">{message}</span>}
    </div>
  );
}
