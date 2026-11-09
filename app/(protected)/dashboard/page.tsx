import { TabletLanding } from "@/app/components/tablet-landing";
import { headers } from "next/headers";
import { hasPermission } from "@/lib/authorization";
import { isMobileDevice } from "@/lib/mobile-landing";
import { redirect } from "next/navigation";
import { landingPathForRole } from "@/lib/authorization";
import { requireCurrentUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const requestHeaders = await headers();
  if (
    hasPermission(user.role, "operations:post") &&
    isMobileDevice(
      requestHeaders.get("user-agent") || "",
      requestHeaders.get("sec-ch-ua-mobile"),
    )
  )
    redirect("/mobile");
  if (
    hasPermission(user.role, "operations:post") &&
    /Macintosh/i.test(requestHeaders.get("user-agent") || "")
  )
    return <TabletLanding />;
  redirect(landingPathForRole(user.role));
}
