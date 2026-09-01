import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryManagementClient } from "./category-management-client";

vi.mock("./category-actions", () => ({
  createCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  reorderCategoriesAction: vi
    .fn()
    .mockResolvedValue({ ok: true, message: "Category order saved." }),
  setCategoryActiveAction: vi.fn(),
}));

afterEach(cleanup);

describe("CategoryManagementClient", () => {
  it("reorders categories with accessible handles and hides manual order controls", () => {
    render(
      <CategoryManagementClient
        categories={[
          { id: "wine", name: "Wine", displayOrder: 0, active: true },
          { id: "beer", name: "Beer", displayOrder: 1, active: true },
        ]}
      />,
    );
    expect(screen.queryByText("Display order")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save order" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Order$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ID /)).not.toBeInTheDocument();
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Beer/ }), {
      key: "ArrowUp",
    });
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Beer"),
      expect.stringContaining("Wine"),
    ]);
  });
});
