import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountWorkspace } from "./count-client";

vi.mock("@/app/(protected)/counts/actions", () => ({
  acceptCountAction: vi.fn(),
  cancelCountAction: vi.fn(),
  saveCountDraftAction: vi.fn(),
  setSeasonOpeningAction: vi.fn(),
  startCountAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(cleanup);

const location = { id: "bar", code: "BAR", name: "Bar" };

describe("CountWorkspace season opening panel", () => {
  it("stays hidden until toggled, then shows the prefilled quantity", () => {
    render(
      <CountWorkspace
        canAccept
        canSetSeasonOpening
        canEditDraft={false}
        draft={null}
        history={[]}
        locations={[location]}
        seasonOpening={{
          year: 2025,
          entries: [
            {
              productId: "p1",
              name: "Red wine",
              categoryName: "Wine",
              unitLabel: "BOTTLE",
              quantityScale: 0,
              value: "12",
            },
          ],
        }}
        selectedLocation={location}
      />,
    );
    expect(screen.queryByText("Red wine")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Set season opening quantities" }),
    );
    expect(screen.getByText("Red wine")).toBeInTheDocument();
    expect(
      screen.getByLabelText("2025 opening quantity for Red wine"),
    ).toHaveValue(12);
    expect(
      screen.getByRole("button", { name: "Save 2025 opening quantities" }),
    ).toBeInTheDocument();
  });

  it("groups products under a category subtitle instead of repeating it per row", () => {
    render(
      <CountWorkspace
        canAccept
        canSetSeasonOpening
        canEditDraft={false}
        draft={null}
        history={[]}
        locations={[location]}
        seasonOpening={{
          year: 2025,
          entries: [
            {
              productId: "p1",
              name: "Red wine",
              categoryName: "Wine",
              unitLabel: "BOTTLE",
              quantityScale: 0,
              value: "12",
            },
            {
              productId: "p2",
              name: "White wine",
              categoryName: "Wine",
              unitLabel: "BOTTLE",
              quantityScale: 0,
              value: null,
            },
            {
              productId: "p3",
              name: "Dark rum",
              categoryName: "Hard Liquor",
              unitLabel: "BOTTLE",
              quantityScale: 0,
              value: null,
            },
          ],
        }}
        selectedLocation={location}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Set season opening quantities" }),
    );
    expect(screen.getAllByText("Wine")).toHaveLength(1);
    expect(screen.getAllByText("Hard Liquor")).toHaveLength(1);
  });

  it("defaults an unrecorded quantity to 0 instead of blank", () => {
    render(
      <CountWorkspace
        canAccept
        canSetSeasonOpening
        canEditDraft={false}
        draft={null}
        history={[]}
        locations={[location]}
        seasonOpening={{
          year: 2025,
          entries: [
            {
              productId: "p1",
              name: "Sparkling Wine",
              categoryName: "Wine",
              unitLabel: "BOTTLE",
              quantityScale: 0,
              value: null,
            },
          ],
        }}
        selectedLocation={location}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Set season opening quantities" }),
    );
    expect(
      screen.getByLabelText("2025 opening quantity for Sparkling Wine"),
    ).toHaveValue(0);
  });

  it("navigates via the router (not a full page reload) when the season year changes", () => {
    render(
      <CountWorkspace
        canAccept
        canSetSeasonOpening
        canEditDraft={false}
        draft={null}
        history={[]}
        locations={[location]}
        seasonOpening={{ year: 2025, entries: [] }}
        selectedLocation={location}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Set season opening quantities" }),
    );
    fireEvent.change(screen.getByLabelText("Season"), {
      target: { value: "2024" },
    });
    expect(push).toHaveBeenCalledWith(
      "/settings/counts?location=BAR&openingYear=2024",
    );
  });

  it("does not render for a role without accept permission", () => {
    render(
      <CountWorkspace
        canEditDraft
        canAccept={false}
        canSetSeasonOpening={false}
        draft={null}
        history={[]}
        locations={[location]}
        seasonOpening={{ year: 2025, entries: [] }}
        selectedLocation={location}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Set season opening quantities" }),
    ).not.toBeInTheDocument();
  });
});

it("offers historical count editing only to users who can accept counts", () => {
  const history = [
    {
      id: "accepted",
      revision: "version",
      countDate: "2026-11-08",
      status: "ACCEPTED" as const,
      notes: null,
      createdBy: "Manager",
      acceptedBy: "Manager",
      acceptedAt: null,
      lines: [],
    },
  ];
  const props = {
    canSetSeasonOpening: false,
    canEditDraft: false,
    draft: null,
    history,
    locations: [location],
    selectedLocation: location,
    seasonOpening: { year: 2026, entries: [] },
  };
  const { rerender } = render(<CountWorkspace {...props} canAccept={false} />);
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  rerender(<CountWorkspace {...props} canAccept />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(
    screen.getByRole("dialog", { name: "Edit historical count — 2026-11-08" }),
  ).toBeInTheDocument();
});
