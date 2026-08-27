export type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: object | null;
  after?: object | null;
  reason?: string | null;
  correlationId?: string | null;
};

export function auditData(input: AuditInput) {
  return {
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? undefined,
    after: input.after ?? undefined,
    reason: input.reason ?? null,
    correlationId: input.correlationId ?? null,
  };
}

export async function recordAudit(input: AuditInput) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.auditEvent.create({ data: auditData(input) });
}
