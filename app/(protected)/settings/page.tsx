import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeading } from "@/app/components/page-heading";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";
import {
  CategoryManagementClient,
  type CategoryManagementRow,
} from "./category-management-client";
import { ProductImportClient } from "./product-import-client";
import {
  UserManagementClient,
  type UserManagementRow,
} from "./user-management-client";
import {
  VendorManagementClient,
  type VendorRow,
} from "./vendor-management-client";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA").format(value);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; success?: string; error?: string }>;
}) {
  const actor = await requireCurrentUser();
  const canManageUsers = hasPermission(actor.role, "users:manage");
  const canManageCatalog = hasPermission(actor.role, "catalog:manage");
  if (!canManageUsers && !canManageCatalog) redirect("/dashboard");
  const message = await searchParams;
  const tab =
    message.tab === "imports" && canManageCatalog
      ? "imports"
      : message.tab === "categories" && canManageCatalog
        ? "categories"
        : message.tab === "vendors" && canManageCatalog
          ? "vendors"
          : canManageUsers
            ? "users"
            : "imports";

  const [users, categories, vendors] = await Promise.all([
    tab === "users"
      ? prisma.user.findMany({
          orderBy: [{ status: "asc" }, { name: "asc" }, { email: "asc" }],
        })
      : Promise.resolve([]),
    tab === "categories"
      ? prisma.category.findMany({ orderBy: CATEGORY_ORDER_BY })
      : Promise.resolve([]),
    tab === "vendors"
      ? prisma.vendor.findMany({
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          include: { _count: { select: { deliveries: true } } },
        })
      : Promise.resolve([]),
  ]);
  const loginEvents =
    canManageUsers && users.length
      ? await prisma.auditEvent.findMany({
          where: {
            entityType: "User",
            entityId: { in: users.map((user) => user.id) },
            action: "LOGIN_SUCCEEDED",
          },
          select: { entityId: true, after: true },
        })
      : [];
  const providersByUser = new Map<string, Set<string>>();
  for (const event of loginEvents) {
    const after = event.after;
    if (!after || Array.isArray(after) || typeof after !== "object") continue;
    const provider =
      "provider" in after && typeof after.provider === "string"
        ? after.provider
        : null;
    if (provider !== "google" && provider !== "yahoo") continue;
    const providers = providersByUser.get(event.entityId) ?? new Set<string>();
    providers.add(provider === "google" ? "Google" : "Yahoo");
    providersByUser.set(event.entityId, providers);
  }

  const userRows: UserManagementRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    providers: [...(providersByUser.get(user.id) ?? [])].sort(),
    createdAt: formatDate(user.createdAt),
    lastActivity: user.lastLoginAt ? formatDate(user.lastLoginAt) : null,
  }));
  const categoryRows: CategoryManagementRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    displayOrder: category.displayOrder,
    active: category.active,
  }));
  const vendorRows: VendorRow[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    displayOrder: v.displayOrder,
    active: v.active,
    notes: v.notes,
    deliveryCount: v._count.deliveries,
  }));
  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="Admin"
        description="Manage approved users and controlled master data."
      />
      {message.success && (
        <p className="notice success" role="status">
          {message.success}
        </p>
      )}
      {message.error && (
        <p className="notice error" role="alert">
          {message.error}
        </p>
      )}
      <nav className="admin-tabs" aria-label="Administration">
        {canManageUsers && (
          <Link
            className={tab === "users" ? "active" : ""}
            href="/settings?tab=users"
          >
            Users
          </Link>
        )}
        {canManageCatalog && (
          <Link
            className={tab === "imports" ? "active" : ""}
            href="/settings?tab=imports"
          >
            Imports
          </Link>
        )}
        {canManageCatalog && (
          <Link
            className={tab === "categories" ? "active" : ""}
            href="/settings?tab=categories"
          >
            Categories
          </Link>
        )}
        {canManageCatalog && (
          <Link
            className={tab === "vendors" ? "active" : ""}
            href="/settings?tab=vendors"
          >
            Vendors
          </Link>
        )}
      </nav>
      <div className="settings-sections">
        {tab === "users" && canManageUsers && (
          <UserManagementClient users={userRows} />
        )}{" "}
        {tab === "imports" && canManageCatalog && <ProductImportClient />}
        {tab === "categories" && canManageCatalog && (
          <CategoryManagementClient categories={categoryRows} />
        )}{" "}
        {tab === "vendors" && canManageCatalog && (
          <VendorManagementClient vendors={vendorRows} />
        )}
      </div>
    </>
  );
}
