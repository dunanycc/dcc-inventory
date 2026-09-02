"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { hasPermission } from "@/lib/authorization";
import { calculateDeliveryQuantity } from "@/lib/delivery";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

export async function postDeliveryAction(formData: FormData) {
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor || !hasPermission(actor.role, "operations:post"))
      throw new Error("FORBIDDEN");
    const vendorId = String(formData.get("vendorId") ?? "");
    const date = String(formData.get("deliveryDate") ?? "");
    const notes = String(formData.get("notes") ?? "").trim();
    const raw = JSON.parse(String(formData.get("items") ?? "[]")) as Array<{
      productId: string;
      quantity: string;
    }>;
    if (
      !vendorId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      notes.length > 1000 ||
      !Array.isArray(raw) ||
      !raw.length
    )
      throw new Error("INVALID");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (
          !fresh ||
          fresh.status !== "ACTIVE" ||
          !hasPermission(fresh.role, "operations:post")
        )
          throw new Error("FORBIDDEN");
        const vendor = await tx.vendor.findUnique({
          where: { id: vendorId },
          select: { active: true },
        });
        if (!vendor?.active) throw new Error("VENDOR");
        const bar = await tx.location.findUnique({
          where: { code: "BAR" },
          select: { id: true, active: true },
        });
        if (!bar?.active) throw new Error("BAR");
        const products = await tx.product.findMany({
          where: { id: { in: raw.map((i) => i.productId) } },
          include: {
            productLocations: {
              where: { locationId: bar.id },
              select: { active: true, reviewRequired: true },
            },
          },
        });
        const byId = new Map(products.map((p) => [p.id, p]));
        const computed = raw.map((item) => {
          const p = byId.get(item.productId);
          if (
            !p?.active ||
            !p.productLocations[0]?.active ||
            p.productLocations[0].reviewRequired
          )
            throw new Error("PRODUCT");
          return { p, ...calculateDeliveryQuantity(item.quantity, p) };
        });
        const occurredAt = new Date(`${date}T12:00:00.000Z`);
        const delivery = await tx.delivery.create({
          data: {
            vendorId,
            deliveryDate: occurredAt,
            notes: notes || null,
            recordedById: fresh.id,
          },
        });
        for (const item of computed) {
          const line = await tx.deliveryLine.create({
            data: {
              deliveryId: delivery.id,
              productId: item.p.id,
              quantity: item.stockQuantity,
              entryQuantity: item.entryQuantity,
              purchaseUnit: item.purchaseUnit,
              unitsPerPurchaseUnit: item.unitsPerPurchaseUnit,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              type: "RECEIPT",
              productId: item.p.id,
              quantity: item.stockQuantity,
              sourceLocationId: null,
              destinationLocationId: bar.id,
              occurredAt,
              postedById: fresh.id,
              deliveryLineId: line.id,
              notes: `Delivery ${delivery.id.slice(0, 8)}`,
            },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/deliveries");
    revalidatePath("/inventory");
    revalidatePath("/history");
    target =
      "/deliveries?success=" +
      encodeURIComponent("Delivery added to Bar inventory.");
  } catch (error) {
    console.error("Delivery posting failed", error);
    target =
      "/deliveries?error=" +
      encodeURIComponent(
        "Delivery could not be posted. Review the Vendor, date, products, and quantities.",
      );
  }
  redirect(target);
}

export async function updateDeliveryAction(formData: FormData) {
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor || !hasPermission(actor.role, "operations:post"))
      throw new Error("FORBIDDEN");
    const deliveryId = String(formData.get("deliveryId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const date = String(formData.get("deliveryDate") ?? "");
    const notes = String(formData.get("notes") ?? "").trim();
    const raw = JSON.parse(String(formData.get("items") ?? "[]")) as Array<{
      productId: string;
      quantity: string;
    }>;
    if (
      !deliveryId ||
      !vendorId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      notes.length > 1000 ||
      !Array.isArray(raw) ||
      !raw.length ||
      new Set(raw.map((item) => item.productId)).size !== raw.length
    )
      throw new Error("INVALID");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (
          !fresh ||
          fresh.status !== "ACTIVE" ||
          !hasPermission(fresh.role, "operations:post")
        )
          throw new Error("FORBIDDEN");
        const [vendor, bar, delivery] = await Promise.all([
          tx.vendor.findUnique({
            where: { id: vendorId },
            select: { active: true },
          }),
          tx.location.findUnique({
            where: { code: "BAR" },
            select: { id: true, active: true },
          }),
          tx.delivery.findUnique({
            where: { id: deliveryId },
            include: { lines: { include: { product: true } } },
          }),
        ]);
        if (
          !vendor ||
          (!vendor.active && delivery?.vendorId !== vendorId) ||
          !bar?.active ||
          !delivery ||
          delivery.voidedAt
        )
          throw new Error("INVALID");
        const products = await tx.product.findMany({
          where: { id: { in: raw.map((item) => item.productId) } },
          include: {
            productLocations: {
              where: { locationId: bar.id },
              select: { active: true, reviewRequired: true },
            },
          },
        });
        if (products.length !== raw.length) throw new Error("INVALID");
        const productById = new Map(
          products.map((product) => [product.id, product]),
        );
        const lineByProductId = new Map(
          delivery.lines.map((line) => [line.productId, line]),
        );
        const before = {
          vendorId: delivery.vendorId,
          deliveryDate: delivery.deliveryDate.toISOString(),
          notes: delivery.notes,
          lines: delivery.lines.map((line) => ({
            id: line.id,
            entryQuantity: line.entryQuantity.toString(),
            quantity: line.quantity.toString(),
            active: line.active,
          })),
        };
        const occurredAt = new Date();
        for (const item of raw) {
          const line = lineByProductId.get(item.productId);
          const product = productById.get(item.productId)!;
          if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(item.quantity))
            throw new Error("INVALID");
          const entry = new Prisma.Decimal(item.quantity);
          const oldQuantity = line?.active
            ? new Prisma.Decimal(line.quantity)
            : new Prisma.Decimal(0);
          if (entry.isZero()) {
            if (line?.active)
              await tx.deliveryLine.update({
                where: { id: line.id },
                data: { active: false },
              });
            if (!oldQuantity.isZero())
              await tx.inventoryMovement.create({
                data: {
                  type: "COUNT_ADJUSTMENT",
                  productId: item.productId,
                  quantity: oldQuantity,
                  sourceLocationId: bar.id,
                  destinationLocationId: null,
                  occurredAt,
                  postedById: fresh.id,
                  notes: `Delivery ${delivery.id.slice(0, 8)} correction: removed ${product.name}`,
                },
              });
            continue;
          }
          if (
            !line &&
            (!product.active ||
              !product.productLocations[0]?.active ||
              product.productLocations[0].reviewRequired)
          )
            throw new Error("PRODUCT");
          const calculated = calculateDeliveryQuantity(item.quantity, {
            allowFractionalStock: product.allowFractionalStock,
            quantityScale: product.quantityScale,
            purchaseUnit: line?.purchaseUnit ?? product.purchaseUnit,
            unitsPerPurchaseUnit:
              line?.unitsPerPurchaseUnit ?? product.unitsPerPurchaseUnit,
          });
          const newQuantity = new Prisma.Decimal(calculated.stockQuantity);
          const difference = newQuantity.minus(oldQuantity);
          if (line)
            await tx.deliveryLine.update({
              where: { id: line.id },
              data: {
                entryQuantity: calculated.entryQuantity,
                quantity: calculated.stockQuantity,
                active: true,
              },
            });
          else
            await tx.deliveryLine.create({
              data: {
                deliveryId: delivery.id,
                productId: product.id,
                entryQuantity: calculated.entryQuantity,
                quantity: calculated.stockQuantity,
                purchaseUnit: calculated.purchaseUnit,
                unitsPerPurchaseUnit: calculated.unitsPerPurchaseUnit,
              },
            });
          if (!difference.isZero())
            await tx.inventoryMovement.create({
              data: {
                type: "COUNT_ADJUSTMENT",
                productId: item.productId,
                quantity: difference.abs(),
                sourceLocationId: difference.isNegative() ? bar.id : null,
                destinationLocationId: difference.isPositive() ? bar.id : null,
                occurredAt,
                postedById: fresh.id,
                notes: `Delivery ${delivery.id.slice(0, 8)} correction: ${product.name}`,
              },
            });
        }
        const deliveryDate = new Date(`${date}T12:00:00.000Z`);
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { vendorId, deliveryDate, notes: notes || null },
        });
        await tx.auditEvent.create({
          data: {
            actorId: fresh.id,
            action: "DELIVERY_UPDATED",
            entityType: "Delivery",
            entityId: delivery.id,
            before,
            after: {
              vendorId,
              deliveryDate: deliveryDate.toISOString(),
              notes: notes || null,
              lines: raw,
            },
            correlationId: randomUUID(),
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/deliveries");
    revalidatePath("/inventory");
    revalidatePath("/history");
    target =
      "/deliveries?success=" +
      encodeURIComponent("Delivery updated and inventory correction recorded.");
  } catch (error) {
    console.error("Delivery update failed", error);
    target =
      "/deliveries?error=" +
      encodeURIComponent(
        "Delivery could not be updated. Review the Vendor, date, and quantities.",
      );
  }
  redirect(target);
}

export async function voidDeliveryAction(formData: FormData) {
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor || !hasPermission(actor.role, "operations:post"))
      throw new Error("FORBIDDEN");
    const deliveryId = String(formData.get("deliveryId") ?? "");
    const voidComment = String(formData.get("voidComment") ?? "").trim();
    if (!deliveryId || !voidComment || voidComment.length > 1000)
      throw new Error("INVALID");
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        if (
          !fresh ||
          fresh.status !== "ACTIVE" ||
          !hasPermission(fresh.role, "operations:post")
        )
          throw new Error("FORBIDDEN");
        const [bar, delivery] = await Promise.all([
          tx.location.findUnique({
            where: { code: "BAR" },
            select: { id: true, active: true },
          }),
          tx.delivery.findUnique({
            where: { id: deliveryId },
            include: { lines: { include: { product: true } } },
          }),
        ]);
        if (!bar?.active || !delivery) throw new Error("INVALID");
        if (delivery.voidedAt) throw new Error("ALREADY_VOIDED");
        const occurredAt = new Date();
        const activeLines = delivery.lines.filter((line) => line.active);
        for (const line of activeLines) {
          await tx.deliveryLine.update({
            where: { id: line.id },
            data: { active: false },
          });
          await tx.inventoryMovement.create({
            data: {
              type: "COUNT_ADJUSTMENT",
              productId: line.productId,
              quantity: line.quantity,
              sourceLocationId: bar.id,
              destinationLocationId: null,
              occurredAt,
              postedById: fresh.id,
              notes: `Delivery ${delivery.id.slice(0, 8)} voided: removed ${line.product.name}`,
            },
          });
        }
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { voidedAt: occurredAt, voidedById: fresh.id, voidComment },
        });
        await tx.auditEvent.create({
          data: {
            actorId: fresh.id,
            action: "DELIVERY_VOIDED",
            entityType: "Delivery",
            entityId: delivery.id,
            before: {
              voidedAt: null,
              lines: activeLines.map((line) => ({
                id: line.id,
                productId: line.productId,
                quantity: line.quantity.toString(),
              })),
            },
            after: { voidedAt: occurredAt.toISOString(), voidComment },
            correlationId: randomUUID(),
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/deliveries");
    revalidatePath("/inventory");
    revalidatePath("/history");
    target =
      "/deliveries?success=" +
      encodeURIComponent("Delivery voided and inventory corrected.");
  } catch (error) {
    console.error("Delivery void failed", error);
    target =
      "/deliveries?error=" +
      encodeURIComponent("Delivery could not be voided.");
  }
  redirect(target);
}
