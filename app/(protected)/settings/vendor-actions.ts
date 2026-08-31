"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

function normalized(name: string) { return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA"); }
async function actor() { const user = await currentUser(); if (!user || !hasPermission(user.role, "catalog:manage")) throw new Error("FORBIDDEN"); return user; }
function go(kind: "success"|"error", message: string): never { redirect(`/settings?tab=vendors&${kind}=${encodeURIComponent(message)}`); }

export async function createVendorAction(formData: FormData) {
  try {
    await actor(); const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " "); const notes = String(formData.get("notes") ?? "").trim();
    if (!name || name.length > 120 || notes.length > 1000) throw new Error("INVALID");
    await prisma.vendor.create({ data: { name, nameNormalized: normalized(name), notes: notes || null } }); revalidatePath("/settings"); revalidatePath("/deliveries"); go("success", "Vendor added.");
  } catch (error) { if (typeof error === "object" && error && "digest" in error) throw error; go("error", typeof error === "object" && error && "code" in error && error.code === "P2002" ? "A Vendor with that name already exists." : "Vendor could not be added."); }
}

export async function setVendorActiveAction(formData: FormData) {
  try { await actor(); const active = String(formData.get("active")) === "true"; await prisma.vendor.update({ where: { id: String(formData.get("vendorId") ?? "") }, data: { active } }); revalidatePath("/settings"); revalidatePath("/deliveries"); go("success", active ? "Vendor activated." : "Vendor hidden."); }
  catch (error) { if (typeof error === "object" && error && "digest" in error) throw error; go("error", "Vendor could not be updated."); }
}
