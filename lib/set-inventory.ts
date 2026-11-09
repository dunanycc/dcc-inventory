import { prisma } from "./prisma";
import {
  InventoryCountError,
  normalizeCountedQuantity,
  requireAcceptPermission,
} from "./inventory-count";
import {
  combineMovementSums,
  decimalToMicros,
  microsToDecimal,
} from "./inventory-balances";
import { createValidatedMovement } from "./inventory-movement";
import { createMovementTransaction } from "./prisma-movement-repository";

export async function setInventory(
  actorId: string,
  input: {
    locationId: string;
    entries: { productId: string; quantity: string }[];
    notes: string;
  },
) {
  if (
    !input.entries.length ||
    new Set(input.entries.map((entry) => entry.productId)).size !==
      input.entries.length
  )
    throw new InventoryCountError("INVALID_INPUT");
  return prisma.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { id: true, role: true, status: true },
      });
      if (!actor) throw new InventoryCountError("FORBIDDEN");
      requireAcceptPermission(actor);
      const repository = createMovementTransaction(tx);
      const location = await repository.findLocationById(input.locationId);
      if (!location?.active) throw new InventoryCountError("NOT_ELIGIBLE");
      const changes = [];
      for (const entry of input.entries) {
        const product = await repository.findProductById(entry.productId);
        const assignment = await repository.findProductLocation(
          entry.productId,
          input.locationId,
        );
        if (
          !product?.active ||
          !assignment?.active ||
          assignment.reviewRequired
        )
          throw new InventoryCountError("NOT_ELIGIBLE");
        const target = normalizeCountedQuantity(entry.quantity, product);
        const [incoming, outgoing] = await Promise.all([
          tx.inventoryMovement.aggregate({
            where: {
              productId: entry.productId,
              destinationLocationId: input.locationId,
            },
            _sum: { quantity: true },
          }),
          tx.inventoryMovement.aggregate({
            where: {
              productId: entry.productId,
              sourceLocationId: input.locationId,
            },
            _sum: { quantity: true },
          }),
        ]);
        const before = combineMovementSums(
          [
            {
              productId: entry.productId,
              quantity: incoming._sum.quantity?.toString() || "0",
            },
          ],
          [
            {
              productId: entry.productId,
              quantity: outgoing._sum.quantity?.toString() || "0",
            },
          ],
        ).get(entry.productId)!;
        const delta = decimalToMicros(target) - decimalToMicros(before);
        if (delta !== BigInt(0))
          await createValidatedMovement(repository, actor, {
            type: "COUNT_ADJUSTMENT",
            productId: entry.productId,
            quantity: microsToDecimal(delta),
            locationId: input.locationId,
            occurredAt: new Date(),
            notes: input.notes || "Set Inventory",
          });
        changes.push({ productId: entry.productId, before, quantity: target });
      }
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "INVENTORY_SET",
          entityType: "Location",
          entityId: input.locationId,
          after: { changes },
          reason: input.notes || "Set Inventory",
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
