import { redirect } from "next/navigation";
import { PageHeading } from "@/app/components/page-heading";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";
import { UserManagementClient, type UserManagementRow } from "./user-management-client";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(value);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const actor = await requireCurrentUser();
  if (!hasPermission(actor.role, "users:manage")) redirect("/dashboard");

  const users = await prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }, { email: "asc" }] });
  const loginEvents = users.length ? await prisma.auditEvent.findMany({
    where: { entityType: "User", entityId: { in: users.map((user) => user.id) }, action: "LOGIN_SUCCEEDED" },
    select: { entityId: true, after: true },
  }) : [];
  const providersByUser = new Map<string, Set<string>>();
  for (const event of loginEvents) {
    const after = event.after;
    if (!after || Array.isArray(after) || typeof after !== "object") continue;
    const provider = "provider" in after && typeof after.provider === "string" ? after.provider : null;
    if (provider !== "google" && provider !== "yahoo") continue;
    const providers = providersByUser.get(event.entityId) ?? new Set<string>();
    providers.add(provider === "google" ? "Google" : "Yahoo");
    providersByUser.set(event.entityId, providers);
  }

  const rows: UserManagementRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    providers: [...(providersByUser.get(user.id) ?? [])].sort(),
    createdAt: formatDate(user.createdAt),
    lastActivity: user.lastLoginAt ? formatDate(user.lastLoginAt) : null,
  }));
  const message = await searchParams;

  return <><PageHeading eyebrow="Administration" title="Settings" description="Manage independently approved DCC Inventory users, roles, and account access."/>{message.success && <p className="notice success" role="status">{message.success}</p>}{message.error && <p className="notice error" role="alert">{message.error}</p>}<UserManagementClient users={rows}/></>;
}
