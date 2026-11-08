import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isStarterShackStaff } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const currentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id, status: "ACTIVE" },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
});

export async function requireCurrentUser() {
  const user = await currentUser();
  if (!user || user.status !== "ACTIVE") redirect("/sign-in");
  return user;
}

export async function requireInventoryWorkspaceUser() {
  const user = await requireCurrentUser();
  if (isStarterShackStaff(user.role)) redirect("/starter-shack");
  return user;
}
