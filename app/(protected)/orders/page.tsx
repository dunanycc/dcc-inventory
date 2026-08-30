import { PlaceholderPage } from "@/app/components/placeholder-page";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function Page() {
  await requireInventoryWorkspaceUser();
  return <PlaceholderPage title="Orders" description="Record simple vendor orders and receive arriving stock into the Bar." heading="Vendor ordering is coming soon." detail="This workspace will keep open orders, received quantities, cancellations, and optional notes together in one place."/>;
}
