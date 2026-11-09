"use client";
export function OrderQuantity({
  value,
  onChange,
  label,
  privateIndex,
}: {
  value: number;
  onChange(n: number): void;
  label: string;
  privateIndex?: number;
}) {
  const names = privateIndex
    ? {
        add: `Add quantity for private product ${privateIndex}`,
        minus: `Decrease private quantity ${privateIndex}`,
        plus: `Increase private quantity ${privateIndex}`,
        output: `Private quantity ${privateIndex}`,
      }
    : {
        add: `Add ${label}`,
        minus: `Decrease ${label}`,
        plus: `Increase ${label}`,
        output: `Quantity for ${label}`,
      };
  return (
    <div
      className="order-quantity-control"
      role="group"
      aria-label={`Quantity controls for ${label}`}
    >
      {value <= 0 ? (
        <button
          type="button"
          className="btn-secondary"
          aria-label={names.add}
          onClick={() => onChange(1)}
        >
          Add
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn-secondary"
            aria-label={names.minus}
            onClick={() => onChange(value - 1)}
          >
            −
          </button>
          <output aria-label={names.output} aria-live="polite">
            {value}
          </output>
          <button
            type="button"
            className="btn-secondary"
            aria-label={names.plus}
            disabled={value >= 999999999}
            onClick={() => onChange(value + 1)}
          >
            +
          </button>
        </>
      )}
    </div>
  );
}
