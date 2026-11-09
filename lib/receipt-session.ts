import { redirect } from "next/navigation";
import { requireCurrentUser } from "./session";
import { hasPermission, landingPathForRole } from "./authorization";
export async function requireReceiptManager() {
  const user = await requireCurrentUser();
  if (!hasPermission(user.role, "operations:post"))
    redirect(landingPathForRole(user.role));
  return user;
}
