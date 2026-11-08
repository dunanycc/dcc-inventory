import { describe, it, expect } from "vitest";
import { receiptMime, sameOrigin } from "./order-receipts";
describe("private receipts", () => {
  it("uses file signatures rather than trusting an uploaded content type", () => {
    expect(receiptMime(new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(() =>
      receiptMime(new TextEncoder().encode("<script>alert(1)</script>")),
    ).toThrow();
  });
  it("rejects cross-origin uploads", () => {
    expect(
      sameOrigin(
        new Request("https://inventory.example.com/api", {
          headers: {
            origin: "https://evil.example.com",
            host: "inventory.example.com",
          },
        }),
      ),
    ).toBe(false);
    expect(
      sameOrigin(
        new Request("https://inventory.example.com/api", {
          headers: {
            origin: "https://inventory.example.com",
            host: "inventory.example.com",
          },
        }),
      ),
    ).toBe(true);
  });
});
