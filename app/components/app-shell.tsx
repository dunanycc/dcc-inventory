import Link from "next/link";
import { signOut } from "@/auth";
import {
  hasPermission,
  landingPathForRole,
  roleLabels,
  type AppRole,
} from "@/lib/authorization";
const navigation = [
  ["Inventory", "/inventory"],
  ["Products", "/products"],
  ["Order", "/order"],
  ["Orders List", "/orders"],
  ["Order Summary", "/order-history"],
  ["Starter Shack", "/requests"],
  ["History", "/history"],
  ["Admin", "/settings"],
] as const;
export function AppShell({
  user,
  children,
  compact = false,
}: {
  user: { name: string | null; email: string; role: AppRole };
  children: React.ReactNode;
  compact?: boolean;
}) {
  const visibleNavigation = navigation.filter(
    ([label]) =>
      label !== "Admin" ||
      hasPermission(user.role, "users:manage") ||
      hasPermission(user.role, "catalog:manage"),
  );
  return (
    <div className={`app-frame ${compact ? "receipt-frame" : ""}`}>
      <header className="topbar">
        <Link
          href={compact ? "/mobile" : landingPathForRole(user.role)}
          className="brand"
        >
          <span className="brand-mark">DCC</span>
          <span>{compact ? "Receipts" : "Inventory"}</span>
        </Link>
        {compact && (
          <Link className="text-button" href="/inventory">
            Full Site
          </Link>
        )}
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
      </header>
      {!compact && (
        <nav className="primary-nav" aria-label="Primary navigation">
          {visibleNavigation.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      )}
      <main className="page-shell">{children}</main>
    </div>
  );
}
