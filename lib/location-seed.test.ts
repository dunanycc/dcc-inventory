import { describe, expect, it, vi } from "vitest";
import { seedStructuralLocations } from "./location-seed";

describe("structural Location seed", () => {
  it("uses create-if-missing semantics and delegates no update operation", async () => {
    const createMissingLocations = vi.fn(async () => ({ count: 0 }));
    await seedStructuralLocations({ createMissingLocations });
    expect(createMissingLocations).toHaveBeenCalledWith([
      { code: "BAR", name: "Bar", active: true },
      { code: "STARTER_SHACK", name: "Starter Shack", active: true },
    ]);
  });
});
