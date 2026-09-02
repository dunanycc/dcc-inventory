"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  acceptCountAction,
  cancelCountAction,
  saveCountDraftAction,
  startCountAction,
} from "@/app/(protected)/counts/actions";

export type CountLocationOption = { id: string; code: string; name: string };

export type CountProductRow = {
  lineId: string;
  productId: string;
  name: string;
  packageSize: string | null;
  unitLabel: string;
  quantityScale: number;
  displayOrder: number;
  expectedQuantity: string;
  countedQuantity: string | null;
};

export type CountCategory = {
  id: string;
  name: string;
  displayOrder: number;
  products: CountProductRow[];
};

export type ActiveDraft = {
  id: string;
  notes: string | null;
  categories: CountCategory[];
};

export type CountHistoryLine = {
  productName: string;
  unitLabel: string;
  expectedQuantity: string;
  countedQuantity: string | null;
  difference: string | null;
};

export type CountHistoryRow = {
  id: string;
  countDate: string;
  status: "DRAFT" | "ACCEPTED" | "CANCELLED";
  notes: string | null;
  createdBy: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  lines: CountHistoryLine[];
};

function quantityStep(quantityScale: number) {
  return quantityScale === 0 ? "1" : `0.${"0".repeat(quantityScale - 1)}1`;
}

function formatDifference(value: string | null) {
  if (value === null) return "—";
  const numeric = Number(value);
  if (numeric === 0) return "0";
  return numeric > 0 ? `+${value}` : value;
}

export function CountWorkspace({
  canEditDraft,
  canAccept,
  draft,
  history,
  locations,
  selectedLocation,
}: {
  canEditDraft: boolean;
  canAccept: boolean;
  draft: ActiveDraft | null;
  history: CountHistoryRow[];
  locations: CountLocationOption[];
  selectedLocation: CountLocationOption;
}) {
  return (
    <div className="counts-workspace">
      <nav className="location-tabs" aria-label="Count location">
        {locations.map((location) => (
          <Link
            className={location.id === selectedLocation.id ? "active" : ""}
            href={`/counts?location=${encodeURIComponent(location.code)}`}
            key={location.id}
          >
            {location.name}
          </Link>
        ))}
      </nav>
      {draft ? (
        <DraftCountEntry
          canAccept={canAccept}
          canEditDraft={canEditDraft}
          draft={draft}
          selectedLocation={selectedLocation}
        />
      ) : (
        <section className="empty-panel">
          <h2>No Count in progress</h2>
          <p>
            Start a Count for {selectedLocation.name} to compare what is
            physically there with what the app expects.
          </p>
          {canEditDraft && (
            <form action={startCountAction}>
              <input
                name="locationId"
                type="hidden"
                value={selectedLocation.id}
              />
              <input
                name="locationCode"
                type="hidden"
                value={selectedLocation.code}
              />
              <button className="btn-primary" type="submit">
                Start Count
              </button>
            </form>
          )}
        </section>
      )}
      <CountHistoryList
        history={history}
        locationName={selectedLocation.name}
      />
    </div>
  );
}

