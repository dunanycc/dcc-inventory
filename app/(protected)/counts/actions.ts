"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  calculateCountAcceptance,
  InventoryCountError,
  isValidSeasonYear,
  normalizeDraftCountedQuantity,
  requireAcceptPermission,
  requireDraftPermission,
  SEASON_OPENING_SOURCE_SYSTEM,
  seasonOpeningCountDate,
  seasonOpeningSourceId,
} from "@/lib/inventory-count";
import { inventoryBalancesForLocation } from "@/lib/inventory-balances";
import { createValidatedMovement } from "@/lib/inventory-movement";
import { prisma } from "@/lib/prisma";
import { createMovementTransaction } from "@/lib/prisma-movement-repository";
import { currentUser } from "@/lib/session";

const messages: Record<string, string> = {
  FORBIDDEN: "You do not have permission for that Count action.",
  INVALID_INPUT: "Enter a valid quantity for each Product.",
  NOT_FOUND: "The Count no longer exists.",
  NOT_DRAFT: "This Count is no longer a draft.",
  NOT_ELIGIBLE: "The Location is not active.",
  INCOMPLETE: "Enter a counted quantity for every Product before accepting.",
  ALREADY_ACTIVE: "A draft Count is already in progress for this Location.",
  CONFLICT: "The Count changed at the same time. Refresh and try again.",
  FAILED: "The Count could not be saved.",
};

function errorCode(error: unknown) {
  if (error instanceof InventoryCountError) return error.code;
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "P2034"
  )
    return "CONFLICT";
  console.error("Count action failed", error);
  return "FAILED";
}

function destination(
  locationCode: string,
  kind: "success" | "error",
  message: string,
) {
  return `/counts?location=${encodeURIComponent(locationCode)}&${kind}=${encodeURIComponent(message)}`;
}

