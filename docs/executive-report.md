# Executive view

Open History → Executive view. Select a year and toggle SAQ, Beer, Groceries or Private, matching Order Summary. Categories and products follow the catalog's display order. Category headings collapse the details while preserving subtotals.

The view shows distinct orders per product, ordered stock units, received stock units, opening stock, consumption, remaining stock, weighted average purchase cost per stock unit, and total purchase cost. Mapped legacy labels combine under the current catalog product so shared stock is counted once. Archived unmatched labels remain separate and have no inferred stock balance. Inactive products with purchases or nonzero stock remain represented.

- Purchase quantities use the order's saved units-per-entry conversion, never the product's current case size. Two cases of 24 are 48 cans.
- Line cost is received entry quantity × recorded price per entry, rounded to cents. Average cost is total received cost ÷ received stock units. Zero prices are valid. Missing prices make costs incomplete; subtotal rows retain the known cost rather than treating missing prices as zero.
- Separate order GST/PST amounts are not allocated to products. Recorded tax-inclusive prices remain tax-inclusive.
- Opening stock uses accepted seasonal starting counts, then prior closing counts, then recorded opening movements if no count exists. Current-year remaining stock is the live whole-club ledger balance; earlier years use accepted seasonal closing counts. Missing boundaries remain unavailable.
- Consumption = opening + non-private order units received during that calendar year − remaining. Receipt dates determine the consumption year; undated legacy receipts use their order year. Vendor toggles filter purchases and listed products; stock and consumption remain whole-club measures. Internal Bar/Starter Shack transfers cancel in the club-wide balance.
- Private purchases are separate, with no stock or consumption. Cancelled and merged orders are excluded.
- Order counts are distinct within each product/category/total. Category order counts are not sums of product counts. Quantity subtotals retain separate units instead of adding bottles, cans and kegs together; mixed-unit average costs are omitted.

Negative consumption is flagged for review. It can indicate receipts absent from purchase history, incorrect opening quantities, or inconsistent remaining stock. This view does not change source data or guess missing prices/balances. The current-year view is year to date rather than a frozen closing report.

## Display and exports

Product rows show the name without a can/bottle format label. All numeric columns are right-aligned. Club total retains distinct orders and purchase cost; quantity and average-unit-cost summaries are omitted there.

Export CSV and Export PDF use the selected year and vendor filters, include all filtered products even when categories are collapsed, and preserve report ordering and subtotals. CSV provides numeric product values plus section/category/row-type metadata, known cost and review notes; blanks are not converted to zero. Formula-like text is escaped for spreadsheet safety. PDF is a downloadable landscape report with repeated headings and page numbers. Exports are generated in the browser without sending report data to a third-party export service.

Historical opening balances can be corrected through Admin → Counts → Season opening quantities. Counts is located at `/settings/counts`; old `/counts` links redirect there while preserving location and year. Seasonal opening corrections affect reporting without changing live inventory.
