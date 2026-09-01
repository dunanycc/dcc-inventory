import { AppShell } from "@/app/components/app-shell";
import { requireCurrentUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  return <AppShell user={user}>{children}</AppShell>;
}
