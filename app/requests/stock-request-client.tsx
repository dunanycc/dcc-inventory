"use client";

import { useMemo, useState } from "react";
import {
  cancelStockRequestAction,
  closeStockRequestAction,
  fulfillStockRequestAction,
  submitStockRequestAction,
  updateRequestNotificationSettingsAction,
} from "@/app/(protected)/requests/actions";

export type RequestProduct = {
  id: string;
  name: string;
  unit: string;
  quantityScale: number;
};
export type RequestCategory = {
  id: string;
  name: string;
  products: RequestProduct[];
};
export type RequestView = {
  id: string;
  requestedAt: string;
  completedAt: string | null;
  closureComment: string | null;
  requestedBy: string;
  status: string;
  notes: string | null;
  lines: Array<{
    id: string;
    productName: string;
    unit: string;
    quantityScale: number;
    requested: string;
    given: string;
    givenAt: string | null;
  }>;
};

export function NewStockRequest({
  categories,
}: {
  categories: RequestCategory[];
}) {
  const products = useMemo(
    () =>
      new Map(
        categories.flatMap((category) =>
          category.products.map((product) => [product.id, product] as const),
        ),
      ),
    [categories],
  );
  const [selectedId, setSelectedId] = useState(categories[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const items = Object.entries(cart).filter(
    ([, quantity]) => Number(quantity) > 0,
  );
  const selected =
    categories.find((category) => category.id === selectedId) ?? categories[0];
  function addToCart(productId: string) {
    const quantity = Number(drafts[productId] ?? "1");
    const scale = 10 ** (products.get(productId)?.quantityScale ?? 0);
    if (quantity > 0)
      setCart((current) => ({
        ...current,
        [productId]: String(
          Math.round((Number(current[productId] ?? 0) + quantity) * scale) /
            scale,
        ),
      }));
  }
  if (!categories.length)
    return (
      <section className="empty-panel">
        <h2>No Products are available</h2>
        <p>
          A Product must be active, available to Starter Shack, and ready at
          both Bar and Starter Shack.
        </p>
      </section>
    );
  const summary = (
    <>
      <ul>
        {items.map(([id, quantity]) => (
          <li key={id}>
            <span>
              <strong>{products.get(id)?.name}</strong>
              <small>{products.get(id)?.unit}</small>
            </span>
            <input
              aria-label={`Requested quantity for ${products.get(id)?.name}`}
              min="0"
              step={
                products.get(id)?.quantityScale
                  ? 10 ** -(products.get(id)?.quantityScale ?? 0)
                  : 1
              }
              value={quantity}
              onChange={(event) =>
                setCart({ ...cart, [id]: event.target.value })
              }
              type="number"
            />
            <button
              aria-label={`Remove ${products.get(id)?.name}`}
              type="button"
              onClick={() =>
                setCart(
                  Object.fromEntries(
                    Object.entries(cart).filter(([key]) => key !== id),
                  ),
                )
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <label>
        Optional notes
        <textarea
          maxLength={1000}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          value={notes}
        />
      </label>
    </>
  );
  return (
    <div className="request-workspace">
      <section className="request-products">
        <div
          aria-label="Product categories"
          className="category-tabs"
          role="tablist"
        >
          {categories.map((category) => (
            <button
              aria-selected={selected.id === category.id}
              className={selected.id === category.id ? "active" : ""}
              key={category.id}
              onClick={() => setSelectedId(category.id)}
              role="tab"
              type="button"
            >
              {category.name}
              <span aria-hidden="true" className="category-count">
                {category.products.length}
              </span>
            </button>
          ))}
        </div>
        <div className="request-category-head">
          <span>Product</span>
          <span>Counted as</span>
          <span>Quantity</span>
        </div>
        {selected.products.map((product) => (
          <div className="request-product-row" key={product.id}>
            <strong>{product.name}</strong>
            <span>{product.unit}</span>
            <div>
              <input
                aria-label={`Quantity for ${product.name}`}
                min="0"
                step={product.quantityScale ? 10 ** -product.quantityScale : 1}
                type="number"
                value={drafts[product.id] ?? "1"}
                onChange={(event) =>
                  setDrafts({ ...drafts, [product.id]: event.target.value })
                }
              />
              <button type="button" onClick={() => addToCart(product.id)}>
                Add
              </button>
            </div>
          </div>
        ))}
      </section>
      <aside className="request-summary">
        <header>
          <strong>Request Summary</strong>
          {items.length > 0 && (
            <button type="button" onClick={() => setCart({})}>
              Clear
            </button>
          )}
        </header>
        {items.length === 0 ? (
          <p>Add items to get started.</p>
        ) : (
          <div className="request-summary-body">
            {summary}
            <button
              className="request-submit"
              onClick={() => setConfirming(true)}
              type="button"
            >
              Submit Request
            </button>
          </div>
        )}
      </aside>
      {confirming && (
        <div
          className="request-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirming(false);
          }}
        >
          <section
            aria-labelledby="request-confirm-title"
            aria-modal="true"
            className="request-confirm-dialog"
            role="dialog"
          >
            <header>
              <div>
                <h2 id="request-confirm-title">Confirm Request</h2>
                <p>Review the full request before submitting.</p>
              </div>
              <button
                aria-label="Close request summary"
                onClick={() => setConfirming(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <form action={submitStockRequestAction}>
              <input
                name="items"
                type="hidden"
                value={JSON.stringify(
                  items.map(([productId, quantity]) => ({
                    productId,
                    quantity,
                  })),
                )}
              />
              <input name="notes" type="hidden" value={notes} />
              <div className="request-confirm-summary">{summary}</div>
              <footer>
                <button
                  className="btn-secondary"
                  onClick={() => setConfirming(false)}
                  type="button"
                >
                  Close and Update
                </button>
                <button className="request-submit" type="submit">
                  Confirm Request
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-CA");
}

export function FulfillmentQueue({
  notificationSettings,
  requests,
}: {
  notificationSettings: {
    orderNotificationEmail: string;
    requestorEmail: string;
  };
  requests: RequestView[];
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [closure, setClosure] = useState<{
    requestId: string;
    kind: "close" | "cancel";
  } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      requests.flatMap((request) =>
        request.lines.map((line) => [
          line.id,
          String(Math.max(0, Number(line.requested) - Number(line.given))),
        ]),
      ),
    ),
  );
  const active = requests.filter(
    (request) =>
      request.status === "SUBMITTED" || request.status === "PARTIALLY_GIVEN",
  );
  const completed = requests.filter((request) => !active.includes(request));
  const visible = showCompleted ? [...active, ...completed] : active;
  return (
    <>
      <form
        action={updateRequestNotificationSettingsAction}
        className="request-email-settings"
      >
        <label>
          Order notification email
          <input
            defaultValue={notificationSettings.orderNotificationEmail}
            maxLength={320}
            name="orderNotificationEmail"
            placeholder="orders@example.com"
            type="email"
          />
        </label>
        <label>
          Requestor email
          <input
            defaultValue={notificationSettings.requestorEmail}
            maxLength={320}
            name="requestorEmail"
            placeholder="startershack@example.com"
            type="email"
          />
        </label>
        <button className="btn-secondary compact-action" type="submit">
          Save Emails
        </button>
        <small>
          Order notifications are sent for new requests; requestor notifications
          are sent when all requested stock has been given.
        </small>
      </form>
      <div className="fulfillment-toolbar">
        <span>
          {active.length} open request{active.length === 1 ? "" : "s"}
        </span>
        {completed.length > 0 && (
          <button
            className="btn-secondary compact-action"
            onClick={() => setShowCompleted((value) => !value)}
            type="button"
          >
            {showCompleted
              ? "Hide completed requests"
              : `View completed requests (${completed.length})`}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <section className="empty-panel compact-empty">
          <h2>No pending requests</h2>
          <p>New Starter Shack requests will appear here.</p>
        </section>
      ) : (
        <section className="fulfillment-list">
          {visible.map((request) => {
            const isOpen =
              request.status === "SUBMITTED" ||
              request.status === "PARTIALLY_GIVEN";
            const items = request.lines
              .map((line) => ({
                lineId: line.id,
                quantity: quantities[line.id] ?? "",
              }))
              .filter((item) => Number(item.quantity) > 0);
            return (
              <article
                className={`request-card fulfillment-card ${isOpen ? "" : "completed-request"}`}
                id={`request-${request.id}`}
                key={request.id}
              >
                <header>
                  <div>
                    <strong>{formatDate(request.requestedAt)}</strong>
                    <small>
                      {request.requestedBy}
                      {request.completedAt
                        ? ` · Closed ${formatDate(request.completedAt)}`
                        : ""}
                    </small>
                  </div>
                  <span
                    className={`request-status ${request.status.toLowerCase()}`}
                  >
                    {request.status === "GIVEN"
                      ? "COMPLETED"
                      : request.status.replaceAll("_", " ")}
                  </span>
                </header>
                <div className="table-scroll">
                  <table className="request-table fulfillment-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Requested</th>
                        <th>Given</th>
                        <th>Stock given</th>
                        {isOpen && (
                          <>
                            <th>Remaining</th>
                            <th>Giving now</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {request.lines.map((line) => {
                        const remaining =
                          Number(line.requested) - Number(line.given);
                        return (
                          <tr key={line.id}>
                            <td>
                              <strong>{line.productName}</strong>
                              <small>{line.unit}</small>
                            </td>
                            <td>{line.requested}</td>
                            <td>{line.given}</td>
                            <td>
                              {line.givenAt ? formatDate(line.givenAt) : "—"}
                            </td>
                            {isOpen && (
                              <>
                                <td>{remaining}</td>
                                <td>
                                  <input
                                    aria-label={`Give ${line.productName}`}
                                    max={remaining}
                                    min="0"
                                    step={
                                      line.quantityScale
                                        ? 10 ** -line.quantityScale
                                        : 1
                                    }
                                    type="number"
                                    value={quantities[line.id] ?? ""}
                                    onChange={(event) =>
                                      setQuantities({
                                        ...quantities,
                                        [line.id]: event.target.value,
                                      })
                                    }
                                  />
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {isOpen && (
                  <div className="fulfillment-card-actions">
                    <form action={fulfillStockRequestAction}>
                      <input
                        name="requestId"
                        type="hidden"
                        value={request.id}
                      />
                      <input
                        name="items"
                        type="hidden"
                        value={JSON.stringify(items)}
                      />
                      <button
                        className="request-action-button"
                        disabled={!items.length}
                        type="submit"
                      >
                        Give Stock
                      </button>
                    </form>
                    {request.status === "PARTIALLY_GIVEN" && (
                      <button
                        className="request-action-button"
                        onClick={() =>
                          setClosure({ requestId: request.id, kind: "close" })
                        }
                        type="button"
                      >
                        Close Request
                      </button>
                    )}
                    {request.status === "SUBMITTED" && (
                      <button
                        className="request-action-button"
                        onClick={() =>
                          setClosure({ requestId: request.id, kind: "cancel" })
                        }
                        type="button"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                )}
                {request.notes && (
                  <p className="request-notes">{request.notes}</p>
                )}
                {request.closureComment && request.completedAt && (
                  <p className="request-closure-comment">
                    <strong>
                      {request.status === "CLOSED" ? "Closed" : "Cancelled"}{" "}
                      {formatDateTime(request.completedAt)}:
                    </strong>{" "}
                    {request.closureComment}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
      {closure && (
        <RequestClosureDialog
          kind={closure.kind}
          onClose={() => setClosure(null)}
          requestId={closure.requestId}
        />
      )}
    </>
  );
}

function RequestClosureDialog({
  kind,
  onClose,
  requestId,
}: {
  kind: "close" | "cancel";
  onClose(): void;
  requestId: string;
}) {
  const isClose = kind === "close";
  return (
    <div
      className="request-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="request-closure-title"
        aria-modal="true"
        className="request-confirm-dialog request-closure-dialog"
        role="dialog"
      >
        <header>
          <div>
            <h2 id="request-closure-title">
              {isClose ? "Close Request" : "Cancel Request"}
            </h2>
            <p>
              {isClose
                ? "Remaining quantities will not be given. Stock already given will remain unchanged."
                : "This request will be cancelled without changing inventory."}
            </p>
          </div>
          <button
            aria-label="Close confirmation dialog"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form
          action={isClose ? closeStockRequestAction : cancelStockRequestAction}
        >
          <input name="requestId" type="hidden" value={requestId} />
          <div className="request-closure-dialog-body">
            <label>
              Comment
              <textarea
                aria-label={isClose ? "Close comment" : "Cancellation comment"}
                autoFocus
                maxLength={1000}
                name="closureComment"
                placeholder="Enter the reason for this action"
                required
                rows={3}
              />
            </label>
          </div>
          <footer>
            <button className="btn-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="request-submit" type="submit">
              Confirm {isClose ? "Close" : "Cancellation"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
