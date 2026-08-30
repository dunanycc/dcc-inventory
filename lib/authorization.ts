export const ROLES = [
  "ADMINISTRATOR",
  "INVENTORY_MANAGER",
  "INVENTORY_USER",
  "READ_ONLY",
] as const;

export type AppRole = (typeof ROLES)[number];

export type Permission =
  | "inventory:view"
  | "catalog:manage"
  | "operations:draft"
  | "operations:post"
  | "imports:review"
  | "users:manage"
  | "cutover:approve"
  | "audit:view";

const grants: Record<AppRole, ReadonlySet<Permission>> = {
  ADMINISTRATOR: new Set([
    "inventory:view", "catalog:manage", "operations:draft", "operations:post",
    "imports:review", "users:manage", "cutover:approve", "audit:view",
  ]),
  INVENTORY_MANAGER: new Set([
    "inventory:view", "catalog:manage", "operations:draft", "operations:post",
    "imports:review", "audit:view",
  ]),
  INVENTORY_USER: new Set(["inventory:view", "operations:draft"]),
  READ_ONLY: new Set(["inventory:view"]),
};

export function hasPermission(role: AppRole, permission: Permission) {
  return grants[role].has(permission);
}

export function requirePermission(role: AppRole, permission: Permission) {
  if (!hasPermission(role, permission)) throw new Error("FORBIDDEN");
}

export function isStarterShackStaff(role: AppRole) {
  return role === "INVENTORY_USER";
}

export function landingPathForRole(role: AppRole) {
  return isStarterShackStaff(role) ? "/requests" : "/inventory";
}
