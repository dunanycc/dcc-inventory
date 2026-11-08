import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
import Page from "./page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not consume an email token or set cookies while rendering", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({
        email: "test@example.com",
        token: "test-token",
      }),
    }),
  );
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Continue to inventory" }),
  ).toBeInTheDocument();
});
it("rejects an incomplete email link", async () => {
  await expect(
    Page({ searchParams: Promise.resolve({ email: "test@example.com" }) }),
  ).rejects.toThrow("/sign-in?error=1");
});
