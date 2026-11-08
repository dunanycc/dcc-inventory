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
          <input type="hidden" name="items" value={JSON.stringify(items)} />
          <h2>2. Enter order</h2>
          <label className="order-field">
            Order date
            <input type="date" name="date" defaultValue={today} required />
          </label>
          <p>
            Order numbers are assigned separately for each vendor and year when
            saved.
          </p>
          {categories
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
          {!products.length && (
            <p>
              No active products are assigned to this vendor. Update Products
              first.
            </p>
          )}
          <label className="order-field">
            Notes
            <textarea name="notes" maxLength={1000} />
          </label>
          <p>{items.length} products selected</p>
          {items.length > 0 && <SubmitOrder>Save order</SubmitOrder>}
        </form>
      )}
    </section>
  );
}
