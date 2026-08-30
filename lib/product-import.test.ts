import { describe, expect, it } from "vitest";
import { parseProductImportCsv } from "./product-import";

const header = "source_id,category,product,stock_unit,stock_unit_label,package_size,bar,starter_shack";

describe("Product CSV import", () => {
  it("parses quoted values and availability", () => {
    const result = parseProductImportCsv(`${header}\nbeer-1,Beer,"Lager, Tall Can",CAN,,473 mL,yes,true`);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ sourceId: "beer-1", category: "Beer", product: "Lager, Tall Can", stockUnit: "CAN", bar: true, starterShack: true });
  });

  it("rejects duplicate identities, invalid units, and Shack-only Products", () => {
    const result = parseProductImportCsv(`${header}\np1,Beer,Lager,CASE,,,no,yes\np1,Beer,Stout,CAN,,,yes,no`);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("stock_unit must be"),
      expect.stringContaining("must also be available at the Bar"),
      expect.stringContaining("duplicate source_id"),
    ]));
  });

  it("requires the stable identity and core Product columns", () => {
    expect(parseProductImportCsv("category,product\nBeer,Lager").errors).toEqual(expect.arrayContaining([
      "Missing required column: source_id.",
      "Missing required column: stock_unit.",
    ]));
  });

  it("accepts the current worksheet export and ignores quantity history columns", () => {
    const csv = "ID,Category,Description,Unit Format,Unit Measurement,Order Unit,Visible,Opening Count,Consumed,StarterShack\nlegacy-31,Beer,Sapporo,Can,500ml,24,TRUE,0,64,TRUE";
    const result = parseProductImportCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ sourceId: "legacy-31", category: "Beer", product: "Sapporo", stockUnit: "CAN", packageSize: "500ml", bar: true, starterShack: true });
  });

  it("recovers the worksheet's reversed, descriptive, and blank unit values with warnings", () => {
    const csv = "ID,Category,Description,Unit Format,Unit Measurement,Order Unit,Visible,Opening Count,Consumed,StarterShack\nslim,Non-alcohol Beer,Carlsberg 0%,Slim Can,330ml,24,,0,0,FALSE\nchips,Food,Chips,75gm,bag,30,,0,0,\nmixer,Mixers & Misc,Coke,,,,,0,0,\nliquor,Hard Liquor,Fireball,750,,,,0,0,FALSE\nclaw,Mixed Drinks,White Claw,355ml,can,24,,0,0,TRUE";
    const result = parseProductImportCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => [row.sourceId, row.stockUnit, row.packageSize])).toEqual([
      ["slim", "CAN", "330ml"],
      ["chips", "PACKAGE", "75gm"],
      ["mixer", "EACH", null],
      ["liquor", "BOTTLE", "750 mL"],
      ["claw", "CAN", "355ml"],
    ]);
    expect(result.warnings).toHaveLength(5);
  });
});
