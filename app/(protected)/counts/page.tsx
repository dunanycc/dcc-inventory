import { PlaceholderPage } from "@/app/components/placeholder-page";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function Page() {
  await requireInventoryWorkspaceUser();
  return (
    <PlaceholderPage
      title="Counts"
      description="Compare a physical count with the tracked quantity at the Bar or Starter Shack."
      heading="Physical inventory counts are coming soon."
      detail="Counts will show expected, counted, and difference values and preserve who accepted each adjustment."
    />
  );
}
