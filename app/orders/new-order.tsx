"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
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
    { id: "first", name: "", unit: "BOTTLE", quantity: "1" },
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
              { id: "first", name: "", unit: "BOTTLE", quantity: "1" },
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
                ? manual.map(({ name, unit, quantity }) => ({
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
                      required
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
                    <input
                      aria-label={`Private unit ${index + 1}`}
                      value={line.unit}
                      maxLength={80}
                      required
                      placeholder="Bottle, case, keg…"
                      onChange={(e) =>
                        setManual(
                          manual.map((l) =>
                            l.id === line.id
                              ? { ...l, unit: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="order-field">
                    Quantity
                    <input
                      aria-label={`Private quantity ${index + 1}`}
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={line.quantity}
                      required
                      onChange={(e) =>
                        setManual(
                          manual.map((l) =>
                            l.id === line.id
                              ? { ...l, quantity: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="btn-secondary"
                    type="button"
                    aria-label={`Remove private product ${index + 1}`}
                    disabled={manual.length === 1}
                    onClick={() =>
                      setManual(manual.filter((l) => l.id !== line.id))
                    }
                  >
                    Remove
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
                      quantity: "1",
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
          <p>{isPrivate ? manual.length : items.length} products selected</p>
          {(isPrivate || items.length > 0) && (
            <SubmitOrder>Save order</SubmitOrder>
          )}
        </form>
      )}
    </section>
  );
}
