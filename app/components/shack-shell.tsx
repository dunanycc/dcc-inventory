import Link from "next/link";
import { signOut } from "@/auth";
import {
  landingPathForRole,
  roleLabels,
  type AppRole,
} from "@/lib/authorization";

export function ShackShell({
  user,
  children,
}: {
  user: { name: string | null; email: string; role: AppRole } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <Link
          href={user ? landingPathForRole(user.role) : "/starter-shack"}
          className="brand"
        >
          <span className="brand-mark">DCC</span>
          <span>Starter Shack</span>
        </Link>
        {user ? (
          <div className="account">
            <span>
              <strong>{user.name || user.email}</strong>
              <small>{roleLabels[user.role]}</small>
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button className="text-button">Sign out</button>
            </form>
          </div>
        ) : (
          <Link href="/sign-in" className="text-button">
            Staff sign in
          </Link>
        )}
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
