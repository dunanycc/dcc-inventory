import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OrderQuantity } from "./order-quantity";
afterEach(cleanup);
it("keeps Add and increase on the same button so repeated clicks add units", () => {
  function Quantity() {
    const [value, setValue] = useState(0);
    return <OrderQuantity label="Cola" value={value} onChange={setValue} />;
  }
  render(<Quantity />);
  const add = screen.getByRole("button", { name: "Add Cola" });
  fireEvent.click(add);
  expect(screen.getByRole("button", { name: "Increase Cola" })).toBe(add);
  fireEvent.click(add);
  expect(screen.getByLabelText("Quantity for Cola")).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("button", { name: "Decrease Cola" }));
  expect(screen.getByLabelText("Quantity for Cola")).toHaveTextContent("1");
});
