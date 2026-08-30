import { describe, expect, it } from "vitest";
import { deriveRequestStatus, requestProductEligible, StockRequestError, validateFulfillment, validateRequestSubmission, type RequestProduct } from "./stock-request";

const product: RequestProduct = { id: "p1", active: true, starterShackRequestEligible: true, allowFractionalStock: false, quantityScale: 0, barEligible: true, shackEligible: true };
const actor = { id: "u1", role: "INVENTORY_USER" as const, status: "ACTIVE" as const };

describe("Starter Shack requests", () => {
  it("requires the Product to be eligible at both Locations", () => {
    expect(requestProductEligible(product)).toBe(true);
    expect(requestProductEligible({ ...product, shackEligible: false })).toBe(false);
  });

  it("allows an Inventory User to submit valid stock-unit quantities", () => {
    expect(validateRequestSubmission(actor, [{ productId: "p1", quantity: "12" }], new Map([["p1", product]]))).toEqual([{ productId: "p1", quantity: "12" }]);
  });

  it("derives submitted, partial, and given status", () => {
    expect(deriveRequestStatus([{ requestedQuantity: "20", quantityGiven: "0" }])).toBe("SUBMITTED");
    expect(deriveRequestStatus([{ requestedQuantity: "20", quantityGiven: "12" }])).toBe("PARTIALLY_GIVEN");
    expect(deriveRequestStatus([{ requestedQuantity: "20", quantityGiven: "20" }])).toBe("GIVEN");
  });

  it("requires posting permission and prevents over-fulfillment or negative Bar stock", () => {
    const line = { id: "l1", productId: "p1", requestedQuantity: "20", quantityGiven: "12", product };
    const args = ["SUBMITTED", [{ lineId: "l1", quantity: "8" }], new Map([["l1", line]]), new Map([["p1", product]]), new Map([["p1", "8"]])] as const;
    expect(() => validateFulfillment(actor, ...args)).toThrowError(new StockRequestError("FORBIDDEN"));
    expect(validateFulfillment({ ...actor, role: "INVENTORY_MANAGER" }, ...args)).toEqual([{ lineId: "l1", productId: "p1", quantity: "8" }]);
    expect(() => validateFulfillment({ ...actor, role: "INVENTORY_MANAGER" }, "SUBMITTED", [{ lineId: "l1", quantity: "9" }], args[2], args[3], new Map([["p1", "20"]]))).toThrowError(new StockRequestError("OVER_FULFILLMENT"));
    expect(() => validateFulfillment({ ...actor, role: "INVENTORY_MANAGER" }, "SUBMITTED", [{ lineId: "l1", quantity: "8" }], args[2], args[3], new Map([["p1", "7"]]))).toThrowError(new StockRequestError("INSUFFICIENT_STOCK"));
  });
});
