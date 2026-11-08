"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PRIVATE_ORDER_UNITS } from "@/lib/purchase-order";
import { createOrderAction } from "@/app/(protected)/orders/actions";
export function SubmitOrder({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending} type="submit">
      {pending ? "Saving…" : children}
    </button>
  );
}
export function NewOrder({
  vendors,
  categories,
  today,
}: {
  vendors: { id: string; name: string }[];
  categories: {
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
  }[];
  today: string;
}) {
  const [vendor, setVendor] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [manual, setManual] = useState([
    { id: "first", name: "", unit: "BOTTLE", quantity: "0" },
  ]);
  const [values, setValues] = useState<Record<string, string>>({});
  const products = categories
    .flatMap((c) => c.products)
    .filter((p) => p.vendorId === vendor);
  const items = products
    .filter((p) => Number(values[p.id]) > 0)
    .map((p) => ({ productId: p.id, quantity: values[p.id] }));
  return (
    <section className="order-panel">
      <h2>1. Select vendor</h2>
      <label className="order-field">
        Vendor
        <select
          value={vendor}
          onChange={(e) => {
            setVendor(e.target.value);
            setValues({});
            setManual([
              { id: "first", name: "", unit: "BOTTLE", quantity: "0" },
            ]);
          }}
        >
          <option value="">Choose vendor</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {vendor && (
        <form action={createOrderAction} key={vendor}>
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
                    .filter((line) => Number(line.quantity) > 0)
                    .map(({ name, unit, quantity }) => ({
                      name,
                      unit,
                      quantity,
                    }))
                : [],
            )}
          />
          <h2>2. Enter order</h2>
          <label className="product-check order-private-toggle">
            <input
              type="checkbox"
              role="switch"
              name="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />{" "}
            Private order
          </label>
          {isPrivate && (
            <p>
              Enter products manually for{" "}
              {vendors.find((v) => v.id === vendor)?.name}. These products will
              not be added to the catalog or club inventory.
            </p>
          )}
          <label className="order-field">
            Order date
            <input type="date" name="date" defaultValue={today} required />
          </label>
          <p>
            Order numbers are assigned separately for each vendor and year when
            saved.
          </p>
          {!isPrivate &&
            categories
              .filter((c) => c.products.some((p) => p.vendorId === vendor))
              .map((c) => (
                <section key={c.id}>
                  <h3>{c.name}</h3>
                  <div className="table-scroll">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Order unit</th>
                          <th>Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.products
                          .filter((p) => p.vendorId === vendor)
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.name}</td>
                              <td>
                                {p.unit}
                                {p.factor !== "1" && (
                                  <small>
                                    {" "}
                                    ({p.factor} {p.stockUnit})
                                  </small>
                                )}
                              </td>
                              <td>
                                <input
                                  aria-label={`Quantity for ${p.name}`}
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  className="order-number"
                                  value={values[p.id] ?? ""}
                                  onChange={(e) =>
                                    setValues({
                                      ...values,
                                      [p.id]: e.target.value,
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
          {!isPrivate && !products.length && (
            <p>
              No active products are assigned to this vendor. Update Products
              first.
            </p>
          )}
          {isPrivate && (
            <section>
              <h3>Private products</h3>
              {manual.map((line, index) => (
                <div className="manual-order-line" key={line.id}>
                  <label className="order-field">
                    Product name
                    <input
                      aria-label={`Private product ${index + 1}`}
                      value={line.name}
                      maxLength={160}
                      required={Number(line.quantity) > 0}
                      onChange={(e) =>
                        setManual(
                          manual.map((l) =>
                            l.id === line.id
                              ? { ...l, name: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="order-field">
                    Unit
                    <select
                      aria-label={`Private unit ${index + 1}`}
                      value={line.unit}
                      onChange={(e) =>
                        setManual(
                          manual.map((l) =>
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
                  </label>
                  <div className="order-field">
                    <span>Quantity</span>
                    <div
                      className="private-quantity-stepper"
                      role="group"
                      aria-label={`Quantity for private product ${index + 1}`}
                    >
                      {Number(line.quantity) === 0 ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={`Add quantity for private product ${index + 1}`}
                          onClick={() =>
                            setManual(
                              manual.map((l) =>
                                l.id === line.id ? { ...l, quantity: "1" } : l,
                              ),
                            )
                          }
                        >
                          Add
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label={`Decrease private quantity ${index + 1}`}
                            onClick={() =>
                              setManual(
                                manual.map((l) =>
                                  l.id === line.id
                                    ? {
                                        ...l,
                                        quantity: String(
                                          Number(l.quantity) - 1,
                                        ),
                                      }
                                    : l,
                                ),
                              )
                            }
                          >
                            −
                          </button>
                          <output
                            aria-label={`Private quantity ${index + 1}`}
                            aria-live="polite"
                          >
                            {line.quantity}
                          </output>
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label={`Increase private quantity ${index + 1}`}
                            disabled={Number(line.quantity) >= 999999999}
                            onClick={() =>
                              setManual(
                                manual.map((l) =>
                                  l.id === line.id
                                    ? {
                                        ...l,
                                        quantity: String(
                                          Number(l.quantity) + 1,
                                        ),
                                      }
                                    : l,
                                ),
                              )
                            }
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-secondary private-product-trash"
                    type="button"
                    title="Remove product"
                    aria-label={`Remove private product ${index + 1}`}
                    onClick={() =>
                      setManual(manual.filter((l) => l.id !== line.id))
                    }
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className="btn-secondary"
                type="button"
                disabled={manual.length >= 200}
                onClick={() =>
                  setManual([
                    ...manual,
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
          )}
          <label className="order-field">
            Notes
            <textarea name="notes" maxLength={1000} />
          </label>
          <p>
            {isPrivate
              ? manual.filter((line) => Number(line.quantity) > 0).length
              : items.length}{" "}
            products selected
          </p>
          {(isPrivate
            ? manual.some((line) => Number(line.quantity) > 0)
            : items.length > 0) && <SubmitOrder>Save order</SubmitOrder>}
        </form>
      )}
    </section>
  );
}
