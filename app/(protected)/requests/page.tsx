import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  FulfillmentQueue,
  type RequestView,
} from "@/app/requests/stock-request-client";
import { requireInventoryWorkspaceUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  await requireInventoryWorkspaceUser();
  const query = await searchParams;
  const [fulfillmentRequests, notificationSettings] = await Promise.all([
    prisma.stockRequest.findMany({
      where: {
        status: {
          in: ["SUBMITTED", "PARTIALLY_GIVEN", "GIVEN", "CLOSED", "CANCELLED"],
        },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: {
        requestedBy: { select: { name: true, email: true } },
        lines: {
          orderBy: [
            { product: { displayOrder: "asc" } },
            { product: { name: "asc" } },
          ],
          include: {
            product: {
              select: {
                name: true,
                stockUnit: true,
                stockUnitLabel: true,
                packageSize: true,
                quantityScale: true,
              },
            },
            transferLines: {
              include: { transfer: { select: { completedAt: true } } },
              orderBy: { transfer: { completedAt: "desc" } },
            },
          },
        },
      },
    }),
    prisma.stockRequestNotificationSettings.findUnique({
      where: { id: "default" },
    }),
  ]);
  const fulfillmentRows: RequestView[] = fulfillmentRequests.map((request) => ({
    id: request.id,
    requestedAt: request.requestedAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    closureComment: request.closureComment,
    status: request.status,
    requestedBy: request.requestedBy.name || request.requestedBy.email,
    notes: request.notes,
    lines: request.lines.map((line) => ({
      id: line.id,
      productName: line.product.name,
      unit: unitLabel(line.product),
      quantityScale: line.product.quantityScale,
      requested: line.requestedQuantity.toString(),
      given: line.quantityGiven.toString(),
      givenAt:
        line.transferLines[0]?.transfer.completedAt.toISOString() ?? null,
    })),
  }));
  return (
    <>
      <PageHeading
        eyebrow="Bar operations"
        title="Starter Shack"
        description="Review and fulfill Starter Shack requests from the Bar."
      />
      {query.success && (
        <p className="notice success" role="status">
          {query.success}
        </p>
      )}
      {query.error && (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      )}
      <FulfillmentQueue
        notificationSettings={{
          requesterNotificationEmail:
            notificationSettings?.requesterNotificationEmail ?? "",
          orderNotificationEmail:
            notificationSettings?.orderNotificationEmail ?? "",
        }}
        requests={fulfillmentRows}
      />
    </>
  );
}
