import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ROLES, hasPermission, type AppRole } from "./authorization";
import { normalizeEmail } from "./oauth-authorization";

export type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
};

export type UserAudit = {
  actorId: string;
  action: "USER_PREAUTHORIZED" | "USER_ROLE_CHANGED" | "USER_DISABLED" | "USER_ENABLED";
  entityType: "User";
  entityId: string;
  before?: object;
  after: object;
  correlationId: string;
};

export type UserManagementTransaction = {
  findUserByEmail(email: string): Promise<ManagedUser | null>;
  findUserById(id: string): Promise<ManagedUser | null>;
  countActiveAdministrators(): Promise<number>;
  createUser(input: { email: string; name: string | null; role: AppRole }): Promise<ManagedUser>;
  updateUser(id: string, data: { role?: AppRole; status?: "ACTIVE" | "DISABLED" }): Promise<ManagedUser>;
  createAudit(input: UserAudit): Promise<unknown>;
};

export type UserManagementRepository = {
  transaction<T>(work: (transaction: UserManagementTransaction) => Promise<T>): Promise<T>;
};

export class UserManagementError extends Error {
  constructor(public code: "FORBIDDEN" | "INVALID_INPUT" | "DUPLICATE_EMAIL" | "USER_NOT_FOUND" | "LAST_ACTIVE_ADMINISTRATOR" | "NO_CHANGE") {
    super(code);
  }
}

const emailSchema = z.email().max(320);

function assertAdministrator(actor: ManagedUser) {
  if (actor.status !== "ACTIVE" || !hasPermission(actor.role, "users:manage")) {
    throw new UserManagementError("FORBIDDEN");
  }
}

function parseRole(value: string): AppRole {
  if (!ROLES.includes(value as AppRole)) throw new UserManagementError("INVALID_INPUT");
  return value as AppRole;
}

function snapshot(user: ManagedUser) {
  return { email: user.email, name: user.name, role: user.role, status: user.status };
}

export async function preauthorizeUser(
  actor: ManagedUser,
  input: { email: string; name?: string | null; role: string },
  repository: UserManagementRepository,
) {
  const email = normalizeEmail(input.email);
  if (!emailSchema.safeParse(email).success) throw new UserManagementError("INVALID_INPUT");
  const role = parseRole(input.role);
  const name = input.name?.trim() || null;
  if (name && name.length > 160) throw new UserManagementError("INVALID_INPUT");

  return repository.transaction(async (transaction) => {
    const currentActor = await transaction.findUserById(actor.id);
    if (!currentActor) throw new UserManagementError("FORBIDDEN");
    assertAdministrator(currentActor);
    if (await transaction.findUserByEmail(email)) throw new UserManagementError("DUPLICATE_EMAIL");
    const created = await transaction.createUser({ email, name, role });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: "USER_PREAUTHORIZED",
      entityType: "User",
      entityId: created.id,
      after: snapshot(created),
      correlationId: randomUUID(),
    });
    return created;
  });
}

export async function changeUserRole(
  actor: ManagedUser,
  targetId: string,
  requestedRole: string,
  repository: UserManagementRepository,
) {
  const role = parseRole(requestedRole);
  return repository.transaction(async (transaction) => {
    const currentActor = await transaction.findUserById(actor.id);
    if (!currentActor) throw new UserManagementError("FORBIDDEN");
    assertAdministrator(currentActor);
    const target = await transaction.findUserById(targetId);
    if (!target) throw new UserManagementError("USER_NOT_FOUND");
    if (target.role === role) throw new UserManagementError("NO_CHANGE");
    if (target.status === "ACTIVE" && target.role === "ADMINISTRATOR" && role !== "ADMINISTRATOR" && await transaction.countActiveAdministrators() <= 1) {
      throw new UserManagementError("LAST_ACTIVE_ADMINISTRATOR");
    }
    const before = snapshot(target);
    const updated = await transaction.updateUser(target.id, { role });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: target.id,
      before,
      after: snapshot(updated),
      correlationId: randomUUID(),
    });
    return updated;
  });
}

export async function setUserStatus(
  actor: ManagedUser,
  targetId: string,
  requestedStatus: "ACTIVE" | "DISABLED",
  repository: UserManagementRepository,
) {
  return repository.transaction(async (transaction) => {
    const currentActor = await transaction.findUserById(actor.id);
    if (!currentActor) throw new UserManagementError("FORBIDDEN");
    assertAdministrator(currentActor);
    const target = await transaction.findUserById(targetId);
    if (!target) throw new UserManagementError("USER_NOT_FOUND");
    if (target.status === requestedStatus) throw new UserManagementError("NO_CHANGE");
    if (requestedStatus === "DISABLED" && target.role === "ADMINISTRATOR" && target.status === "ACTIVE" && await transaction.countActiveAdministrators() <= 1) {
      throw new UserManagementError("LAST_ACTIVE_ADMINISTRATOR");
    }
    const before = snapshot(target);
    const updated = await transaction.updateUser(target.id, { status: requestedStatus });
    await transaction.createAudit({
      actorId: currentActor.id,
      action: requestedStatus === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED",
      entityType: "User",
      entityId: target.id,
      before,
      after: snapshot(updated),
      correlationId: randomUUID(),
    });
    return updated;
  });
}
