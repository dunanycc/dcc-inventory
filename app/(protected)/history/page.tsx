import { PlaceholderPage } from "@/app/components/placeholder-page";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function Page() {
  await requireInventoryWorkspaceUser();
  return <PlaceholderPage title="Stock History" description="See when stock was received, transferred, opened, or adjusted after a count." heading="Stock history will appear here." detail="Each quantity change will show the Product, Location, date, quantity, person, and related Order, Transfer, or Count."/>;
}
