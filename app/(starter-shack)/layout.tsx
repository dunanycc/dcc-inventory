import { ShackShell } from "@/app/components/shack-shell";
import { currentUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function StarterShackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  return <ShackShell user={user}>{children}</ShackShell>;
}
