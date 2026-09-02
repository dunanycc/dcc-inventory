import { inventoryPostingEligibility } from "./product-location-management";
import { hasPermission, type AppRole } from "./authorization";

export const INVENTORY_MOVEMENT_TYPES = [
  "OPENING",
  "RECEIPT",
  "TRANSFER",
  "COUNT_ADJUSTMENT",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type MovementActor = {
  id: string;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
};
export type MovementProduct = {
  id: string;
  active: boolean;
  allowFractionalStock: boolean;
  quantityScale: number;
};
export type MovementLocation = { id: string; active: boolean };
export type MovementProductLocation = {
  active: boolean;
  reviewRequired: boolean;
};
export type MovementSource = { system: string; id: string };
export type MovementReferences = {
  receiptLineId?: string;
  transferLineId?: string;
  countLineId?: string;
};
export type MovementRecord = {
  id: string;
  type: InventoryMovementType;
  productId: string;
  quantity: string;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  occurredAt: Date;
  postedById: string;
  notes: string | null;
};

export type MovementCreateInput = Omit<MovementRecord, "id"> &
  MovementReferences & { sourceSystem?: string; sourceId?: string };
export type MovementTransaction = {
  findActorById(id: string): Promise<MovementActor | null>;
  findProductById(id: string): Promise<MovementProduct | null>;
  findLocationById(id: string): Promise<MovementLocation | null>;
  findProductLocation(
    productId: string,
    locationId: string,
  ): Promise<MovementProductLocation | null>;
  hasOpeningMovement(productId: string, locationId: string): Promise<boolean>;
  createMovement(input: MovementCreateInput): Promise<MovementRecord>;
};
export type MovementRepository = {
  transaction<T>(
    work: (transaction: MovementTransaction) => Promise<T>,
  ): Promise<T>;
};

export type InventoryMovementInput =
  | {
      type: "OPENING" | "RECEIPT";
      productId: string;
      quantity: string;
      destinationLocationId: string;
      occurredAt: Date;
      notes?: string;
      source?: MovementSource;
      references?: MovementReferences;
    }
  | {
      type: "TRANSFER";
      productId: string;
      quantity: string;
      sourceLocationId: string;
      destinationLocationId: string;
      occurredAt: Date;
      notes?: string;
      source?: MovementSource;
      references?: MovementReferences;
    }
  | {
      type: "COUNT_ADJUSTMENT";
      productId: string;
      quantity: string;
      locationId: string;
      occurredAt: Date;
      notes?: string;
      source?: MovementSource;
      references?: MovementReferences;
    };

export class InventoryMovementError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "PRODUCT_NOT_FOUND"
      | "LOCATION_NOT_FOUND"
      | "NOT_ELIGIBLE"
      | "DUPLICATE_OPENING",
  ) {
    super(code);
  }
}

function normalizeNotes(notes: string | undefined) {
  const value = notes?.trim().replace(/\s+/g, " ") || null;
  if (value && value.length > 1000)
    throw new InventoryMovementError("INVALID_INPUT");
  return value;
}

function normalizeSource(source: MovementSource | undefined) {
  if (!source) return undefined;
  const normalized = { system: source.system.trim(), id: source.id.trim() };
  if (
    !normalized.system ||
    !normalized.id ||
    normalized.system.length > 100 ||
    normalized.id.length > 200
  )
    throw new InventoryMovementError("INVALID_INPUT");
  return normalized;
}

export function normalizeStockQuantity(
  value: string,
  product: Pick<MovementProduct, "allowFractionalStock" | "quantityScale">,
  allowNegative = false,
) {
  const input = value.trim();
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(input);
  if (!match || (!allowNegative && match[1] === "-"))
    throw new InventoryMovementError("INVALID_INPUT");
  const fractionalDigits = match[3]?.length ?? 0;
  if (
    fractionalDigits > product.quantityScale ||
    (!product.allowFractionalStock && fractionalDigits > 0)
  )
    throw new InventoryMovementError("INVALID_INPUT");
  const isZero = /^0+$/.test(match[2]) && (!match[3] || /^0+$/.test(match[3]));
  if (isZero) throw new InventoryMovementError("INVALID_INPUT");
  return {
    negative: match[1] === "-",
    quantity:
      `${match[2]}.${(match[3] ?? "").padEnd(product.quantityScale, "0")}`.replace(
        /\.$/,
        "",
      ),
  };
}

export async function requirePoster(
  transaction: MovementTransaction,
  actorId: string,
) {
  const actor = await transaction.findActorById(actorId);
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "operations:post")
  )
    throw new InventoryMovementError("FORBIDDEN");
  return actor;
}

