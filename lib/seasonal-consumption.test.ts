import { describe, expect, it } from "vitest";
import {
  calculateConsumption,
  calculateYoy,
  classifyCountDate,
  combineAcceptedSnapshots,
  resolveSeasonBoundaries,
} from "./seasonal-consumption";

describe("classifyCountDate", () => {
  it("treats January-June as a season start", () => {
    expect(classifyCountDate(new Date(Date.UTC(2026, 3, 15)))).toEqual({
      year: 2026,
      role: "start",
    });
    expect(classifyCountDate(new Date(Date.UTC(2026, 5, 30)))).toEqual({
      year: 2026,
      role: "start",
    });
  });

  it("treats July-December as a season end", () => {
    expect(classifyCountDate(new Date(Date.UTC(2025, 9, 31)))).toEqual({
      year: 2025,
      role: "end",
    });
    expect(classifyCountDate(new Date(Date.UTC(2025, 11, 31)))).toEqual({
      year: 2025,
      role: "end",
    });
  });
});

describe("combineAcceptedSnapshots", () => {
  it("sums the latest count per Location within the same bucket", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "c1",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 1)),
        countedQuantity: "10",
      },
      {
        countId: "c2",
        locationId: "shack",
        countDate: new Date(Date.UTC(2025, 9, 5)),
        countedQuantity: "3",
      },
    ]);
    expect(buckets.get("2025-end")).toEqual({
      quantity: "13",
      countIds: ["c1", "c2"],
    });
  });

  it("keeps only the latest count per Location when duplicates fall in the same bucket", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "old",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 1)),
        countedQuantity: "10",
      },
      {
        countId: "new",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 15)),
        countedQuantity: "6",
      },
    ]);
    expect(buckets.get("2025-end")).toEqual({
      quantity: "6",
      countIds: ["new"],
    });
  });

  it("does not block a bucket when only one Location has a count", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "c1",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 1)),
        countedQuantity: "10",
      },
    ]);
    expect(buckets.get("2025-end")).toEqual({
      quantity: "10",
      countIds: ["c1"],
    });
  });
});

describe("resolveSeasonBoundaries", () => {
  it("prefers a direct start count over carry-forward", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "start-2026",
        locationId: "bar",
        countDate: new Date(Date.UTC(2026, 3, 1)),
        countedQuantity: "50",
      },
      {
        countId: "end-2025",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 1)),
        countedQuantity: "18",
      },
    ]);
    const { starting } = resolveSeasonBoundaries(buckets, 2026);
    expect(starting).toEqual({
      quantity: "50",
      source: "count",
      countIds: ["start-2026"],
    });
  });

  it("carries the prior season's ending forward when no direct start count exists", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "end-2025",
        locationId: "bar",
        countDate: new Date(Date.UTC(2025, 9, 1)),
        countedQuantity: "18",
      },
    ]);
    const { starting } = resolveSeasonBoundaries(buckets, 2026);
    expect(starting).toEqual({
      quantity: "18",
      source: "carry-forward",
      countIds: ["end-2025"],
    });
  });

  it("reports starting as missing when there is nothing to carry forward", () => {
    const { starting, ending } = resolveSeasonBoundaries(new Map(), 2026);
    expect(starting).toEqual({
      quantity: null,
      source: "missing",
      countIds: [],
    });
    expect(ending).toEqual({ quantity: null, source: "missing", countIds: [] });
  });

  it("never carries an ending quantity forward from a later season", () => {
    const buckets = combineAcceptedSnapshots([
      {
        countId: "start-2026",
        locationId: "bar",
        countDate: new Date(Date.UTC(2026, 3, 1)),
        countedQuantity: "50",
      },
    ]);
    const { ending } = resolveSeasonBoundaries(buckets, 2025);
    expect(ending).toEqual({ quantity: null, source: "missing", countIds: [] });
  });
});

describe("calculateConsumption", () => {
  it("computes starting + delivered - ending exactly", () => {
    expect(
      calculateConsumption({
        startingQuantity: "22",
        deliveredQuantity: "140",
        endingQuantity: "18",
      }),
    ).toEqual({ consumedQuantity: "144", incompleteReasons: [] });
  });

  it("keeps fractional precision without floating-point drift", () => {
    expect(
      calculateConsumption({
        startingQuantity: "5.25",
        deliveredQuantity: "10",
        endingQuantity: "4.25",
      }).consumedQuantity,
    ).toBe("11");
  });

  it("flags a missing starting quantity instead of guessing", () => {
    const result = calculateConsumption({
      startingQuantity: null,
      deliveredQuantity: "10",
      endingQuantity: "5",
    });
    expect(result.consumedQuantity).toBeNull();
    expect(result.incompleteReasons).toContain("missing starting quantity");
  });

  it("flags a missing ending quantity instead of guessing", () => {
    const result = calculateConsumption({
      startingQuantity: "5",
      deliveredQuantity: "10",
      endingQuantity: null,
    });
    expect(result.consumedQuantity).toBeNull();
    expect(result.incompleteReasons).toContain("missing ending quantity");
  });

  it("reports both reasons when both are missing", () => {
    const result = calculateConsumption({
      startingQuantity: null,
      deliveredQuantity: "10",
      endingQuantity: null,
    });
    expect(result.incompleteReasons).toHaveLength(2);
  });
});

describe("calculateYoy", () => {
  it("computes an exact-decimal change and a percentage", () => {
    const result = calculateYoy("640", "568");
    expect(result.change).toBe("72");
    expect(result.percent).toBeCloseTo(12.676, 2);
  });

  it("returns null when either side is missing", () => {
    expect(calculateYoy(null, "568")).toEqual({ change: null, percent: null });
    expect(calculateYoy("640", null)).toEqual({ change: null, percent: null });
  });

  it("returns a null percent when the prior year was zero (avoids divide-by-zero)", () => {
    const result = calculateYoy("10", "0");
    expect(result.change).toBe("10");
    expect(result.percent).toBeNull();
  });

  it("computes a negative change for decreased consumption", () => {
    const result = calculateYoy("400", "568");
    expect(result.change).toBe("-168");
    expect(result.percent).toBeLessThan(0);
  });
});
