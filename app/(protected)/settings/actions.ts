"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import {
  UserManagementError,
  changeUserRole,
  preauthorizeUser,
  setUserStatus,
  type UserManagementRepository,
} from "@/lib/user-management";

const userSelect = { id: true, email: true, name: true, role: true, status: true } as const;

const repository: UserManagementRepository = {
  transaction: (work) => prisma.$transaction(async (transaction) => work({
    findUserByEmail: (email) => transaction.user.findUnique({ where: { email }, select: userSelect }),
    findUserById: (id) => transaction.user.findUnique({ where: { id }, select: userSelect }),
    countActiveAdministrators: () => transaction.user.count({ where: { role: "ADMINISTRATOR", status: "ACTIVE" } }),
    createUser: (input) => transaction.user.create({ data: { ...input, status: "ACTIVE" }, select: userSelect }),
    updateUser: (id, data) => transaction.user.update({ where: { id }, data, select: userSelect }),
    createAudit: (input) => transaction.auditEvent.create({ data: input }),
  }), { isolationLevel: "Serializable" }),
};

const messages: Record<string, string> = {
  FORBIDDEN: "Administrator access is required.",
  INVALID_INPUT: "Enter a valid email, name, and role.",
  DUPLICATE_EMAIL: "That email is already authorized.",
  USER_NOT_FOUND: "The selected user no longer exists.",
  LAST_ACTIVE_ADMINISTRATOR: "This change would leave DCC Inventory without an active Administrator.",
  NO_CHANGE: "No user-management change was made.",
  CONFLICT: "The user list changed at the same time. Review it and try again.",
  FAILED: "The user-management change could not be completed.",
};

function errorCode(error: unknown) {
  if (error instanceof UserManagementError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002") return "DUPLICATE_EMAIL";
    if (error.code === "P2034") return "CONFLICT";
  }
  console.error("User-management mutation failed", error);
  return "FAILED";
}

async function runMutation(work: (actor: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<unknown>, success: string) {
  let destination: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new UserManagementError("FORBIDDEN");
    await work(actor);
    revalidatePath("/settings");
    destination = `/settings?tab=users&success=${encodeURIComponent(success)}`;
  } catch (error) {
    const code = errorCode(error);
    destination = `/settings?tab=users&error=${encodeURIComponent(messages[code] ?? messages.FAILED)}`;
  }
  redirect(destination);
}

export async function preauthorizeUserAction(formData: FormData) {
  await runMutation(
    (actor) => preauthorizeUser(actor, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? ""),
    }, repository),
    "User pre-authorized.",
  );
}

export async function changeUserRoleAction(formData: FormData) {
  await runMutation(
    (actor) => changeUserRole(actor, String(formData.get("userId") ?? ""), String(formData.get("role") ?? ""), repository),
    "User role updated.",
  );
}

export async function setUserStatusAction(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "DISABLED") {
    redirect(`/settings?tab=users&error=${encodeURIComponent(messages.INVALID_INPUT)}`);
  }
  await runMutation(
    (actor) => setUserStatus(actor, String(formData.get("userId") ?? ""), status, repository),
    status === "ACTIVE" ? "User enabled." : "User disabled.",
  );
}
