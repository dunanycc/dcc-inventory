import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import CountsRedirect from "@/app/(protected)/counts/page";
it("preserves location and historical opening year when redirecting old Counts links", async () => {
  await expect(
    CountsRedirect({
      searchParams: Promise.resolve({
        location: "BAR",
        openingYear: "2026",
        success: "Saved & checked",
      }),
    }),
  ).rejects.toThrow(
    "/settings/counts?location=BAR&openingYear=2026&success=Saved+%26+checked",
  );
});
it("redirects the old Counts root to the Admin subpage", async () => {
  await expect(
    CountsRedirect({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("/settings/counts");
});
