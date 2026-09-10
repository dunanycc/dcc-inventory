import { describe, expect, it } from "vitest";
import {
  calculateCountAcceptance,
  InventoryCountError,
  isValidSeasonYear,
  normalizeCountedQuantity,
  normalizeDraftCountedQuantity,
  normalizeSeasonYear,
  requireAcceptPermission,
  requireDraftPermission,
  seasonOpeningCountDate,
  seasonOpeningSourceId,
} from "./inventory-count";

const admin = {
  id: "admin",
  role: "ADMINISTRATOR" as const,
  status: "ACTIVE" as const,
};
const manager = {
  id: "mgr",
  role: "INVENTORY_MANAGER" as const,
  status: "ACTIVE" as const,
};
const shackStaff = {
  id: "shack",
  role: "INVENTORY_USER" as const,
  status: "ACTIVE" as const,
};
const readOnly = {
  id: "ro",
  role: "READ_ONLY" as const,
  status: "ACTIVE" as const,
};
const wholeUnit = { allowFractionalStock: false, quantityScale: 0 };
const fractional = { allowFractionalStock: true, quantityScale: 1 };

describe("requireDraftPermission / requireAcceptPermission", () => {
  it("allows Administrator and Inventory Manager to draft and accept", () => {
    for (const actor of [admin, manager]) {
      expect(() => requireDraftPermission(actor)).not.toThrow();
      expect(() => requireAcceptPermission(actor)).not.toThrow();
    }
  });

  it("allows Inventory User to draft but not accept", () => {
    expect(() => requireDraftPermission(shackStaff)).not.toThrow();
    expect(() => requireAcceptPermission(shackStaff)).toThrow("FORBIDDEN");
  });

  it("allows Read Only to do neither", () => {
    expect(() => requireDraftPermission(readOnly)).toThrow("FORBIDDEN");
    expect(() => requireAcceptPermission(readOnly)).toThrow("FORBIDDEN");
  });

  it("rejects a disabled actor regardless of role", () => {
    expect(() =>
      requireDraftPermission({ ...admin, status: "DISABLED" }),
    ).toThrow("FORBIDDEN");
  });
});

describe("normalizeCountedQuantity", () => {
  it("allows zero, unlike a movement quantity", () => {
    expect(normalizeCountedQuantity("0", wholeUnit)).toBe("0");
  });

  it("rejects a negative count", () => {
    expect(() => normalizeCountedQuantity("-1", wholeUnit)).toThrow(
      "INVALID_INPUT",
    );
  });

  it("rejects fractional input for a whole-unit product", () => {
    expect(() => normalizeCountedQuantity("2.5", wholeUnit)).toThrow(
      "INVALID_INPUT",
    );
  });

  it("accepts fractional input within the product's scale", () => {
    expect(normalizeCountedQuantity("2.5", fractional)).toBe("2.5");
  });

  it("rejects more decimal places than the product's scale allows", () => {
    expect(() => normalizeCountedQuantity("2.55", fractional)).toThrow(
      "INVALID_INPUT",
    );
  });
});

describe("normalizeDraftCountedQuantity", () => {
  it("normalizes blank input to null instead of throwing", () => {
    expect(normalizeDraftCountedQuantity("  ", wholeUnit)).toBeNull();
  });

  it("still validates a non-blank value", () => {
    expect(() => normalizeDraftCountedQuantity("abc", wholeUnit)).toThrow(
      InventoryCountError,
    );
  });
});

describe("calculateCountAcceptance", () => {
  const line = (
    overrides: Partial<
      Parameters<typeof calculateCountAcceptance>[2][number]
    > = {},
  ) => ({
    id: "line-1",
    productId: "product-1",
    expectedQuantity: "10",
    countedQuantity: "10",
    product: wholeUnit,
    ...overrides,
  });

  it("computes a positive difference (more counted than expected)", () => {
    const [result] = calculateCountAcceptance(admin, "DRAFT", [
      line({ countedQuantity: "13" }),
    ]);
    expect(result.difference).toBe("3");
    expect(result.differenceIsZero).toBe(false);
  });

  it("computes a negative difference (less counted than expected)", () => {
    const [result] = calculateCountAcceptance(admin, "DRAFT", [
      line({ countedQuantity: "6" }),
    ]);
    expect(result.difference).toBe("-4");
  });

  it("flags a zero difference so no movement is posted for it", () => {
    const [result] = calculateCountAcceptance(admin, "DRAFT", [line()]);
    expect(result.difference).toBe("0");
    expect(result.differenceIsZero).toBe(true);
  });

  it("rejects acceptance by someone without post permission", () => {
    expect(() =>
      calculateCountAcceptance(shackStaff, "DRAFT", [line()]),
    ).toThrow("FORBIDDEN");
  });

  it("rejects a count that is not DRAFT", () => {
    expect(() => calculateCountAcceptance(admin, "ACCEPTED", [line()])).toThrow(
      "NOT_DRAFT",
    );
  });

  it("rejects acceptance when a line has no counted quantity yet", () => {
    expect(() =>
      calculateCountAcceptance(admin, "DRAFT", [
        line({ countedQuantity: null }),
      ]),
    ).toThrow("INCOMPLETE");
  });

  it("rejects acceptance with no lines at all", () => {
    expect(() => calculateCountAcceptance(admin, "DRAFT", [])).toThrow(
      "INVALID_INPUT",
    );
  });
});

describe("isValidSeasonYear / normalizeSeasonYear", () => {
  it("accepts a plausible four-digit year", () => {
    expect(isValidSeasonYear(2026)).toBe(true);
    expect(normalizeSeasonYear("2026")).toBe(2026);
  });

  it("rejects a non-integer or out-of-range year", () => {
    expect(isValidSeasonYear(2026.5)).toBe(false);
    expect(isValidSeasonYear(1999)).toBe(false);
    expect(isValidSeasonYear(2101)).toBe(false);
    expect(() => normalizeSeasonYear("not-a-year")).toThrow("INVALID_INPUT");
  });
});

describe("seasonOpeningSourceId / seasonOpeningCountDate", () => {
  it("is deterministic per Location and year, so re-saving updates the same record", () => {
    expect(seasonOpeningSourceId("BAR", 2025)).toBe("BAR-2025-start");
    expect(seasonOpeningSourceId("BAR", 2025)).toBe(
      seasonOpeningSourceId("BAR", 2025),
    );
    expect(seasonOpeningSourceId("BAR", 2025)).not.toBe(
      seasonOpeningSourceId("STARTER_SHACK", 2025),
    );
  });

  it("anchors to the last day of the season's Jan-Jun start window", () => {
    const date = seasonOpeningCountDate(2025);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(5);
    expect(date.getUTCDate()).toBe(30);
  });
});
