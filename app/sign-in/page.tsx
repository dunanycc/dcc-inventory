import { authProviders, signIn } from "@/auth";
import { requestSignInLinkAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ linkSent?: string; error?: string }>;
}) {
  const query = await searchParams;
  const configured =
    authProviders.google || authProviders.yahoo || authProviders.emailLink;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Dunany Country Club</p>
        <h1>DCC Inventory</h1>
        <p>
          Sign in with an identity linked to an independently approved Inventory
          account.
        </p>
        {query.linkSent && (
          <p className="notice success" role="status">
            If this email is approved, a sign-in link has been sent.
          </p>
        )}
        {query.error && (
          <p className="notice error" role="alert">
            That sign-in link is invalid or has expired. Request a new one
            below.
          </p>
        )}
        <div className="auth-actions">
          {authProviders.google && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <button className="provider-button provider-google">
                <svg
                  aria-hidden="true"
                  data-provider-icon="google"
                  focusable="false"
                  viewBox="0 0 18 18"
                >
                  <path
                    d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.703-1.568 2.684-3.879 2.684-6.614Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.963 10.704A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.168.282-1.704V4.964H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.036l3.007-2.332Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.581c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.964l3.007 2.332C4.672 5.166 6.656 3.581 9 3.581Z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Continue with Google</span>
                <span aria-hidden="true" />
              </button>
            </form>
          )}
          {authProviders.yahoo && (
            <form
              action={async () => {
                "use server";
                await signIn("yahoo", { redirectTo: "/dashboard" });
              }}
            >
              <button className="provider-button provider-yahoo">
                <svg
                  aria-hidden="true"
                  data-provider-icon="yahoo"
                  focusable="false"
                  viewBox="0 0 32 24"
                >
                  <text
                    fill="#6001D2"
                    fontFamily="Arial Black, Arial, sans-serif"
                    fontSize="22"
                    fontWeight="900"
                    x="1"
                    y="20"
                  >
                    Y!
                  </text>
                </svg>
                <span>Continue with Yahoo</span>
                <span aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
        {authProviders.emailLink && (
          <>
            <p className="auth-divider">or</p>
            <form action={requestSignInLinkAction} className="auth-email-form">
              <label htmlFor="email">Email address</label>
              <input
                autoComplete="email"
                id="email"
                maxLength={320}
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
              <button type="submit">Email me a sign-in link</button>
            </form>
          </>
        )}
        {!configured && (
          <div className="notice warning">
            Authentication providers are not configured yet. Add independent
            provider credentials to the local environment.
          </div>
        )}
        <p className="muted">
          Access requires an active DCC Inventory account. Initial
          Administrators must use an explicitly configured bootstrap email.
        </p>
      </section>
    </main>
  );
}
