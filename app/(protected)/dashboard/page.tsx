import { redirect } from "next/navigation";
import { landingPathForRole } from "@/lib/authorization";
import { requireCurrentUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  redirect(landingPathForRole(user.role));
}
