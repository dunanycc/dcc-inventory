import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FulfillmentQueue, NewStockRequest } from "./stock-request-client";

vi.mock("@/app/(protected)/requests/actions", () => ({
  submitStockRequestAction: vi.fn(),
  fulfillStockRequestAction: vi.fn(),
  cancelStockRequestAction: vi.fn(),
  closeStockRequestAction: vi.fn(),
  updateRequestNotificationSettingsAction: vi.fn(),
}));
afterEach(cleanup);

describe("NewStockRequest", () => {
  it("shows horizontal category tabs and accumulates repeated additions", () => {
    render(
      <NewStockRequest
        categories={[
          {
            id: "beer",
            name: "Beer",
            products: [
              {
                id: "p1",
                name: "Sapporo",
                unit: "Can · 500 mL",
                quantityScale: 0,
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Beer")).toBeInTheDocument();
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity for Sapporo"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(
      12,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(
      24,
    );
    expect(
      screen.getByRole("button", { name: "Submit Request" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Sapporo" }));
    expect(screen.getByText("Add items to get started.")).toBeInTheDocument();
  });

  it("shows a full confirmation dialog before submitting", () => {
    render(
      <NewStockRequest
        categories={[
          {
            id: "beer",
            name: "Beer",
            products: [
              {
                id: "p1",
                name: "Sapporo",
                unit: "Can · 500 mL",
                quantityScale: 0,
              },
            ],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      screen.getByRole("dialog", { name: "Confirm Request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Request" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close and Update" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Requested quantity for Sapporo")).toHaveValue(
      1,
    );
  });
});

describe("FulfillmentQueue", () => {
  it("prefills Giving now with the outstanding requested quantity", () => {
    render(
      <FulfillmentQueue
        notificationSettings={{ orderNotificationEmail: "orders@example.com" }}
        requests={[
          {
            id: "request",
            requestedAt: "2026-09-01T12:00:00.000Z",
            completedAt: null,
            closureComment: null,
            requestedBy: "Jayem",
            status: "PARTIALLY_GIVEN",
            notes: null,
            lines: [
              {
                id: "line",
                productName: "Guinness",
                unit: "Can · 440 mL",
                quantityScale: 0,
                requested: "5",
                given: "2",
                givenAt: "2026-09-01T13:00:00.000Z",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Give Guinness")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Give Stock" })).toBeEnabled();
    expect(screen.getAllByText(/2026-09-01/)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Close Request" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Close comment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Request" }));
    expect(
      screen.getByRole("dialog", { name: "Close Request" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Close comment")).toBeRequired();
    expect(screen.getByLabelText("Close comment")).toHaveAttribute("rows", "3");
    expect(
      screen.getByRole("button", { name: "Confirm Close" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Request #/)).not.toBeInTheDocument();
  });

  it("hides completed requests until requested", () => {
    render(
      <FulfillmentQueue
        notificationSettings={{ orderNotificationEmail: "" }}
        requests={[
          {
            id: "done",
            requestedAt: "2026-08-30T12:00:00.000Z",
            completedAt: "2026-09-01T12:00:00.000Z",
            closureComment: null,
            requestedBy: "Jayem",
            status: "GIVEN",
            notes: null,
            lines: [
              {
                id: "line",
                productName: "Sapporo",
                unit: "Can",
                quantityScale: 0,
                requested: "2",
                given: "2",
                givenAt: "2026-09-01T12:00:00.000Z",
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.queryByText("Sapporo")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "View completed requests (1)" }),
    );
    expect(screen.getByText("Sapporo")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });
});

it("saves separate new-request and requester notification addresses", () => {
  render(
    <FulfillmentQueue
      notificationSettings={{
        orderNotificationEmail: "orders@example.com",
        requesterNotificationEmail: "shack@example.com",
      }}
      requests={[]}
    />,
  );
  const order = screen.getByLabelText(
    "Order notification email",
  ) as HTMLInputElement;
  const requester = screen.getByLabelText(
    "Requester notification email",
  ) as HTMLInputElement;
  expect(order).toHaveValue("orders@example.com");
  expect(requester).toHaveValue("shack@example.com");
  const data = new FormData(order.closest("form")!);
  expect(data.get("orderNotificationEmail")).toBe("orders@example.com");
  expect(data.get("requesterNotificationEmail")).toBe("shack@example.com");
});
