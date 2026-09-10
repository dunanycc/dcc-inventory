"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pluralizeUnit } from "@/lib/format";

export type QuantitySource = "count" | "carry-forward" | "missing";

export type SeasonEntry = {
  season: number;
  startingQuantity: string | null;
  startingSource: QuantitySource;
  deliveredQuantity: string;
  endingQuantity: string | null;
  endingSource: QuantitySource;
  consumedQuantity: string | null;
  incompleteReasons: string[];
  yoyChange: string | null;
  yoyPercent: number | null;
};

export type ProductHistory = {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  unitLabel: string;
  seasons: SeasonEntry[];
};

function formatQty(value: string | null, unitLabel: string) {
  if (value === null) return "—";
  return `${value} ${pluralizeUnit(value, unitLabel).toLowerCase()}`;
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function sourceLabel(source: QuantitySource) {
  if (source === "count") return "counted";
  if (source === "carry-forward") return "carried forward";
  return "missing";
}

// A season with neither a starting nor an ending value has no historical
// footprint at all (never counted, and never mentioned in the imported
// legacy source) — distinct from a season that's simply missing one end.
function reviewCategory(reasons: string[]) {
  const missingStart = reasons.includes("missing starting quantity");
  const missingEnd = reasons.includes("missing ending quantity");
  if (missingStart && missingEnd) return "Not represented in historical source";
  if (missingStart) return "Missing starting quantity";
  if (missingEnd) return "Missing ending quantity";
  return "Incomplete";
}

export function HistoryWorkspace({
  categories,
  products,
  seasons,
}: {
  categories: string[];
  products: ProductHistory[];
  seasons: number[];
}) {
  const [tab, setTab] = useState<"consumption" | "overview" | "review">(
    "consumption",
  );

  const incompleteProducts = useMemo(
    () =>
      products.filter((product) =>
        product.seasons.some((season) => season.incompleteReasons.length > 0),
      ),
    [products],
  );

  return (
    <div className="history-workspace">
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Stock history views"
      >
        <button
          className={tab === "consumption" ? "active" : ""}
          onClick={() => setTab("consumption")}
          type="button"
        >
          Consumption
        </button>
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
          type="button"
        >
          Club-wide overview
        </button>
        <button
          className={tab === "review" ? "active" : ""}
          onClick={() => setTab("review")}
          type="button"
        >
          Needs review
          {incompleteProducts.length > 0 && (
            <span className="category-count">{incompleteProducts.length}</span>
          )}
        </button>
      </div>
      {tab === "consumption" && (
        <ConsumptionTab categories={categories} products={products} />
      )}
      {tab === "overview" && (
        <OverviewTab products={products} seasons={seasons} />
      )}
      {tab === "review" && (
        <ReviewTab
          currentSeason={seasons[seasons.length - 1]}
          products={incompleteProducts}
        />
      )}
    </div>
  );
}

function ConsumptionTab({
  categories,
  products,
}: {
  categories: string[];
  products: ProductHistory[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const visible =
    selectedCategory === "All"
      ? products
      : products.filter((p) => p.categoryName === selectedCategory);

  return (
    <section className="catalog-panel">
      <div
        className="category-tabs"
        role="tablist"
        aria-label="Product categories"
      >
        <button
          aria-selected={selectedCategory === "All"}
          className={selectedCategory === "All" ? "active" : ""}
          onClick={() => setSelectedCategory("All")}
          role="tab"
          type="button"
        >
          All
        </button>
        {categories.map((category) => (
          <button
            aria-selected={selectedCategory === category}
            className={selectedCategory === category ? "active" : ""}
            key={category}
            onClick={() => setSelectedCategory(category)}
            role="tab"
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="empty-inline">No Products in this category.</div>
      ) : (
        <div className="history-product-list">
          {visible.map((product) => (
            <HistoryProductCard
              key={product.productId}
              product={product}
              expanded={expandedId === product.productId}
              onToggle={() =>
                setExpandedId(
                  expandedId === product.productId ? null : product.productId,
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryProductCard({
  product,
  expanded,
  onToggle,
}: {
  product: ProductHistory;
  expanded: boolean;
  onToggle(): void;
}) {
  const latest = product.seasons[product.seasons.length - 1];
  return (
    <div className="history-product-card">
      <button
        className="history-product-header"
        onClick={onToggle}
        type="button"
      >
        <span>
          <strong>{product.productName}</strong>
          <small>
            {product.categoryName} · {product.unitLabel}
          </small>
        </span>
        <span
          className={`history-yoy ${latest?.yoyPercent && latest.yoyPercent > 0 ? "up" : latest?.yoyPercent && latest.yoyPercent < 0 ? "down" : ""}`}
        >
          {formatPercent(latest?.yoyPercent ?? null)}
        </span>
      </button>
      <div className="table-scroll">
        <table className="product-table history-season-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Starting</th>
              <th>Delivered</th>
              <th>Ending</th>
              <th>Consumed</th>
              <th>YoY</th>
            </tr>
          </thead>
          <tbody>
            {product.seasons.map((season) => (
              <tr key={season.season}>
                <td>{season.season}</td>
                <td>{formatQty(season.startingQuantity, product.unitLabel)}</td>
                <td>
                  {formatQty(season.deliveredQuantity, product.unitLabel)}
                </td>
                <td>{formatQty(season.endingQuantity, product.unitLabel)}</td>
                <td>
                  {season.consumedQuantity === null ? (
                    <span className="history-incomplete">Incomplete</span>
                  ) : (
                    formatQty(season.consumedQuantity, product.unitLabel)
                  )}
                </td>
                <td>{formatPercent(season.yoyPercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expanded && <ProductDetail product={product} />}
    </div>
  );
}

function ProductDetail({ product }: { product: ProductHistory }) {
  return (
    <div className="history-detail">
      <div className="history-detail-chart">
        <SeasonBarChart product={product} />
      </div>
      <div className="history-detail-calc">
        <h4>Calculation detail</h4>
        {product.seasons.map((season) => (
          <div className="history-calc-row" key={season.season}>
            <strong>{season.season}</strong>
            <span>
              Starting {formatQty(season.startingQuantity, product.unitLabel)}
              {season.startingQuantity !== null &&
                ` (${sourceLabel(season.startingSource)})`}
            </span>
            <span>
              + Delivered{" "}
              {formatQty(season.deliveredQuantity, product.unitLabel)}
            </span>
            <span>
              − Ending {formatQty(season.endingQuantity, product.unitLabel)}
              {season.endingQuantity !== null &&
                ` (${sourceLabel(season.endingSource)})`}
            </span>
            <span className="history-calc-total">
              = Consumed{" "}
              {season.consumedQuantity === null
                ? "incomplete"
                : formatQty(season.consumedQuantity, product.unitLabel)}
            </span>
            {season.incompleteReasons.length > 0 && (
              <small className="history-incomplete">
                {season.incompleteReasons.join("; ")}
              </small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SeasonBarChart({ product }: { product: ProductHistory }) {
  const values = product.seasons.map((season) => ({
    season: season.season,
    value:
      season.consumedQuantity === null ? null : Number(season.consumedQuantity),
  }));
  const max = Math.max(1, ...values.map((v) => v.value ?? 0));
  const width = 320;
  const height = 140;
  const barWidth = 72;
  const gap = 36;
  const startX =
    (width - (barWidth * values.length + gap * (values.length - 1))) / 2;

  return (
    <svg
      aria-label={`Consumption by season for ${product.productName}`}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      className="history-chart"
    >
      {values.map((entry, index) => {
        const x = startX + index * (barWidth + gap);
        const barHeight = entry.value === null ? 0 : (entry.value / max) * 92;
        const y = 108 - barHeight;
        return (
          <g key={entry.season}>
            <rect
              className={
                entry.value === null ? "history-bar missing" : "history-bar"
              }
              height={entry.value === null ? 2 : barHeight}
              width={barWidth}
              x={x}
              y={entry.value === null ? 106 : y}
              rx={4}
            />
            <text
              className="history-bar-value"
              textAnchor="middle"
              x={x + barWidth / 2}
              y={y - 6}
            >
              {entry.value === null ? "n/a" : entry.value}
            </text>
            <text
              className="history-bar-label"
              textAnchor="middle"
              x={x + barWidth / 2}
              y={126}
            >
              {entry.season}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type SortField = "productName" | "yoyPercent" | "yoyChange" | "incomplete";

function OverviewTab({
  products,
  seasons,
}: {
  products: ProductHistory[];
  seasons: number[];
}) {
  const [sortField, setSortField] = useState<SortField>("yoyPercent");
  const [sortDesc, setSortDesc] = useState(true);
  const latestSeason = seasons[seasons.length - 1];

  const rows = useMemo(() => {
    return products
      .map((product) => {
        const latest = product.seasons.find((s) => s.season === latestSeason);
        return {
          product,
          consumed: latest?.consumedQuantity ?? null,
          yoyChange: latest?.yoyChange ?? null,
          yoyPercent: latest?.yoyPercent ?? null,
          incomplete: latest ? latest.incompleteReasons.length > 0 : true,
        };
      })
      .sort((a, b) => {
        let result = 0;
        if (sortField === "productName")
          result = a.product.productName.localeCompare(b.product.productName);
        else if (sortField === "yoyPercent")
          result = (a.yoyPercent ?? -Infinity) - (b.yoyPercent ?? -Infinity);
        else if (sortField === "yoyChange")
          result = Number(a.yoyChange ?? 0) - Number(b.yoyChange ?? 0);
        else result = Number(a.incomplete) - Number(b.incomplete);
        return sortDesc ? -result : result;
      });
  }, [products, latestSeason, sortField, sortDesc]);

  function toggleSort(field: SortField) {
    if (field === sortField) setSortDesc((value) => !value);
    else {
      setSortField(field);
      setSortDesc(true);
    }
  }

  return (
    <section className="catalog-panel">
      <div className="table-toolbar">
        <div>
          <h2>Club-wide overview — Season {latestSeason}</h2>
          <p>
            Sort to find the biggest season-over-season movers, or the
            incomplete ones.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="product-table history-overview-table">
          <thead>
            <tr>
              <th>
                <button type="button" onClick={() => toggleSort("productName")}>
                  Product
                </button>
              </th>
              <th>Category</th>
              <th>Season {latestSeason} consumed</th>
              <th>
                <button type="button" onClick={() => toggleSort("yoyChange")}>
                  Change vs. last season
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("yoyPercent")}>
                  % change
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("incomplete")}>
                  Status
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(
              ({ product, consumed, yoyChange, yoyPercent, incomplete }) => (
                <tr key={product.productId}>
                  <td>
                    <strong>{product.productName}</strong>
                  </td>
                  <td>{product.categoryName}</td>
                  <td>{formatQty(consumed, product.unitLabel)}</td>
                  <td>{formatQty(yoyChange, product.unitLabel)}</td>
                  <td>{formatPercent(yoyPercent)}</td>
                  <td>
                    {incomplete ? (
                      <span className="history-incomplete">Needs review</span>
                    ) : (
                      "Complete"
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ReviewRow = {
  productId: string;
  productName: string;
  categoryName: string;
  season: number;
  reason: string;
};

function ReviewTab({
  products,
  currentSeason,
}: {
  products: ProductHistory[];
  currentSeason: number;
}) {
  const allRows = useMemo<ReviewRow[]>(
    () =>
      products.flatMap((product) =>
        product.seasons
          .filter((season) => season.incompleteReasons.length > 0)
          .map((season) => ({
            productId: product.productId,
            productName: product.productName,
            categoryName: product.categoryName,
            season: season.season,
            reason: reviewCategory(season.incompleteReasons),
          })),
      ),
    [products],
  );

  const productOptions = useMemo(
    () =>
      unique(allRows, (row) => row.productId).map((row) => ({
        value: row.productId,
        label: row.productName,
      })),
    [allRows],
  );
  const categoryOptions = useMemo(
    () =>
      unique(allRows, (row) => row.categoryName).map((row) => ({
        value: row.categoryName,
        label: row.categoryName,
      })),
    [allRows],
  );
  const seasonOptions = useMemo(
    () =>
      unique(allRows, (row) => String(row.season)).map((row) => ({
        value: String(row.season),
        label: `Season ${row.season}`,
      })),
    [allRows],
  );
  const reasonOptions = useMemo(
    () =>
      unique(allRows, (row) => row.reason).map((row) => ({
        value: row.reason,
        label: row.reason,
      })),
    [allRows],
  );

  const [selectedProducts, setSelectedProducts] = useState<Set<string> | null>(
    null,
  );
  const [selectedCategories, setSelectedCategories] =
    useState<Set<string> | null>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<Set<string> | null>(
    null,
  );
  const [selectedReasons, setSelectedReasons] = useState<Set<string> | null>(
    null,
  );
  // The current season's "missing ending quantity" is just the season being
  // in progress, not a data problem — it can't be filled in until the
  // season closes, so it is noise until then and is hidden by default.
  const [hideOpenSeasonEnding, setHideOpenSeasonEnding] = useState(true);

  const openSeasonEndingCount = allRows.filter(
    (row) =>
      row.season === currentSeason && row.reason === "Missing ending quantity",
  ).length;

  const rows = allRows.filter((row) => {
    if (selectedProducts && !selectedProducts.has(row.productId)) return false;
    if (selectedCategories && !selectedCategories.has(row.categoryName))
      return false;
    if (selectedSeasons && !selectedSeasons.has(String(row.season)))
      return false;
    if (selectedReasons && !selectedReasons.has(row.reason)) return false;
    if (
      hideOpenSeasonEnding &&
      row.season === currentSeason &&
      row.reason === "Missing ending quantity"
    )
      return false;
    return true;
  });

  if (products.length === 0)
    return (
      <section className="empty-panel">
        <h2>Nothing needs review</h2>
        <p>
          Every Product has starting, delivered, and ending data for every
          season.
        </p>
      </section>
    );
  return (
    <section className="catalog-panel">
      <div className="table-toolbar">
        <div>
          <h2>Needs review</h2>
          <p>
            These Products are missing data required to confidently calculate
            consumption. Nothing here was guessed.
          </p>
        </div>
      </div>
      <div className="review-filters">
        <FilterDropdown
          label="Product"
          options={productOptions}
          selected={selectedProducts}
          onChange={setSelectedProducts}
        />
        <FilterDropdown
          label="Category"
          options={categoryOptions}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />
        <FilterDropdown
          label="Season"
          options={seasonOptions}
          selected={selectedSeasons}
          onChange={setSelectedSeasons}
        />
        <FilterDropdown
          label="Reason"
          options={reasonOptions}
          selected={selectedReasons}
          onChange={setSelectedReasons}
        />
        <span className="review-filters-count">
          Showing {rows.length} of {allRows.length}
        </span>
      </div>
      {openSeasonEndingCount > 0 && (
        <p className="review-filters-note">
          {hideOpenSeasonEnding ? (
            <>
              Hiding {openSeasonEndingCount} row
              {openSeasonEndingCount === 1 ? "" : "s"} where Season{" "}
              {currentSeason} is just missing its ending count — expected until
              the season closes.{" "}
              <button
                onClick={() => setHideOpenSeasonEnding(false)}
                type="button"
              >
                Show anyway
              </button>
            </>
          ) : (
            <button onClick={() => setHideOpenSeasonEnding(true)} type="button">
              Hide Season {currentSeason}&apos;s missing ending count again
            </button>
          )}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="empty-inline">No rows match the current filters.</div>
      ) : (
        <div className="table-scroll">
          <table className="product-table history-review-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Season</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.productId}-${row.season}`}>
                  <td>
                    <strong>{row.productName}</strong>
                  </td>
                  <td>{row.categoryName}</td>
                  <td>Season {row.season}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function unique<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(item);
  }
  return result;
}

function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string> | null;
  onChange(next: Set<string> | null): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const activeCount = selected?.size ?? options.length;
  const isFiltered = selected !== null;

  function toggle(value: string) {
    const next = new Set(selected ?? options.map((option) => option.value));
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length ? null : next);
  }

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        aria-expanded={open}
        className={`filter-dropdown-trigger${isFiltered ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {label}
        {isFiltered && (
          <span className="filter-dropdown-count">{activeCount}</span>
        )}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="filter-dropdown-panel" role="menu">
          <div className="filter-dropdown-actions">
            <button onClick={() => onChange(null)} type="button">
              Select all
            </button>
            <button onClick={() => onChange(new Set())} type="button">
              Clear
            </button>
          </div>
          {options.map((option) => (
            <label className="filter-dropdown-option" key={option.value}>
              <input
                checked={selected?.has(option.value) ?? true}
                onChange={() => toggle(option.value)}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