async function requireProduct(
  transaction: MovementTransaction,
  productId: string,
) {
  const product = await transaction.findProductById(productId);
  if (!product) throw new InventoryMovementError("PRODUCT_NOT_FOUND");
  return product;
}

async function requireEligibleLocation(
  transaction: MovementTransaction,
  product: MovementProduct,
  locationId: string,
) {
  const location = await transaction.findLocationById(locationId);
  if (!location) throw new InventoryMovementError("LOCATION_NOT_FOUND");
  const productLocation = await transaction.findProductLocation(
    product.id,
    locationId,
  );
  if (
    !inventoryPostingEligibility({ product, location, productLocation })
      .eligible
  )
    throw new InventoryMovementError("NOT_ELIGIBLE");
}

function validateReferences(
  type: InventoryMovementType,
  references: MovementReferences = {},
) {
  if (
    (type !== "RECEIPT" && references.receiptLineId) ||
    (type !== "TRANSFER" && references.transferLineId) ||
    (type !== "COUNT_ADJUSTMENT" && references.countLineId)
  )
    throw new InventoryMovementError("INVALID_INPUT");
  return references;
}

export async function createValidatedMovement(
  transaction: MovementTransaction,
  actor: MovementActor,
  input: InventoryMovementInput,
) {
  if (
    !input.productId ||
    !(input.occurredAt instanceof Date) ||
    Number.isNaN(input.occurredAt.valueOf())
  )
    throw new InventoryMovementError("INVALID_INPUT");
  const product = await requireProduct(transaction, input.productId);
  const quantity = normalizeStockQuantity(
    input.quantity,
    product,
    input.type === "COUNT_ADJUSTMENT",
  );
  const source = normalizeSource(input.source);
  const references = validateReferences(input.type, input.references);
  let sourceLocationId: string | null = null;
  let destinationLocationId: string | null = null;

  if (input.type === "OPENING" || input.type === "RECEIPT") {
    destinationLocationId = input.destinationLocationId;
    await requireEligibleLocation(transaction, product, destinationLocationId);
  } else if (input.type === "TRANSFER") {
    if (input.sourceLocationId === input.destinationLocationId)
      throw new InventoryMovementError("INVALID_INPUT");
    sourceLocationId = input.sourceLocationId;
    destinationLocationId = input.destinationLocationId;
    await requireEligibleLocation(transaction, product, sourceLocationId);
    await requireEligibleLocation(transaction, product, destinationLocationId);
  } else if (input.type === "COUNT_ADJUSTMENT") {
    await requireEligibleLocation(transaction, product, input.locationId);
    if (quantity.negative) sourceLocationId = input.locationId;
    else destinationLocationId = input.locationId;
  }

  if (
    input.type === "OPENING" &&
    (await transaction.hasOpeningMovement(product.id, destinationLocationId!))
  )
    throw new InventoryMovementError("DUPLICATE_OPENING");
  return transaction.createMovement({
    type: input.type,
    productId: product.id,
    quantity: quantity.quantity,
    sourceLocationId,
    destinationLocationId,
    occurredAt: input.occurredAt,
    postedById: actor.id,
    notes: normalizeNotes(input.notes),
    ...references,
    ...(source ? { sourceSystem: source.system, sourceId: source.id } : {}),
  });
}

export async function postInventoryMovement(
  actor: MovementActor,
  input: InventoryMovementInput,
  repository: MovementRepository,
) {
  return repository.transaction(async (transaction) =>
    createValidatedMovement(
      transaction,
      await requirePoster(transaction, actor.id),
      input,
    ),
  );
}

export async function postOpeningInventory(
  actor: MovementActor,
  input: {
    locationId: string;
    entries: Array<{
      productId: string;
      quantity: string;
      source?: MovementSource;
    }>;
    occurredAt?: Date;
    notes?: string;
  },
  repository: MovementRepository,
) {
  if (!input.locationId || input.entries.length === 0)
    throw new InventoryMovementError("INVALID_INPUT");
  const productIds = new Set(input.entries.map((entry) => entry.productId));
  if (productIds.size !== input.entries.length)
    throw new InventoryMovementError("INVALID_INPUT");
  return repository.transaction(async (transaction) => {
    const currentActor = await requirePoster(transaction, actor.id);
    const movements: MovementRecord[] = [];
    const occurredAt = input.occurredAt ?? new Date();
    for (const entry of input.entries) {
      movements.push(
        await createValidatedMovement(transaction, currentActor, {
          type: "OPENING",
          productId: entry.productId,
          quantity: entry.quantity,
          destinationLocationId: input.locationId,
          occurredAt,
          notes: input.notes,
          source: entry.source,
        }),
      );
    }
    return movements;
  });
}
