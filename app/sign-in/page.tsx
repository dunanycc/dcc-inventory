import { authProviders, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const configured = authProviders.google || authProviders.yahoo;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Dunany Country Club</p>
        <h1>DCC Inventory</h1>
        <p>Sign in with an identity linked to an independently approved Inventory account.</p>
        <div className="auth-actions">
          {authProviders.google && <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}><button>Continue with Google</button></form>}
          {authProviders.yahoo && <form action={async () => { "use server"; await signIn("yahoo", { redirectTo: "/dashboard" }); }}><button>Continue with Yahoo</button></form>}
        </div>
        {!configured && <div className="notice warning">Authentication providers are not configured yet. Add independent provider credentials to the local environment.</div>}
        <p className="muted">Access is denied unless your email has an active DCC Inventory user record.</p>
      </section>
    </main>
  );
}