export async function startCountAction(formData: FormData) {
  const locationId = String(formData.get("locationId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryCountError("FORBIDDEN");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (!fresh) throw new InventoryCountError("FORBIDDEN");
        requireDraftPermission(fresh);
        const location = await tx.location.findUnique({
          where: { id: locationId },
          select: { id: true, active: true },
        });
        if (!location?.active) throw new InventoryCountError("NOT_ELIGIBLE");
        const existingDraft = await tx.inventoryCount.findFirst({
          where: { locationId, status: "DRAFT" },
          select: { id: true },
        });
        if (existingDraft) return;
        const products = await tx.product.findMany({
          where: {
            active: true,
            productLocations: {
              some: { locationId, active: true, reviewRequired: false },
            },
          },
          select: { id: true },
        });
        if (!products.length) throw new InventoryCountError("NOT_ELIGIBLE");
        const balances = await inventoryBalancesForLocation(locationId);
        const count = await tx.inventoryCount.create({
          data: {
            locationId,
            countDate: new Date(),
            status: "DRAFT",
            createdById: fresh.id,
          },
        });
        await tx.inventoryCountLine.createMany({
          data: products.map((product) => ({
            inventoryCountId: count.id,
            productId: product.id,
            expectedQuantity: balances.get(product.id) ?? "0",
          })),
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/counts");
    target = `/counts?location=${encodeURIComponent(locationCode)}`;
  } catch (error) {
    target = destination(
      locationCode,
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function saveCountDraftAction(formData: FormData) {
  const countId = String(formData.get("countId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryCountError("FORBIDDEN");
    if (notes.length > 1000) throw new InventoryCountError("INVALID_INPUT");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (!fresh) throw new InventoryCountError("FORBIDDEN");
        requireDraftPermission(fresh);
        const count = await tx.inventoryCount.findUnique({
          where: { id: countId },
          select: {
            status: true,
            lines: {
              select: {
                id: true,
                productId: true,
                product: {
                  select: {
                    allowFractionalStock: true,
                    quantityScale: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (!count) throw new InventoryCountError("NOT_FOUND");
        if (count.status !== "DRAFT")
          throw new InventoryCountError("NOT_DRAFT");
        for (const line of count.lines) {
          const raw = formData.get(`quantity-${line.id}`);
          if (raw === null) continue;
          const countedQuantity = normalizeDraftCountedQuantity(
            String(raw),
            line.product,
          );
          await tx.inventoryCountLine.update({
            where: { id: line.id },
            data: { countedQuantity },
          });
        }
        await tx.inventoryCount.update({
          where: { id: countId },
          data: { notes: notes || null },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/counts");
    target = destination(locationCode, "success", "Count draft saved.");
  } catch (error) {
    target = destination(
      locationCode,
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function cancelCountAction(formData: FormData) {
  const countId = String(formData.get("countId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryCountError("FORBIDDEN");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (!fresh) throw new InventoryCountError("FORBIDDEN");
        requireAcceptPermission(fresh);
        const count = await tx.inventoryCount.findUnique({
          where: { id: countId },
          select: { status: true },
        });
        if (!count) throw new InventoryCountError("NOT_FOUND");
        if (count.status !== "DRAFT")
          throw new InventoryCountError("NOT_DRAFT");
        await tx.inventoryCount.update({
          where: { id: countId },
          data: { status: "CANCELLED" },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/counts");
    target = destination(locationCode, "success", "Count cancelled.");
  } catch (error) {
    target = destination(
      locationCode,
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function setSeasonOpeningAction(formData: FormData) {
  const locationId = String(formData.get("locationId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  const yearInput = Number(formData.get("year"));
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryCountError("FORBIDDEN");
    if (!isValidSeasonYear(yearInput))
      throw new InventoryCountError("INVALID_INPUT");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (!fresh) throw new InventoryCountError("FORBIDDEN");
        requireAcceptPermission(fresh);
        const location = await tx.location.findUnique({
          where: { id: locationId },
          select: { id: true, code: true, active: true },
        });
        if (!location?.active) throw new InventoryCountError("NOT_ELIGIBLE");
        const eligibleProducts = await tx.product.findMany({
          where: {
            active: true,
            productLocations: {
              some: { locationId, active: true, reviewRequired: false },
            },
          },
          select: {
            id: true,
            allowFractionalStock: true,
            quantityScale: true,
            category: { select: { name: true } },
          },
        });
        const eligibleById = new Map(
          eligibleProducts.map((product) => [product.id, product]),
        );
        const entries: Array<{ productId: string; quantity: string }> = [];
        for (const rawId of formData.getAll("productId")) {
          const productId = String(rawId);
          const product = eligibleById.get(productId);
          if (!product) continue;
          const quantity = normalizeDraftCountedQuantity(
            String(formData.get(`quantity-${productId}`) ?? ""),
            product,
          );
          if (quantity !== null) entries.push({ productId, quantity });
        }
        if (!entries.length) throw new InventoryCountError("INVALID_INPUT");

        const sourceId = seasonOpeningSourceId(location.code, yearInput);
        const existing = await tx.inventoryCount.findUnique({
          where: {
            sourceSystem_sourceId: {
              sourceSystem: SEASON_OPENING_SOURCE_SYSTEM,
              sourceId,
            },
          },
          select: { id: true },
        });
        const now = new Date();
        const notes = `Season ${yearInput} opening quantities set via Counts.`;
        let countId: string;
        if (existing) {
          countId = existing.id;
          await tx.inventoryCount.update({
            where: { id: countId },
            data: { notes, acceptedById: fresh.id, acceptedAt: now },
          });
          await tx.inventoryCountLine.deleteMany({
            where: { inventoryCountId: countId },
          });
        } else {
          const created = await tx.inventoryCount.create({
            data: {
              locationId,
              countDate: seasonOpeningCountDate(yearInput),
              status: "ACCEPTED",
              notes,
              createdById: fresh.id,
              acceptedById: fresh.id,
              acceptedAt: now,
              sourceSystem: SEASON_OPENING_SOURCE_SYSTEM,
              sourceId,
            },
          });
          countId = created.id;
        }
        await tx.inventoryCountLine.createMany({
          data: entries.map((entry) => ({
            inventoryCountId: countId,
            productId: entry.productId,
            expectedQuantity: entry.quantity,
            countedQuantity: entry.quantity,
            difference: "0",
          })),
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/counts");
    revalidatePath("/history");
    target = destination(
      locationCode,
      "success",
      `${yearInput} opening quantities saved.`,
    );
  } catch (error) {
    target = destination(
      locationCode,
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function acceptCountAction(formData: FormData) {
  const countId = String(formData.get("countId") ?? "");
  const locationCode = String(formData.get("locationCode") ?? "");
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new InventoryCountError("FORBIDDEN");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (!fresh) throw new InventoryCountError("FORBIDDEN");
        const count = await tx.inventoryCount.findUnique({
          where: { id: countId },
          select: {
            id: true,
            status: true,
            locationId: true,
            lines: {
              select: {
                id: true,
                productId: true,
                expectedQuantity: true,
                countedQuantity: true,
                product: {
                  select: {
                    allowFractionalStock: true,
                    quantityScale: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        if (!count) throw new InventoryCountError("NOT_FOUND");
        const results = calculateCountAcceptance(
          fresh,
          count.status,
          count.lines.map((line) => ({
            id: line.id,
            productId: line.productId,
            expectedQuantity: line.expectedQuantity.toString(),
            countedQuantity: line.countedQuantity?.toString() ?? null,
            product: line.product,
          })),
        );
        const occurredAt = new Date();
        const movementTransaction = createMovementTransaction(tx);
        for (const result of results) {
          await tx.inventoryCountLine.update({
            where: { id: result.lineId },
            data: {
              countedQuantity: result.countedQuantity,
              difference: result.difference,
            },
          });
          if (result.differenceIsZero) continue;
          await createValidatedMovement(movementTransaction, fresh, {
            type: "COUNT_ADJUSTMENT",
            productId: result.productId,
            quantity: result.difference,
            locationId: count.locationId,
            occurredAt,
            notes: `Physical count adjustment`,
            references: { countLineId: result.lineId },
          });
        }
        await tx.inventoryCount.update({
          where: { id: countId },
          data: {
            status: "ACCEPTED",
            acceptedById: fresh.id,
            acceptedAt: occurredAt,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/counts");
    revalidatePath("/inventory");
    revalidatePath("/history");
    target = destination(
      locationCode,
      "success",
      "Count accepted and inventory adjusted.",
    );
  } catch (error) {
    target = destination(
      locationCode,
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}
