import { ShackShell } from "@/app/components/shack-shell";
import { requireCurrentUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function StarterShackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  return <ShackShell user={user}>{children}</ShackShell>;
}
