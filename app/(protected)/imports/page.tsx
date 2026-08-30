import { PlaceholderPage } from "@/app/components/placeholder-page";
import { requireInventoryWorkspaceUser } from "@/lib/session";

export default async function Page() {
  await requireInventoryWorkspaceUser();
  return <PlaceholderPage title="Imports" description="Import tools are not part of routine volunteer workflows." heading="There are no imports to run." detail="Any one-time spreadsheet migration will be handled separately and will not appear in the main navigation."/>;
}
