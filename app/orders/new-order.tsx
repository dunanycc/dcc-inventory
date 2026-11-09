"use client";
import { OrderQuantity } from "@/app/components/order-quantity";
import { Fragment, useState } from "react";
import { useFormStatus } from "react-dom";
import { PRIVATE_ORDER_UNITS } from "@/lib/purchase-order";
import { createOrderAction } from "@/app/(protected)/orders/actions";
export function SubmitOrder({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending} type="submit">
      {pending ? "Submitting…" : children}
    </button>
  );
}
function Trash() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}
type Category = {
  id: string;
  name: string;
  products: {
    id: string;
    name: string;
    vendorId: string;
    unit: string;
    factor: string;
    stockUnit: string;
  }[];
};
type Manual = { id: string; name: string; unit: string; quantity: string };
const emptyManual = (): Manual[] => [
  { id: "first", name: "", unit: "BOTTLE", quantity: "0" },
];
function quantitySummary(items: { quantity: number; unit: string }[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(item.unit, (counts.get(item.unit) || 0) + item.quantity);
  return [...counts]
    .map(([unit, n]) => `${n} ${unit.toLowerCase()}`)
    .join(" · ");
}
export function NewOrder({
  vendors,
  categories,
  today,
}: {
  vendors: { id: string; name: string }[];
  categories: Category[];
  today: string;
}) {
  const [vendor, setVendor] = useState(""),
    [isPrivate, setIsPrivate] = useState(false);
  const [manual, setManual] = useState(emptyManual),
    [values, setValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today),
    [notes, setNotes] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const vendorName = vendors.find((v) => v.id === vendor)?.name || "";
  const shown = categories
    .map((c) => ({
      ...c,
      products: c.products.filter((p) => p.vendorId === vendor),
    }))
    .filter((c) => c.products.length);
  const products = shown.flatMap((c) =>
    c.products.map((p) => ({ ...p, categoryName: c.name })),
  );
  const items = products
    .filter((p) => Number(values[p.id]) > 0)
    .map((p) => ({ productId: p.id, quantity: values[p.id] }));
  const cart = isPrivate
    ? manual
        .filter((l) => Number(l.quantity) > 0)
        .map((l) => ({
          id: l.id,
          name: l.name || "Unnamed private product",
          unit: l.unit,
          quantity: Number(l.quantity),
          categoryName: "Private products",
        }))
    : products
        .filter((p) => Number(values[p.id]) > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          quantity: Number(values[p.id]),
          categoryName: p.categoryName,
        }));
  const setQuantity = (id: string, n: number) =>
    isPrivate
      ? setManual((old) =>
          old.map((l) => (l.id === id ? { ...l, quantity: String(n) } : l)),
        )
      : setValues((old) => ({ ...old, [id]: String(n) }));
  const clear = () => {
    setValues({});
    setManual((old) => old.map((l) => ({ ...l, quantity: "0" })));
  };
  return (
    <form
      className="order-panel new-order-workspace"
      action={createOrderAction}
      onSubmit={(e) => {
        if (!cart.length) {
          e.preventDefault();
          return;
        }
        const summary = cart
          .map((l) => `${l.name}: ${l.quantity} ${l.unit}`)
          .join("\n");
        if (
          !window.confirm(
            `Submit this ${isPrivate ? "private " : ""}${vendorName} order dated ${date}?\n\n${summary}`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="vendorId" value={vendor} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(isPrivate ? [] : items)}
      />
      <input
        type="hidden"
        name="manualItems"
        value={JSON.stringify(
          isPrivate
            ? manual
                .filter((l) => Number(l.quantity) > 0)
                .map(({ name, unit, quantity }) => ({ name, unit, quantity }))
            : [],
        )}
      />
      <header className="order-builder-header">
        <div className="order-vendor-selector">
          <span>Vendor</span>
          <div
            className="order-vendor-pills"
            role="group"
            aria-label="Select vendor"
          >
            {vendors.map((v) => (
              <button
                type="button"
                className={`btn-secondary ${vendor === v.id ? "is-selected" : ""}`}
                aria-pressed={vendor === v.id}
                key={v.id}
                onClick={() => {
                  if (v.id !== vendor) {
                    setVendor(v.id);
                    setValues({});
                    setManual(emptyManual());
                    setNotes("");
                  }
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
        <label className="product-check order-private-toggle">
          <input
            type="checkbox"
            role="switch"
            name="isPrivate"
            checked={isPrivate}
            disabled={!vendor}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private order
        </label>
      </header>
      {!vendor ? (
        <p className="order-empty-cart">Select a vendor to start an order.</p>
      ) : (
        <div className="order-builder-layout">
          <div className="order-builder-products">
            {isPrivate ? (
              <section>
                <p className="order-muted">
                  Enter private products for {vendorName}. These stay outside
                  the catalog and club inventory.
                </p>
                <div className="table-scroll">
                  <table className="inventory-table order-builder-table private-builder-table">
                    <colgroup>
                      <col className="builder-product-column" />
                      <col className="builder-unit-column" />
                      <col className="builder-quantity-column" />
                      <col className="builder-remove-column" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Unit</th>
                        <th>Quantity</th>
                        <th>
                          <span className="visually-hidden">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {manual.map((line, index) => (
                        <tr key={line.id}>
                          <td>
                            <input
                              aria-label={`Private product ${index + 1}`}
                              value={line.name}
                              maxLength={160}
                              required={Number(line.quantity) > 0}
                              onChange={(e) =>
                                setManual((old) =>
                                  old.map((l) =>
                                    l.id === line.id
                                      ? { ...l, name: e.target.value }
                                      : l,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Private unit ${index + 1}`}
                              value={line.unit}
                              onChange={(e) =>
                                setManual((old) =>
                                  old.map((l) =>
                                    l.id === line.id
                                      ? { ...l, unit: e.target.value }
                                      : l,
                                  ),
                                )
                              }
                            >
                              {PRIVATE_ORDER_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit.charAt(0) + unit.slice(1).toLowerCase()}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <OrderQuantity
                              privateIndex={index + 1}
                              label={`private product ${index + 1}`}
                              value={Number(line.quantity)}
                              onChange={(n) => setQuantity(line.id, n)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-secondary cart-trash"
                              type="button"
                              aria-label={`Remove private product ${index + 1}`}
                              onClick={() =>
                                setManual((old) =>
                                  old.filter((l) => l.id !== line.id),
                                )
                              }
                            >
                              <Trash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={manual.length >= 200}
                  onClick={() =>
                    setManual((old) => [
                      ...old,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        unit: "BOTTLE",
                        quantity: "0",
                      },
                    ])
                  }
                >
                  Add private product
                </button>
              </section>
            ) : products.length ? (
              <div className="table-scroll">
                <table className="inventory-table order-builder-table">
                  <colgroup>
                    <col className="builder-product-column" />
                    <col className="builder-unit-column" />
                    <col className="builder-quantity-column" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Order unit</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <Fragment key={c.id}>
                        <tr className="order-builder-category">
                          <th colSpan={3}>
                            <button
                              type="button"
                              aria-expanded={!collapsed.includes(c.id)}
                              onClick={() =>
                                setCollapsed((old) =>
                                  old.includes(c.id)
                                    ? old.filter((id) => id !== c.id)
                                    : [...old, c.id],
                                )
                              }
                            >
                              <span aria-hidden="true">
                                {collapsed.includes(c.id) ? "▸" : "▾"}
                              </span>{" "}
                              {c.name}
                            </button>
                          </th>
                        </tr>
                        {!collapsed.includes(c.id) &&
                          c.products.map((p) => (
                            <tr key={p.id}>
                              <th scope="row">{p.name}</th>
                              <td>
                                {p.unit}
                                {p.factor !== "1" && (
                                  <small className="order-muted">
                                    {p.factor} {p.stockUnit}
                                  </small>
                                )}
                              </td>
                              <td>
                                <OrderQuantity
                                  label={p.name}
                                  value={Number(values[p.id] || 0)}
                                  onChange={(n) => setQuantity(p.id, n)}
                                />
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No active products are assigned to this vendor. Update Products
                first.
              </p>
            )}
          </div>
          <aside className="order-cart" aria-label="Order in progress">
            <header>
              <h2>Order in progress</h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={clear}
                disabled={!cart.length}
              >
                Clear
              </button>
            </header>
            <p className="cart-vendor">
              {vendorName}
              {isPrivate ? " · Private" : ""}
            </p>
            {!cart.length && (
              <p className="order-empty-cart">
                Add products to start this order.
              </p>
            )}
            {[...new Set(cart.map((l) => l.categoryName))].map((category) => (
              <section className="cart-category" key={category}>
                <h3>{category}</h3>
                {cart
                  .filter((l) => l.categoryName === category)
                  .map((l) => (
                    <div className="cart-line" key={l.id}>
                      <div>
                        <span>{l.name}</span>
                        <small>{l.unit}</small>
                      </div>
                      <OrderQuantity
                        label={`cart ${l.name}`}
                        value={l.quantity}
                        onChange={(n) => setQuantity(l.id, n)}
                      />
                      <button
                        type="button"
                        className="btn-secondary cart-trash"
                        aria-label={`Remove ${l.name} from cart`}
                        onClick={() => setQuantity(l.id, 0)}
                      >
                        <Trash />
                      </button>
                    </div>
                  ))}
                <p className="cart-subtotal">
                  Subtotal{" "}
                  <span>
                    {quantitySummary(
                      cart.filter((l) => l.categoryName === category),
                    )}
                  </span>
                </p>
              </section>
            ))}
            <div className="cart-counts">
              <p>
                Products <span>{cart.length}</span>
              </p>
              {!!cart.length && (
                <p>
                  Quantity <span>{quantitySummary(cart)}</span>
                </p>
              )}
            </div>
            <label className="order-field">
              Order date
              <input
                type="date"
                name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="order-field">
              Comments
              <textarea
                name="notes"
                rows={3}
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {!!cart.length && <SubmitOrder>Submit order</SubmitOrder>}
            <small className="order-muted">
              Order numbers are assigned for each vendor and year when
              submitted.
            </small>
          </aside>
        </div>
      )}
    </form>
  );
}
