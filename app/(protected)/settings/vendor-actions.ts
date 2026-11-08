"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

function normalized(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
}
async function actor() {
  const user = await currentUser();
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !hasPermission(user.role, "catalog:manage")
  )
    throw new Error("FORBIDDEN");
  return user;
}
function go(kind: "success" | "error", message: string): never {
  redirect(`/settings?tab=vendors&${kind}=${encodeURIComponent(message)}`);
}

export async function createVendorAction(formData: FormData) {
  try {
    await actor();
    const name = String(formData.get("name") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const notes = String(formData.get("notes") ?? "").trim();
    if (!name || name.length > 120 || notes.length > 1000)
      throw new Error("INVALID");
    const last = await prisma.vendor.aggregate({
      _max: { displayOrder: true },
    });
    await prisma.vendor.create({
      data: {
        name,
        nameNormalized: normalized(name),
        notes: notes || null,
        displayOrder: (last._max.displayOrder ?? -1) + 1,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/deliveries");
    go("success", "Vendor added.");
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    go(
      "error",
      typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
        ? "A Vendor with that name already exists."
        : "Vendor could not be added.",
    );
  }
}

export async function updateVendorAction(formData: FormData) {
  try {
    await actor();
    const vendorId = String(formData.get("vendorId") ?? "");
    const name = String(formData.get("name") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const notes = String(formData.get("notes") ?? "").trim();
    if (!vendorId || !name || name.length > 120 || notes.length > 1000)
      throw new Error("INVALID");
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { name, nameNormalized: normalized(name), notes: notes || null },
    });
    revalidatePath("/settings");
    revalidatePath("/deliveries");
    go("success", "Vendor updated.");
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    go(
      "error",
      typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
        ? "A Vendor with that name already exists."
        : "Vendor could not be updated.",
    );
  }
}

export async function reorderVendorsAction(formData: FormData) {
  const user = await actor();
  let vendorIds: string[];
  try {
    const value = JSON.parse(String(formData.get("vendorIds") ?? "[]"));
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== "string") ||
      new Set(value).size !== value.length
    )
      throw new Error("INVALID");
    vendorIds = value;
  } catch {
    return { ok: false, message: "Vendor order is invalid." };
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { status: true, role: true },
        });
        if (
          !fresh ||
          fresh.status !== "ACTIVE" ||
          !hasPermission(fresh.role, "catalog:manage")
        )
          throw new Error("FORBIDDEN");
        const vendors = await tx.vendor.findMany({ select: { id: true } });
        if (
          vendors.length !== vendorIds.length ||
          vendors.some((vendor) => !vendorIds.includes(vendor.id))
        )
          throw new Error("INVALID");
        for (const [displayOrder, id] of vendorIds.entries())
          await tx.vendor.update({ where: { id }, data: { displayOrder } });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/settings");
    revalidatePath("/deliveries");
    return { ok: true, message: "Vendor order saved." };
  } catch (error) {
    console.error("Vendor reorder failed", error);
    return { ok: false, message: "Vendor order could not be saved." };
  }
}

export async function setVendorActiveAction(formData: FormData) {
  try {
    await actor();
    const active = String(formData.get("active")) === "true";
    await prisma.vendor.update({
      where: { id: String(formData.get("vendorId") ?? "") },
      data: { active },
    });
    revalidatePath("/settings");
    revalidatePath("/deliveries");
    go("success", active ? "Vendor activated." : "Vendor hidden.");
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    go("error", "Vendor could not be updated.");
  }
}

export async function deleteVendorAction(formData: FormData) {
  await actor();
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  if (!vendorId) go("error", "Vendor could not be deleted.");
  try {
    const result = await prisma.vendor.deleteMany({
      where: { id: vendorId, deliveries: { none: {} }, products: { none: {} } },
    });
    if (result.count === 0)
      go(
        "error",
        "Vendor was not found or is used by Products or has delivery history. Hide used Vendors instead.",
      );
    revalidatePath("/settings");
    revalidatePath("/deliveries");
    go("success", "Vendor deleted.");
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    go(
      "error",
      "Vendor could not be deleted. Vendors used by Products or with delivery history must be hidden instead.",
    );
  }
}
