export const PRODUCT_IMPORT_HEADERS = [
  "source_id",
  "category",
  "product",
  "stock_unit",
  "stock_unit_label",
  "package_size",
  "bar",
  "starter_shack",
] as const;

const STOCK_UNITS = new Set([
  "CAN",
  "BOTTLE",
  "KEG",
  "EACH",
  "PACKAGE",
  "OTHER",
]);
const TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0", ""]);
const HEADER_ALIASES: Record<string, string> = {
  id: "source_id",
  description: "product",
  unit_format: "stock_unit",
  unit_measurement: "package_size",
  startershack: "starter_shack",
};
const IGNORED_WORKSHEET_HEADERS = new Set([
  "order_unit",
  "visible",
  "opening_count",
  "consumed",
]);

export type ProductImportRow = {
  line: number;
  sourceId: string;
  category: string;
  product: string;
  stockUnit: "CAN" | "BOTTLE" | "KEG" | "EACH" | "PACKAGE" | "OTHER";
  stockUnitLabel: string | null;
  packageSize: string | null;
  bar: boolean;
  starterShack: boolean;
};

export type ProductImportPreview = {
  rows: ProductImportRow[];
  errors: string[];
  warnings: string[];
};

function csvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((item) => item.some((value) => value.trim()));
}

function booleanValue(
  value: string,
  line: number,
  column: string,
  errors: string[],
) {
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  errors.push(`Line ${line}: ${column} must be yes or no.`);
  return false;
}

export function parseProductImportCsv(text: string): ProductImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  let records: string[][];
  try {
    records = csvRecords(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      rows: [],
      errors: [
        error instanceof Error ? error.message : "The CSV could not be read.",
      ],
      warnings,
    };
  }
  if (!records.length)
    return { rows: [], errors: ["The CSV is empty."], warnings };
  const headers = records[0].map((value) => {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    return HEADER_ALIASES[normalized] ?? normalized;
  });
  const required = ["source_id", "category", "product", "stock_unit"];
  for (const header of required)
    if (!headers.includes(header))
      errors.push(`Missing required column: ${header}.`);
  const unexpected = headers.filter(
    (header) =>
      header &&
      !(PRODUCT_IMPORT_HEADERS as readonly string[]).includes(header) &&
      !IGNORED_WORKSHEET_HEADERS.has(header),
  );
  if (unexpected.length)
    errors.push(
      `Unexpected column${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  if (new Set(headers).size !== headers.length)
    errors.push("Column names must be unique.");
  if (errors.length) return { rows: [], errors, warnings };
  if (records.length > 1001)
    return {
      rows: [],
      errors: ["A single import may contain at most 1,000 Products."],
      warnings,
    };

  const column = (name: string) => headers.indexOf(name);
  const value = (record: string[], name: string) =>
    column(name) < 0 ? "" : (record[column(name)] ?? "").trim();
  const seen = new Set<string>();
  const rows = records
    .slice(1)
    .map((record, index): ProductImportRow | null => {
      const line = index + 2;
      const sourceId = value(record, "source_id");
      const category = value(record, "category").replace(/\s+/g, " ");
      const product = value(record, "product").replace(/\s+/g, " ");
      const requestedStockUnit = value(record, "stock_unit");
      const requestedPackageSize = value(record, "package_size");
      let stockUnit = requestedStockUnit.toUpperCase();
      let packageSize = requestedPackageSize || null;
      if (stockUnit === "SLIM CAN") {
        stockUnit = "CAN";
        warnings.push(`Line ${line}: Slim Can was imported as CAN.`);
      } else if (!stockUnit) {
        stockUnit = "EACH";
        warnings.push(
          `Line ${line}: blank Unit Format was imported as EACH; review this Product before entering inventory.`,
        );
      } else if (!STOCK_UNITS.has(stockUnit)) {
        const adjacentUnit = requestedPackageSize.trim().toUpperCase();
        const adjacentMapping: Record<string, ProductImportRow["stockUnit"]> = {
          CAN: "CAN",
          "SLIM CAN": "CAN",
          BOTTLE: "BOTTLE",
          BAG: "PACKAGE",
        };
        if (adjacentMapping[adjacentUnit]) {
          stockUnit = adjacentMapping[adjacentUnit];
          packageSize = requestedStockUnit;
          warnings.push(
            `Line ${line}: Unit Format and Unit Measurement appeared reversed; imported as ${stockUnit}.`,
          );
        } else if (
          category.toLowerCase() === "hard liquor" &&
          /^\d+(?:\.\d+)?\s*(?:ml|l)?$/i.test(requestedStockUnit)
        ) {
          stockUnit = "BOTTLE";
          packageSize = /[a-z]/i.test(requestedStockUnit)
            ? requestedStockUnit
            : `${requestedStockUnit} mL`;
          warnings.push(
            `Line ${line}: Hard Liquor volume was imported as BOTTLE.`,
          );
        }
      }
      const stockUnitLabel = value(record, "stock_unit_label") || null;
      if (!sourceId || sourceId.length > 180)
        errors.push(
          `Line ${line}: source_id is required and may contain at most 180 characters.`,
        );
      else if (seen.has(sourceId))
        errors.push(`Line ${line}: duplicate source_id ${sourceId}.`);
      else seen.add(sourceId);
      if (!category || category.length > 120)
        errors.push(
          `Line ${line}: category is required and may contain at most 120 characters.`,
        );
      if (!product || product.length > 160)
        errors.push(
          `Line ${line}: product is required and may contain at most 160 characters.`,
        );
      if (!STOCK_UNITS.has(stockUnit))
        errors.push(
          `Line ${line}: stock_unit must be CAN, BOTTLE, KEG, EACH, PACKAGE, or OTHER.`,
        );
      if (stockUnit === "OTHER" && !stockUnitLabel)
        errors.push(
          `Line ${line}: stock_unit_label is required when stock_unit is OTHER.`,
        );
      if (stockUnit !== "OTHER" && stockUnitLabel)
        errors.push(
          `Line ${line}: stock_unit_label is only allowed when stock_unit is OTHER.`,
        );
      if (stockUnitLabel && stockUnitLabel.length > 80)
        errors.push(
          `Line ${line}: stock_unit_label may contain at most 80 characters.`,
        );
      if (packageSize && packageSize.length > 120)
        errors.push(
          `Line ${line}: package_size may contain at most 120 characters.`,
        );
      const bar = booleanValue(
        value(record, "bar") || "yes",
        line,
        "bar",
        errors,
      );
      const starterShack = booleanValue(
        value(record, "starter_shack"),
        line,
        "starter_shack",
        errors,
      );
      if (starterShack && !bar)
        errors.push(
          `Line ${line}: Starter Shack Products must also be available at the Bar.`,
        );
      if (!sourceId || !category || !product || !STOCK_UNITS.has(stockUnit))
        return null;
      return {
        line,
        sourceId,
        category,
        product,
        stockUnit: stockUnit as ProductImportRow["stockUnit"],
        stockUnitLabel,
        packageSize,
        bar,
        starterShack,
      };
    })
    .filter((row): row is ProductImportRow => row !== null);
  if (!rows.length && !errors.length)
    errors.push("The CSV does not contain any Product rows.");
  return { rows, errors, warnings };
}
