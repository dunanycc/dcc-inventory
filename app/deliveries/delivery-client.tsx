"use client";

import { useMemo, useState } from "react";
import { postDeliveryAction } from "@/app/(protected)/deliveries/actions";
import { pluralizeUnit } from "@/lib/format";

export type DeliveryCategory = {
  id: string;
  name: string;
  products: Array<{
    id: string;
    name: string;
    stockUnit: string;
    quantityScale: number;
    purchaseUnit: string | null;
    unitsPerPurchaseUnit: string | null;
  }>;
};

export function NewDelivery({
  categories,
  vendors,
}: {
  categories: DeliveryCategory[];
  vendors: Array<{ id: string; name: string }>;
}) {
  const [selected, setSelected] = useState(categories[0]?.id ?? "");
  const [items, setItems] = useState<Record<string, string>>({});
  const products = useMemo(
    () =>
      new Map(
        categories
          .flatMap((category) => category.products)
          .map((product) => [product.id, product]),
      ),
    [categories],
  );
  const chosen = Object.entries(items).filter(
    ([, quantity]) => Number(quantity) > 0,
  );
  const category =
    categories.find((candidate) => candidate.id === selected) ?? categories[0];

  function removeItem(productId: string) {
    setItems((current) => ({ ...current, [productId]: "0" }));
  }

  return (
    <form action={postDeliveryAction} className="delivery-form">
      <div className="delivery-meta">
        <label>
          Vendor
          <select name="vendorId">
            <option value="">No vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Delivery date
          <input
            defaultValue={new Date().toISOString().slice(0, 10)}
            name="deliveryDate"
            required
            type="date"
          />
        </label>
        <label>
          Notes (optional)
          <input maxLength={1000} name="notes" />
        </label>
      </div>
      <div className="delivery-workspace">
        <section className="delivery-catalog">
          <div
            aria-label="Product categories"
            className="category-tabs"
            role="tablist"
          >
            {categories.map((candidate) => (
              <button
                aria-selected={selected === candidate.id}
                className={selected === candidate.id ? "active" : ""}
                key={candidate.id}
                onClick={() => setSelected(candidate.id)}
                role="tab"
                type="button"
              >
                {candidate.name}
                <span aria-hidden="true" className="category-count">
                  {candidate.products.length}
                </span>
              </button>
            ))}
          </div>
          <div className="delivery-products">
            <div className="delivery-product-header">
              <span>Product</span>
              <span>Format</span>
              <span>Quantity</span>
            </div>
            {category?.products.map((product) => (
              <label key={product.id}>
                <strong>{product.name}</strong>
                <span className="delivery-format">
                  {product.purchaseUnit && product.unitsPerPurchaseUnit
                    ? `${product.purchaseUnit} · ${product.unitsPerPurchaseUnit} ${pluralizeUnit(product.unitsPerPurchaseUnit, product.stockUnit)} each`
                    : product.stockUnit}
                </span>
                <input
                  aria-label={`Quantity received for ${product.name}`}
                  min="0"
                  onChange={(event) =>
                    setItems({ ...items, [product.id]: event.target.value })
                  }
                  step={
                    !product.purchaseUnit && product.quantityScale ? 0.01 : 1
                  }
                  type="number"
                  value={items[product.id] ?? "0"}
                />
              </label>
            ))}
          </div>
        </section>
        <aside className="delivery-summary">
          <header>
            <strong>Delivery Summary</strong>
          </header>
          <div>
            {chosen.length ? (
              <ul>
                {chosen.map(([id, quantity]) => {
                  const product = products.get(id)!;
                  const actual = product.unitsPerPurchaseUnit
                    ? Number(quantity) * Number(product.unitsPerPurchaseUnit)
                    : Number(quantity);
                  return (
                    <li key={id}>
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {product.purchaseUnit && product.unitsPerPurchaseUnit
                            ? `${quantity} ${pluralizeUnit(quantity, product.purchaseUnit).toLowerCase()} × ${product.unitsPerPurchaseUnit} = `
                            : ""}
                          {actual}{" "}
                          {pluralizeUnit(
                            actual,
                            product.stockUnit,
                          ).toLowerCase()}
                        </small>
                      </span>
                      <button
                        aria-label={`Remove ${product.name} from delivery`}
                        className="delivery-remove-item"
                        onClick={() => removeItem(id)}
                        title="Remove from delivery"
                        type="button"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>Enter delivered quantities to build the summary.</p>
            )}
            <input
              name="items"
              type="hidden"
              value={JSON.stringify(
                chosen.map(([productId, quantity]) => ({
                  productId,
                  quantity,
                })),
              )}
            />
            <button
              className="btn-primary compact-action"
              disabled={!chosen.length || !vendors.length}
            >
              Add to Inventory
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}