function DraftCountEntry({
  draft,
  canEditDraft,
  canAccept,
  selectedLocation,
}: {
  draft: ActiveDraft;
  canEditDraft: boolean;
  canAccept: boolean;
  selectedLocation: CountLocationOption;
}) {
  const allProducts = useMemo(
    () => draft.categories.flatMap((category) => category.products),
    [draft.categories],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      allProducts.map((product) => [
        product.lineId,
        product.countedQuantity ?? "",
      ]),
    ),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    draft.categories[0]?.id ?? "",
  );
  const [reviewing, setReviewing] = useState(false);

  const remaining = allProducts.filter(
    (product) => (values[product.lineId] ?? "").trim() === "",
  ).length;

  return (
    <form action={saveCountDraftAction} className="count-entry">
      <input name="countId" type="hidden" value={draft.id} />
      <input name="locationCode" type="hidden" value={selectedLocation.code} />
      <div className="count-entry-toolbar">
        <div>
          <h2>Counting {selectedLocation.name}</h2>
          <p>
            {remaining === 0
              ? "Every Product has a counted quantity."
              : `${remaining} Product${remaining === 1 ? "" : "s"} still need a count.`}
          </p>
        </div>
        <div className="count-entry-actions">
          {canEditDraft && (
            <button className="btn-secondary compact-action" type="submit">
              Save draft
            </button>
          )}
          {canEditDraft && (
            <button
              className="btn-secondary compact-action"
              formAction={cancelCountAction}
              onClick={(event) => {
                if (
                  !window.confirm(
                    "Cancel this Count? Anything entered will be discarded.",
                  )
                )
                  event.preventDefault();
              }}
              type="submit"
            >
              Cancel count
            </button>
          )}
          <button
            className="btn-secondary compact-action"
            onClick={() => setReviewing((value) => !value)}
            type="button"
          >
            {reviewing ? "Back to entry" : "Review"}
          </button>
        </div>
      </div>
      {reviewing ? (
        <div className="table-scroll">
          <table className="product-table count-review-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Counted as</th>
                <th>Expected</th>
                <th>Counted</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {draft.categories.map((category) =>
                category.products.map((product) => {
                  const counted = values[product.lineId] ?? "";
                  const difference =
                    counted.trim() === ""
                      ? null
                      : String(
                          Number(counted) - Number(product.expectedQuantity),
                        );
                  return (
                    <tr key={product.lineId}>
                      <td>
                        <strong>{product.name}</strong>
                        <small>{category.name}</small>
                      </td>
                      <td>{product.unitLabel}</td>
                      <td>{product.expectedQuantity}</td>
                      <td>{counted.trim() === "" ? "—" : counted}</td>
                      <td>{formatDifference(difference)}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="catalog-panel">
          <div
            aria-label="Product categories"
            className="category-tabs"
            role="tablist"
          >
            {draft.categories.map((category) => (
              <button
                aria-selected={selectedCategoryId === category.id}
                className={selectedCategoryId === category.id ? "active" : ""}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
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
          <div className="table-scroll">
            <table className="product-table count-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Counted as</th>
                  <th>Expected</th>
                  <th>Counted</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {draft.categories
                  .find((category) => category.id === selectedCategoryId)
                  ?.products.map((product) => {
                    const counted = values[product.lineId] ?? "";
                    const difference =
                      counted.trim() === ""
                        ? null
                        : String(
                            Number(counted) - Number(product.expectedQuantity),
                          );
                    return (
                      <tr key={product.lineId}>
                        <td>
                          <strong>{product.name}</strong>
                          {product.packageSize && (
                            <small>{product.packageSize}</small>
                          )}
                        </td>
                        <td>{product.unitLabel}</td>
                        <td>{product.expectedQuantity}</td>
                        <td>
                          <input
                            aria-label={`Counted quantity for ${product.name}`}
                            inputMode="decimal"
                            min="0"
                            name={`quantity-${product.lineId}`}
                            onChange={(event) =>
                              setValues({
                                ...values,
                                [product.lineId]: event.target.value,
                              })
                            }
                            placeholder="0"
                            readOnly={!canEditDraft}
                            step={quantityStep(product.quantityScale)}
                            type="number"
                            value={counted}
                          />
                        </td>
                        <td className="count-difference">
                          {formatDifference(difference)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {canAccept && (
        <div className="count-accept-actions">
          <span className="count-accept-help">
            {remaining > 0
              ? "Every Product needs a counted quantity before this Count can be accepted."
              : "Ready to accept. Inventory will be adjusted for every difference."}
          </span>
          <button
            className="btn-primary"
            disabled={remaining > 0}
            formAction={acceptCountAction}
            type="submit"
          >
            Accept count
          </button>
        </div>
      )}
    </form>
  );
}

function CountHistoryList({
  history,
  locationName,
}: {
  history: CountHistoryRow[];
  locationName: string;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  return (
    <section className="count-history">
      <h2>Count history — {locationName}</h2>
      {history.length === 0 ? (
        <p className="muted">No Counts have been recorded yet.</p>
      ) : (
        <div className="count-history-head">
          <span>Date</span>
          <span>Status</span>
          <span>Accepted by</span>
          <span>Differences</span>
        </div>
      )}
      {history.map((count) => {
        const isViewing = viewingId === count.id;
        const differenceCount = count.lines.filter(
          (line) => line.difference && Number(line.difference) !== 0,
        ).length;
        return (
          <div className="count-history-row" key={count.id}>
            <div className="count-history-summary">
              <div className="count-history-columns">
                <span>{count.countDate}</span>
                <span>
                  <span
                    className={`count-status ${count.status.toLowerCase()}`}
                  >
                    {count.status}
                  </span>
                </span>
                <span>{count.acceptedBy ?? "—"}</span>
                <span>
                  {count.status === "ACCEPTED" ? differenceCount : "—"}
                </span>
              </div>
              <button
                className="btn-secondary compact-action"
                onClick={() => setViewingId(isViewing ? null : count.id)}
                type="button"
              >
                {isViewing ? "Hide" : "View"}
              </button>
            </div>
            {isViewing && (
              <div className="table-scroll">
                <table className="product-table count-review-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Counted as</th>
                      <th>Expected</th>
                      <th>Counted</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {count.lines.map((line) => (
                      <tr key={line.productName}>
                        <td>
                          <strong>{line.productName}</strong>
                        </td>
                        <td>{line.unitLabel}</td>
                        <td>{line.expectedQuantity}</td>
                        <td>{line.countedQuantity ?? "—"}</td>
                        <td>{formatDifference(line.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {count.notes && <p className="count-notes">{count.notes}</p>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
