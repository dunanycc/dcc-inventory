import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "./prisma";
import type {
  MovementCreateInput,
  MovementRecord,
  MovementRepository,
  MovementTransaction,
} from "./inventory-movement";

function movementRecord(
  record: Omit<MovementRecord, "quantity"> & {
    quantity: { toString(): string } | string;
  },
): MovementRecord {
  return { ...record, quantity: record.quantity.toString() };
}

export function createMovementTransaction(
  tx: Prisma.TransactionClient,
): MovementTransaction {
  return {
    findActorById: (id) =>
      tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, status: true },
      }),
    findProductById: (id) =>
      tx.product.findUnique({
        where: { id },
        select: {
          id: true,
          active: true,
          allowFractionalStock: true,
          quantityScale: true,
        },
      }),
    findLocationById: (id) =>
      tx.location.findUnique({
        where: { id },
        select: { id: true, active: true },
      }),
    findProductLocation: (productId, locationId) =>
      tx.productLocation.findUnique({
        where: { productId_locationId: { productId, locationId } },
        select: { active: true, reviewRequired: true },
      }),
    hasOpeningMovement: async (productId, locationId) =>
      Boolean(
        await tx.inventoryMovement.findFirst({
          where: {
            type: "OPENING",
            productId,
            destinationLocationId: locationId,
          },
          select: { id: true },
        }),
      ),
    createMovement: async (input: MovementCreateInput) =>
      movementRecord(
        await tx.inventoryMovement.create({
          data: input,
          select: {
            id: true,
            type: true,
            productId: true,
            quantity: true,
            sourceLocationId: true,
            destinationLocationId: true,
            occurredAt: true,
            postedById: true,
            notes: true,
          },
        }),
      ),
  };
}

export const prismaMovementRepository: MovementRepository = {
  transaction: (work) =>
    prisma.$transaction((tx) => work(createMovementTransaction(tx)), {
      isolationLevel: "Serializable",
    }),
};
