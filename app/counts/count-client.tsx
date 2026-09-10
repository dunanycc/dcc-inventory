"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  acceptCountAction,
  cancelCountAction,
  saveCountDraftAction,
  setSeasonOpeningAction,
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
  productId: string;
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

export type SeasonOpeningEntry = {
  productId: string;
  name: string;
  categoryName: string;
  unitLabel: string;
  quantityScale: number;
  value: string | null;
};

export type SeasonOpeningData = {
  year: number;
  entries: SeasonOpeningEntry[];
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
  canSetSeasonOpening,
  seasonOpening,
  draft,
  history,
  locations,
  selectedLocation,
}: {
  canEditDraft: boolean;
  canAccept: boolean;
  canSetSeasonOpening: boolean;
  seasonOpening: SeasonOpeningData;
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
      {canSetSeasonOpening && (
        <SeasonOpeningPanel
          seasonOpening={seasonOpening}
          selectedLocation={selectedLocation}
        />
      )}
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

function SeasonOpeningPanel({
  seasonOpening,
  selectedLocation,
}: {
  seasonOpening: SeasonOpeningData;
  selectedLocation: CountLocationOption;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const currentYear = new Date().getFullYear();
  const yearOptions = new Set(
    [currentYear + 1, currentYear, currentYear - 1, currentYear - 2].concat(
      seasonOpening.year,
    ),
  );
  // Entries arrive pre-sorted by category, so adjacent same-category runs
  // can just be grouped in a single pass rather than re-sorted here.
  const groupedEntries = useMemo(() => {
    const groups: { categoryName: string; entries: SeasonOpeningEntry[] }[] =
      [];
    for (const entry of seasonOpening.entries) {
      const currentGroup = groups[groups.length - 1];
      if (currentGroup?.categoryName === entry.categoryName)
        currentGroup.entries.push(entry);
      else groups.push({ categoryName: entry.categoryName, entries: [entry] });
    }
    return groups;
  }, [seasonOpening.entries]);

  return (
    <section className="catalog-panel">
      <div className="table-toolbar">
        <div>
          <h2>Season opening quantities</h2>
          <p>
            Set or correct each Product&apos;s starting quantity for a
            season&apos;s Stock History report. This does not change the live
            tracked balance.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => setShow((value) => !value)}
          type="button"
        >
          {show ? "Cancel" : "Set season opening quantities"}
        </button>
      </div>
      {show && (
        <>
          <div className="season-opening-year">
            <label>
              Season
              <select
                onChange={(event) =>
                  router.push(
                    `/counts?location=${encodeURIComponent(selectedLocation.code)}&openingYear=${event.target.value}`,
                  )
                }
                value={seasonOpening.year}
              >
                {[...yearOptions]
                  .sort((a, b) => b - a)
                  .map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <form
            action={setSeasonOpeningAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `Save ${seasonOpening.year} opening quantities for ${selectedLocation.name}? Blank fields with a previously saved value will be cleared.`,
                )
              )
                event.preventDefault();
            }}
          >
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
            <input name="year" type="hidden" value={seasonOpening.year} />
            <div className="table-scroll">
              <table className="product-table count-table season-opening-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Counted as</th>
                    <th>{seasonOpening.year} opening quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedEntries.map((group) => (
                    <Fragment key={group.categoryName}>
                      <tr className="product-table-group">
                        <td colSpan={3}>{group.categoryName}</td>
                      </tr>
                      {group.entries.map((entry) => (
                        <tr key={entry.productId}>
                          <td>
                            <strong>{entry.name}</strong>
                          </td>
                          <td>{entry.unitLabel}</td>
                          <td>
                            <input
                              aria-label={`${seasonOpening.year} opening quantity for ${entry.name}`}
                              defaultValue={entry.value ?? "0"}
                              inputMode="decimal"
                              key={`${seasonOpening.year}-${entry.productId}`}
                              min="0"
                              name={`quantity-${entry.productId}`}
                              step={quantityStep(entry.quantityScale)}
                              type="number"
                            />
                            <input
                              name="productId"
                              type="hidden"
                              value={entry.productId}
                            />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="count-accept-actions">
              <span className="count-accept-help">
                Products with no recorded value default to 0. Clear a field
                entirely to leave it unset for this season instead.
              </span>
              <button className="btn-primary" type="submit">
                Save {seasonOpening.year} opening quantities
              </button>
            </div>
          </form>
        </>
      )}
    </section>
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
                      <tr key={line.productId}>
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
