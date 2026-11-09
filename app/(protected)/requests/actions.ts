"use server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { inventoryQuantityScale } from "@/lib/quantity-policy";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  notifyNewStockRequest,
  notifyStockRequestChanged,
} from "@/lib/request-notifications";
import { currentUser } from "@/lib/session";
import {
  deriveRequestStatus,
  StockRequestError,
  validateFulfillment,
  validateRequestSubmission,
  type RequestProduct,
} from "@/lib/stock-request";

function parseEntries(
  value: FormDataEntryValue | null,
  idKey: "productId" | "lineId",
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    throw new StockRequestError("INVALID_INPUT");
  }
  if (!Array.isArray(parsed)) throw new StockRequestError("INVALID_INPUT");
  return parsed.map((item) => {
    if (!item || typeof item !== "object")
      throw new StockRequestError("INVALID_INPUT");
    const id = String((item as Record<string, unknown>)[idKey] ?? "");
    const quantity = String((item as Record<string, unknown>).quantity ?? "");
    if (!id) throw new StockRequestError("INVALID_INPUT");
    return { [idKey]: id, quantity } as {
      productId: string;
      quantity: string;
    } & { lineId: string; quantity: string };
  });
}

function unitLabel(product: {
  stockUnit: string;
  stockUnitLabel: string | null;
  packageSize: string | null;
}) {
  const unit =
    product.stockUnit === "OTHER"
      ? product.stockUnitLabel || "Other"
      : product.stockUnit
          .toLowerCase()
          .replace(/^./, (value) => value.toUpperCase());
  return product.packageSize ? `${unit} · ${product.packageSize}` : unit;
}

function productShape(product: {
  id: string;
  active: boolean;
  starterShackRequestEligible: boolean;
  allowFractionalStock: boolean;
  quantityScale: number;
  category?: { name: string };
  productLocations: Array<{
    active: boolean;
    reviewRequired: boolean;
    location: { code: string; active: boolean };
  }>;
}): RequestProduct {
  const eligible = (code: string) =>
    product.productLocations.some(
      (item) =>
        item.location.code === code &&
        item.location.active &&
        item.active &&
        !item.reviewRequired,
    );
  return {
    id: product.id,
    active: product.active,
    starterShackRequestEligible: product.starterShackRequestEligible,
    allowFractionalStock: product.allowFractionalStock,
    quantityScale: inventoryQuantityScale(product),
    barEligible: eligible("BAR"),
    shackEligible: eligible("STARTER_SHACK"),
  };
}

const messages: Record<string, string> = {
  FORBIDDEN: "You do not have permission for that request action.",
  INVALID_INPUT: "Enter at least one valid quantity.",
  NOT_ELIGIBLE: "A Product is no longer available for Starter Shack requests.",
  NOT_FOUND: "The request or request line no longer exists.",
  NOT_OPEN: "This request is no longer open.",
  OVER_FULFILLMENT: "A quantity exceeds what remains on the request.",
  INSUFFICIENT_STOCK:
    "There is not enough tracked Bar inventory to give that quantity.",
  CONFLICT: "The request changed at the same time. Refresh and try again.",
  FAILED: "The request could not be saved.",
};

const optionalEmail = z.union([z.literal(""), z.email().max(320)]);

function errorCode(error: unknown) {
  if (error instanceof StockRequestError) return error.code;
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "P2034"
  )
    return "CONFLICT";
  console.error("Starter Shack request action failed", error);
  return "FAILED";
}

