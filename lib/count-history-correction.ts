import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import {
  normalizeCountedQuantity,
  requireAcceptPermission,
} from "./inventory-count";
import { decimalToMicros, microsToDecimal } from "./decimal-quantity";
type RevisionLine = {
  productId: string;
  expectedQuantity: { toString(): string };
  countedQuantity: { toString(): string } | null;
};
export function countHistoryRevision(lines: RevisionLine[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...lines]
          .sort((a, b) => a.productId.localeCompare(b.productId))
          .map((line) => [
            line.productId,
            line.expectedQuantity.toString(),
            line.countedQuantity?.toString() ?? null,
          ]),
      ),
    )
    .digest("hex");
}
export type CountCorrectionInput = {
  countId: string;
  revision: string;
  reason: string;
  entries: { productId: string; quantity: string }[];
};
export async function correctCountHistory(
  actorId: string,
  input: CountCorrectionInput,
) {
  const reason = input.reason.trim();
  if (
    !reason ||
    reason.length > 1000 ||
    !input.entries.length ||
    input.entries.length > 1000 ||
    new Set(input.entries.map((e) => e.productId)).size !== input.entries.length
  )
    throw new Error("Enter a correction reason and at least one quantity.");
  return prisma.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { id: true, role: true, status: true },
      });
      if (!actor) throw new Error("Sign in to correct counts.");
      requireAcceptPermission(actor);
      const count = await tx.inventoryCount.findUniqueOrThrow({
        where: { id: input.countId },
        include: { lines: true },
      });
      if (count.status !== "ACCEPTED")
        throw new Error("Only accepted counts can be corrected here.");
      if (countHistoryRevision(count.lines) !== input.revision)
        throw new Error(
          "This count changed. Reload before saving your corrections.",
        );
      const changes: {
        productId: string;
        before: string | null;
        after: string;
      }[] = [];
      for (const entry of input.entries) {
        const previous = count.lines.find(
          (line) => line.productId === entry.productId,
        );
        const product = await tx.product.findUniqueOrThrow({
          where: { id: entry.productId },
          include: { category: { select: { name: true } } },
        });
        if (!previous) {
          const assignment = await tx.productLocation.findUnique({
            where: {
              productId_locationId: {
                productId: product.id,
                locationId: count.locationId,
              },
            },
          });
          if (
            !product.active ||
            !assignment?.active ||
            assignment.reviewRequired
          )
            throw new Error(
              "The added product is not available at this location.",
            );
        }
        const quantity = normalizeCountedQuantity(entry.quantity, product);
        if (
          previous?.countedQuantity !== null &&
          previous?.countedQuantity !== undefined &&
          decimalToMicros(previous.countedQuantity.toString()) ===
            decimalToMicros(quantity)
        )
          continue;
        const expected = previous?.expectedQuantity.toString() ?? "0";
        const difference = microsToDecimal(
          decimalToMicros(quantity) - decimalToMicros(expected),
        );
        await tx.inventoryCountLine.upsert({
          where: {
            inventoryCountId_productId: {
              inventoryCountId: count.id,
              productId: product.id,
            },
          },
          create: {
            inventoryCountId: count.id,
            productId: product.id,
            expectedQuantity: expected,
            countedQuantity: quantity,
            difference,
          },
          update: { countedQuantity: quantity, difference },
        });
        changes.push({
          productId: product.id,
          before: previous?.countedQuantity?.toString() ?? null,
          after: quantity,
        });
      }
      if (changes.length)
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "COUNT_HISTORY_CORRECTED",
            entityType: "InventoryCount",
            entityId: count.id,
            reason,
            before: {
              lines: changes.map((change) => ({
                productId: change.productId,
                quantity: change.before,
              })),
            },
            after: {
              lines: changes.map((change) => ({
                productId: change.productId,
                quantity: change.after,
              })),
              countDate: count.countDate.toISOString(),
              liveInventoryChanged: false,
            },
          },
        });
      return changes.length;
    },
    { isolationLevel: "Serializable" },
  );
}
