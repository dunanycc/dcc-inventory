import { requireInventoryWorkspaceUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { PageHeading } from "@/app/components/page-heading";
import { LegacyOrderImport } from "@/app/orders/legacy-import";
export default async function Page() {
  const actor = await requireInventoryWorkspaceUser();
  return (
    <>
      <PageHeading
        title="Import order history"
        eyebrow="Legacy migration"
        description="Preview the legacy workbook, split orders by historical vendor, and import without reposting stock."
      />
      {hasPermission(actor.role, "imports:review") ? (
        <LegacyOrderImport />
      ) : (
        <p>You do not have permission to import orders.</p>
      )}
    </>
  );
}
