import { AppShell } from "@/app/components/app-shell";
import { requireReceiptManager } from "@/lib/receipt-session";
export const dynamic = "force-dynamic";
export default async function ReceiptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireReceiptManager();
  return (
    <AppShell user={user} compact>
      {children}
    </AppShell>
  );
}