function destination(path: string, kind: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${kind}=${encodeURIComponent(message)}`;
}

export async function submitStockRequestAction(formData: FormData) {
  let target: string;
  try {
    const actor = await currentUser();
    const jar = await cookies();
    const existingSession = jar.get("shack-session")?.value;
    const publicSessionId =
      existingSession && /^[0-9a-f-]{36}$/i.test(existingSession)
        ? existingSession
        : randomUUID();
    if (!actor)
      jar.set("shack-session", publicSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/starter-shack",
        maxAge: 60 * 60 * 24 * 180,
      });
    const publicActor = {
      id: "public",
      role: "INVENTORY_USER" as const,
      status: "ACTIVE" as const,
    };
    const raw = parseEntries(formData.get("items"), "productId");
    const productIds = raw.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        category: { select: { name: true } },
        productLocations: {
          include: { location: { select: { code: true, active: true } } },
        },
      },
    });
    validateRequestSubmission(
      actor ?? publicActor,
      raw,
      new Map(products.map((product) => [product.id, productShape(product)])),
    );
    const notes = String(formData.get("notes") ?? "").trim();
    if (notes.length > 1000) throw new StockRequestError("INVALID_INPUT");
    const created = await prisma.$transaction(
      async (transaction) => {
        const freshActor = actor
          ? await transaction.user.findUnique({
              where: { id: actor.id },
              select: { id: true, role: true, status: true },
            })
          : null;
        if (actor && !freshActor) throw new StockRequestError("FORBIDDEN");
        const freshProducts = await transaction.product.findMany({
          where: { id: { in: productIds } },
          include: {
            category: { select: { name: true } },
            productLocations: {
              include: { location: { select: { code: true, active: true } } },
            },
          },
        });
        const validated = validateRequestSubmission(
          freshActor ?? publicActor,
          raw,
          new Map(
            freshProducts.map((product) => [product.id, productShape(product)]),
          ),
        );
        const stockRequest = await transaction.stockRequest.create({
          data: {
            requestedById: freshActor?.id ?? null,
            publicSessionId: actor ? null : publicSessionId,
            notes: notes || null,
            lines: {
              create: validated.map((item) => ({
                productId: item.productId,
                requestedQuantity: item.quantity,
              })),
            },
          },
        });
        return { id: stockRequest.id, lines: validated };
      },
      { isolationLevel: "Serializable" },
    );
    const settings = await prisma.stockRequestNotificationSettings.findUnique({
      where: { id: "default" },
      select: { orderNotificationEmail: true },
    });
    try {
      const productInfo = new Map(
        products.map((product) => [
          product.id,
          { name: product.name, unit: unitLabel(product) },
        ]),
      );
      const items = created.lines.map((line) => ({
        name: productInfo.get(line.productId)?.name ?? "Product",
        unit: productInfo.get(line.productId)?.unit ?? "",
        quantity: line.quantity,
      }));
      await notifyNewStockRequest(
        settings?.orderNotificationEmail ?? null,
        actor?.name || actor?.email || "Starter Shack",
        created.id,
        items,
        notes || null,
      );
    } catch (error) {
      console.error("New stock request email failed", error);
    }
    revalidatePath("/requests");
    revalidatePath("/starter-shack");
    target = destination(
      "/starter-shack?tab=status",
      "success",
      "Request submitted to the Bar.",
    );
  } catch (error) {
    target = destination(
      "/starter-shack?tab=new",
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function fulfillStockRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor) throw new StockRequestError("FORBIDDEN");
    const raw = parseEntries(formData.get("items"), "lineId").filter(
      (item) => item.quantity && !/^0+(?:\.0+)?$/.test(item.quantity),
    );
    const {
      status: finalStatus,
      givenItems,
      requesterEmail,
    } = await prisma.$transaction(
      async (transaction) => {
        const freshActor = await transaction.user.findUnique({
          where: { id: actor.id },
          select: { id: true, role: true, status: true },
        });
        const request = await transaction.stockRequest.findUnique({
          where: { id: requestId },
          include: {
            requestedBy: { select: { email: true } },
            lines: {
              include: {
                product: {
                  include: {
                    category: { select: { name: true } },
                    productLocations: {
                      include: {
                        location: { select: { code: true, active: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!freshActor) throw new StockRequestError("FORBIDDEN");
        if (!request) throw new StockRequestError("NOT_FOUND");
        const locations = await transaction.location.findMany({
          where: { code: { in: ["BAR", "STARTER_SHACK"] } },
          select: { id: true, code: true, active: true },
        });
        const bar = locations.find((location) => location.code === "BAR");
        const shack = locations.find(
          (location) => location.code === "STARTER_SHACK",
        );
        if (!bar?.active || !shack?.active)
          throw new StockRequestError("NOT_ELIGIBLE");
        const products = new Map(
          request.lines.map((line) => [
            line.productId,
            productShape(line.product),
          ]),
        );
        const lineStates = new Map(
          request.lines.map((line) => [
            line.id,
            {
              id: line.id,
              productId: line.productId,
              requestedQuantity: line.requestedQuantity.toString(),
              quantityGiven: line.quantityGiven.toString(),
              product: products.get(line.productId)!,
            },
          ]),
        );
        const productIds = [
          ...new Set(
            raw
              .map((entry) => lineStates.get(entry.lineId)?.productId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const [incoming, outgoing] = await Promise.all([
          transaction.inventoryMovement.groupBy({
            by: ["productId"],
            where: {
              productId: { in: productIds },
              destinationLocationId: bar.id,
            },
            _sum: { quantity: true },
          }),
          transaction.inventoryMovement.groupBy({
            by: ["productId"],
            where: { productId: { in: productIds }, sourceLocationId: bar.id },
            _sum: { quantity: true },
          }),
        ]);
        const balances = new Map(
          productIds.map((id) => [id, new Prisma.Decimal(0)]),
        );
        for (const row of incoming)
          balances.set(
            row.productId,
            (balances.get(row.productId) ?? new Prisma.Decimal(0)).add(
              row._sum.quantity ?? 0,
            ),
          );
        for (const row of outgoing)
          balances.set(
            row.productId,
            (balances.get(row.productId) ?? new Prisma.Decimal(0)).sub(
              row._sum.quantity ?? 0,
            ),
          );
        const entries = validateFulfillment(
          freshActor,
          request.status,
          raw,
          lineStates,
          products,
          new Map([...balances].map(([id, value]) => [id, value.toString()])),
        );
        const now = new Date();
        const transfer = await transaction.transfer.create({
          data: {
            stockRequestId: request.id,
            sourceLocationId: bar.id,
            destinationLocationId: shack.id,
            occurredAt: now,
            completedAt: now,
            postedById: freshActor.id,
            notes: `Starter Shack request ${request.id.slice(0, 8)}`,
          },
        });
        for (const entry of entries) {
          const transferLine = await transaction.transferLine.create({
            data: {
              transferId: transfer.id,
              stockRequestLineId: entry.lineId,
              productId: entry.productId,
              quantity: entry.quantity,
            },
          });
          await transaction.inventoryMovement.create({
            data: {
              type: "TRANSFER",
              productId: entry.productId,
              quantity: entry.quantity,
              sourceLocationId: bar.id,
              destinationLocationId: shack.id,
              occurredAt: now,
              postedById: freshActor.id,
              transferLineId: transferLine.id,
              notes: `Starter Shack request ${request.id.slice(0, 8)}`,
            },
          });
          await transaction.stockRequestLine.update({
            where: { id: entry.lineId },
            data: { quantityGiven: { increment: entry.quantity } },
          });
        }
        const updated = await transaction.stockRequestLine.findMany({
          where: { stockRequestId: request.id },
          select: { requestedQuantity: true, quantityGiven: true },
        });
        const status = deriveRequestStatus(
          updated.map((line) => ({
            requestedQuantity: line.requestedQuantity.toString(),
            quantityGiven: line.quantityGiven.toString(),
          })),
        );
        await transaction.stockRequest.update({
          where: { id: request.id },
          data: { status, completedAt: status === "GIVEN" ? now : null },
        });
        const productById = new Map(
          request.lines.map((line) => [line.productId, line.product]),
        );
        const givenItems = entries.map((entry) => {
          const product = productById.get(entry.productId);
          return {
            name: product?.name ?? "Product",
            unit: product ? unitLabel(product) : "",
            quantity: entry.quantity,
          };
        });
        return {
          status,
          givenItems,
          requesterEmail: request.requestedBy?.email ?? "",
        };
      },
      { isolationLevel: "Serializable" },
    );
    if (finalStatus === "GIVEN" || finalStatus === "PARTIALLY_GIVEN") {
      try {
        await notifyStockRequestChanged(
          await requesterRecipients(requesterEmail),
          finalStatus,
          requestId,
          { givenItems },
        );
      } catch (error) {
        console.error("Stock request update email failed", error);
      }
    }
    revalidatePath("/requests");
    revalidatePath("/starter-shack");
    revalidatePath("/inventory");
    revalidatePath("/history");
    target = destination(
      "/requests",
      "success",
      "Stock given and inventory transferred.",
    );
  } catch (error) {
    target = destination(
      "/requests",
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function cancelStockRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const closureComment = String(formData.get("closureComment") ?? "").trim();
  let target: string;
  try {
    const actor = await currentUser();
    const requesterEmail = await prisma.$transaction(
      async (transaction) => {
        const freshActor =
          actor &&
          (await transaction.user.findUnique({
            where: { id: actor.id },
            select: { role: true, status: true },
          }));
        if (
          !freshActor ||
          freshActor.status !== "ACTIVE" ||
          !hasPermission(freshActor.role, "operations:post")
        )
          throw new StockRequestError("FORBIDDEN");
        const request = await transaction.stockRequest.findUnique({
          where: { id: requestId },
          select: { status: true, requestedBy: { select: { email: true } } },
        });
        if (!request) throw new StockRequestError("NOT_FOUND");
        if (!closureComment || closureComment.length > 1000)
          throw new StockRequestError("INVALID_INPUT");
        if (!["SUBMITTED", "PARTIALLY_GIVEN"].includes(request.status))
          throw new StockRequestError("NOT_OPEN");
        await transaction.stockRequest.update({
          where: { id: requestId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            closureComment,
          },
        });
        return request.requestedBy?.email ?? "";
      },
      { isolationLevel: "Serializable" },
    );
    try {
      await notifyStockRequestChanged(
        await requesterRecipients(requesterEmail),
        "CANCELLED",
        requestId,
        {
          closureComment,
        },
      );
    } catch (error) {
      console.error("Cancelled stock request email failed", error);
    }
    revalidatePath("/requests");
    revalidatePath("/starter-shack");
    target = destination(
      "/requests",
      "success",
      "Request cancelled. Previously given stock was not changed.",
    );
  } catch (error) {
    target = destination(
      "/requests",
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

export async function closeStockRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const closureComment = String(formData.get("closureComment") ?? "").trim();
  let target: string;
  try {
    const actor = await currentUser();
    const requesterEmail = await prisma.$transaction(
      async (transaction) => {
        const freshActor =
          actor &&
          (await transaction.user.findUnique({
            where: { id: actor.id },
            select: { id: true, role: true, status: true },
          }));
        if (
          !freshActor ||
          freshActor.status !== "ACTIVE" ||
          !hasPermission(freshActor.role, "operations:post")
        )
          throw new StockRequestError("FORBIDDEN");
        const request = await transaction.stockRequest.findUnique({
          where: { id: requestId },
          select: { status: true, requestedBy: { select: { email: true } } },
        });
        if (!request) throw new StockRequestError("NOT_FOUND");
        if (request.status !== "PARTIALLY_GIVEN")
          throw new StockRequestError("NOT_OPEN");
        if (!closureComment || closureComment.length > 1000)
          throw new StockRequestError("INVALID_INPUT");
        const now = new Date();
        await transaction.stockRequest.update({
          where: { id: requestId },
          data: { status: "CLOSED", completedAt: now, closureComment },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: freshActor.id,
            action: "STOCK_REQUEST_CLOSED",
            entityType: "StockRequest",
            entityId: requestId,
            before: { status: request.status },
            after: {
              status: "CLOSED",
              completedAt: now.toISOString(),
              closureComment,
            },
          },
        });
        return request.requestedBy?.email ?? "";
      },
      { isolationLevel: "Serializable" },
    );
    try {
      await notifyStockRequestChanged(
        await requesterRecipients(requesterEmail),
        "CLOSED",
        requestId,
        {
          closureComment,
        },
      );
    } catch (error) {
      console.error("Closed stock request email failed", error);
    }
    revalidatePath("/requests");
    revalidatePath("/starter-shack");
    target = destination(
      "/requests",
      "success",
      "Partially given request closed. Previously given stock was not changed.",
    );
  } catch (error) {
    target = destination(
      "/requests",
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}

async function requesterRecipients(email: string) {
  const settings = await prisma.stockRequestNotificationSettings.findUnique({
    where: { id: "default" },
    select: { requesterNotificationEmail: true },
  });
  return [
    ...new Set(
      [email, settings?.requesterNotificationEmail]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase()),
    ),
  ].join(", ");
}

export async function updateRequestNotificationSettingsAction(
  formData: FormData,
) {
  let target: string;
  try {
    const actor = await currentUser();
    if (!actor || !hasPermission(actor.role, "operations:post"))
      throw new StockRequestError("FORBIDDEN");
    const orderNotificationEmail = String(
      formData.get("orderNotificationEmail") ?? "",
    )
      .trim()
      .toLowerCase();
    const requesterNotificationEmail = String(
      formData.get("requesterNotificationEmail") ?? "",
    )
      .trim()
      .toLowerCase();
    if (
      !optionalEmail.safeParse(requesterNotificationEmail).success ||
      !optionalEmail.safeParse(orderNotificationEmail).success
    )
      throw new StockRequestError("INVALID_INPUT");
    await prisma.$transaction(async (transaction) => {
      const freshActor = await transaction.user.findUnique({
        where: { id: actor.id },
        select: { id: true, role: true, status: true },
      });
      if (
        !freshActor ||
        freshActor.status !== "ACTIVE" ||
        !hasPermission(freshActor.role, "operations:post")
      )
        throw new StockRequestError("FORBIDDEN");
      const before =
        await transaction.stockRequestNotificationSettings.findUnique({
          where: { id: "default" },
        });
      const settings =
        await transaction.stockRequestNotificationSettings.upsert({
          where: { id: "default" },
          create: {
            id: "default",
            orderNotificationEmail: orderNotificationEmail || null,
            requesterNotificationEmail: requesterNotificationEmail || null,
          },
          update: {
            orderNotificationEmail: orderNotificationEmail || null,
            requesterNotificationEmail: requesterNotificationEmail || null,
          },
        });
      await transaction.auditEvent.create({
        data: {
          actorId: freshActor.id,
          action: "STOCK_REQUEST_NOTIFICATION_SETTINGS_UPDATED",
          entityType: "StockRequestNotificationSettings",
          entityId: settings.id,
          before: before
            ? {
                orderNotificationEmail: before.orderNotificationEmail,
                requesterNotificationEmail: before.requesterNotificationEmail,
              }
            : undefined,
          after: {
            orderNotificationEmail: settings.orderNotificationEmail,
            requesterNotificationEmail: settings.requesterNotificationEmail,
          },
        },
      });
    });
    revalidatePath("/requests");
    target = destination(
      "/requests",
      "success",
      "Notification email settings saved.",
    );
  } catch (error) {
    target = destination(
      "/requests",
      "error",
      messages[errorCode(error)] ?? messages.FAILED,
    );
  }
  redirect(target);
}
