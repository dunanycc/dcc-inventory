import { redirect } from "next/navigation";
import { PageHeading } from "@/app/components/page-heading";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";
import { CategoryManagementClient, type CategoryManagementRow } from "./category-management-client";
import { UserManagementClient, type UserManagementRow } from "./user-management-client";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(value);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const actor = await requireCurrentUser();
  const canManageUsers = hasPermission(actor.role, "users:manage");
  const canManageCatalog = hasPermission(actor.role, "catalog:manage");
  if (!canManageUsers && !canManageCatalog) redirect("/dashboard");

  const [users, categories] = await Promise.all([
    canManageUsers ? prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }, { email: "asc" }] }) : Promise.resolve([]),
    canManageCatalog ? prisma.category.findMany({ orderBy: CATEGORY_ORDER_BY, include: { _count: { select: { products: true } } } }) : Promise.resolve([]),
  ]);
  const loginEvents = canManageUsers && users.length ? await prisma.auditEvent.findMany({
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

  const userRows: UserManagementRow[] = users.map((user) => ({
    id: user.id, name: user.name, email: user.email, role: user.role, status: user.status,
    providers: [...(providersByUser.get(user.id) ?? [])].sort(),
    createdAt: formatDate(user.createdAt), lastActivity: user.lastLoginAt ? formatDate(user.lastLoginAt) : null,
  }));
  const categoryRows: CategoryManagementRow[] = categories.map((category) => ({
    id: category.id, name: category.name, displayOrder: category.displayOrder, active: category.active, productCount: category._count.products,
  }));
  const message = await searchParams;

  return <><PageHeading eyebrow="Administration" title="Settings" description="Manage DCC Inventory master data and independently approved access."/>{message.success && <p className="notice success" role="status">{message.success}</p>}{message.error && <p className="notice error" role="alert">{message.error}</p>}<div className="settings-sections">{canManageCatalog && <CategoryManagementClient categories={categoryRows}/>} {canManageUsers && <UserManagementClient users={userRows}/>}</div></>;
}
