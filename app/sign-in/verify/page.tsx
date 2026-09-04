import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function VerifySignInLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;
  if (!token || !email) redirect("/sign-in?error=1");

  // On success this throws Next.js's internal redirect to /dashboard. On
  // failure (invalid, expired, reused, or not an approved active User),
  // Auth.js redirects to the configured error page (/sign-in) itself.
  await signIn("email-link", { token, email, redirectTo: "/dashboard" });
}
