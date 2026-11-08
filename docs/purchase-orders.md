# Purchasing orders and legacy history

## Workflow

- **Order** chooses one active Vendor first. The server accepts only active Products assigned to that Vendor. Saving allocates the next number in the selected order date's year, independently for each Vendor. It does not post inventory.
- **Orders** shows pending and received orders. Product name, Category, Vendor name, purchasing unit, and unit conversion are snapshots. Later catalog changes do not rewrite old orders.
- Receiving starts from ordered quantities. Adjust each received quantity and enter the price per displayed purchasing unit. Tax included is checked initially; GST and PST are disabled and contribute zero additional tax. Unchecking it enables manual dollar amounts. Grand total uses received quantities, line amounts rounded to cents, and any manually entered taxes. Missing prices are unavailable rather than zero.
- Finalize closes the order even for short/over deliveries. It creates a Delivery and validated Bar receipt movements atomically for positive received lines. Zero received lines post no stock. A finalized order cannot be received twice. Stock corrections to finalized live orders continue through the existing Delivery correction workflow.
- **Order History** filters by Vendor/year and displays products against order columns. Dragging the heading, using arrow keys on its Move button, or choosing a position moves the entire order. The current Vendor/year sequence is renumbered in one Serializable transaction; other groups and the underlying order/receipt identities are unchanged.
- Pending orders allow quantity, date, and notes corrections. Imported historical records also allow Vendor and received-quantity corrections, with a required reason. Those historical corrections never adjust stock. Changing a historical Vendor/year appends to the destination sequence; it closes gaps in the old sequence. Reposition afterward in Order History.

## Private receipts

Receipts can be attached after an order is saved, either by file selection or phone camera capture. Files are stored as private database bytes, not in the repository or public assets. Uploads require an active posting user, same-origin request, supported file signature, and a maximum of 3 MB per file (20 files per order). PDF, JPEG, PNG, WebP, and HEIC are accepted. Downloads require an active inventory workspace user and are served as attachments with no public caching. Uploading never sends a receipt to a Vendor.

## Legacy import

Open **Order History → Import legacy orders**, choose the original `.xlsx` workbook, and review the preview before confirming. The workbook must have Orders and Products sheets with the original IDs and headers. Workbooks are processed privately, not committed. Only 2025 and 2026 received orders are imported; cancelled orders are excluded. Every legacy order is split by historical Vendor:

- SAQ: Wine and Hard Liquor.
- Beer: Beer, Beer Kegs, Non-alcohol Beer, and historical Mixed Drinks.
- Groceries: Mixers & Misc.

The source identity is the legacy order GUID plus Vendor, not a mutable label or sequence number. Duplicate labels are retained as distinct orders when their GUIDs differ. Retired or unmatched Products are preserved as historical labels with the original Product GUID; imports do not create replacement catalog Products. Original stock-unit quantities are kept rather than applying today's case conversion.

Prices remain null. Raw order labels, dates, notes, and file hash are retained. The source Order Date is used when its year matches the source order's year; missing/conflicting dates remain null. Label/date and note-date issues are shown in the preview and retained as notes for correction. No missing date is estimated. New order numbers are assigned chronologically from the available source dates, separately per Vendor/year; they can subsequently be repositioned.

Imports create historical order records only. They never create Deliveries, InventoryMovements, or opening balances. Existing `legacy-orders` Delivery lines are linked only for an unambiguous Product/received-quantity match. Unmatched historical receipt links remain empty and do not imply missing stock. Repeated imports skip existing source identities, including records subsequently corrected by a user. The entire write runs as one transaction.

## Verification

`npm test`, `npm run lint`, and `npm run build` validate the app. `npm run test:orders:postgres` is a **destructive disposable-database** integration rehearsal: set TEST_DATABASE_URL and DATABASE_URL to the same separately named test database in that isolated process; unset DATABASE_URL_UNPOOLED or set it to that same test URL. It applies all migrations from scratch, checks authorization, Vendor restrictions, per-year numbering, unit snapshots, short receipts, total calculations, duplicate-finalization rejection, whole-order moves, rollback, import splitting/idempotence, historical correction, and receipt storage. Never supply the application database to it.

The hand-authored purchasing migration follows `docs/master-data-foundation.md`. Production deployment runs migrations before building; preview builds do not migrate shared production data. Print/email output is deferred to a later phase.

## Private orders

After selecting a Vendor, turn on **Private order** to enter manual product names, displayed units, and quantities. The order keeps the selected Vendor and shares that Vendor/year's numbering sequence. Manual items are saved only on the order; no catalog Products are created. Receiving still supports quantity adjustments, unit prices, manual taxes, and receipt attachments, but finalization creates neither Deliveries nor InventoryMovements and does not require an active Bar location.

Private orders are labelled in Orders and Order History. Orders can filter to Private or Inventory; history has an Include private orders checkbox. This is a purchasing classification, not a separate access-control role: existing inventory workspace permissions still apply.

The legacy import preview has a **Private** checkbox for each Vendor-split order. Select it for non-inventory purchases before confirming import. Their original names, units (or the source's explicit missing-unit placeholder), quantities, and Vendor are retained as manual order lines with no catalog or receipt-line links. Unmatched/retired Products are not automatically classified as private. Repeated imports skip previously imported records rather than overwriting their classification. Existing historical records can be marked Private through Correct order details, with a reason; historical corrections do not reverse or repost stock.
