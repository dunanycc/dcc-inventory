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

  // Only consume the token and set cookies in a Server Action, never during
  // rendering (which may also be triggered by email link scanners/prefetch).
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Confirm sign-in</h1>
        <p>Continue to sign in to DCC Inventory.</p>
        <form
          action={async () => {
            "use server";
            await signIn("email-link", {
              token,
              email,
              redirectTo: "/dashboard",
            });
          }}
        >
          <button className="btn-primary" type="submit">
            Continue to inventory
          </button>
        </form>
      </section>
    </main>
  );
}
