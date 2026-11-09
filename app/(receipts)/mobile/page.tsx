import Link from "next/link";
export default function MobileLanding() {
  return (
    <section className="mobile-receipt-choice">
      <h1>What would you like to do?</h1>
      <Link className="mobile-choice-primary" href="/receipts">
        <strong>Add Receipts</strong>
        <span>Take a photo or attach a receipt to an order.</span>
      </Link>
      <Link className="mobile-choice-secondary" href="/inventory">
        <strong>Full Site</strong>
        <span>Open inventory, orders and reports.</span>
      </Link>
    </section>
  );
}
