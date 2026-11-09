import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { PageHeading } from "@/app/components/page-heading";
import {
  NewStockRequest,
  type RequestCategory,
} from "@/app/requests/stock-request-client";
import { hasPermission } from "@/lib/authorization";
import { CATEGORY_ORDER_BY } from "@/lib/category-management";
import { prisma } from "@/lib/prisma";
import { PRODUCT_ORDER_BY } from "@/lib/product-order";
import { currentUser } from "@/lib/session";

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

export default async function StarterShackRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; success?: string; error?: string }>;
}) {
  await connection();
  const actor = await currentUser();
  const query = await searchParams;
  const canSubmit = !actor || hasPermission(actor.role, "operations:draft");
  const publicSessionId = (await cookies()).get("shack-session")?.value;
  const tab = query.tab === "status" ? "status" : canSubmit ? "new" : "status";
  const [categories, ownRequests] = await Promise.all([
    canSubmit
      ? prisma.category.findMany({
          where: { active: true },
          orderBy: CATEGORY_ORDER_BY,
          include: {
            products: {
              where: {
                active: true,
                starterShackRequestEligible: true,
                productLocations: {
                  some: {
                    active: true,
                    reviewRequired: false,
                    location: { code: "BAR", active: true },
                  },
                },
              },
              orderBy: PRODUCT_ORDER_BY,
              include: {
                productLocations: {
                  where: {
                    active: true,
                    reviewRequired: false,
                    location: {
                      active: true,
                      code: { in: ["BAR", "STARTER_SHACK"] },
                    },
                  },
                  include: { location: { select: { code: true } } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.stockRequest.findMany({
      where: actor
        ? { requestedById: actor.id }
        : {
            publicSessionId:
              publicSessionId && /^[0-9a-f-]{36}$/i.test(publicSessionId)
                ? publicSessionId
                : "00000000-0000-0000-0000-000000000000",
          },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: {
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
  ]);
  const requestCategories: RequestCategory[] = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      products: category.products
        .filter(
          (product) =>
            new Set(product.productLocations.map((item) => item.location.code))
              .size === 2,
        )
        .map((product) => ({
          id: product.id,
          name: product.name,
          unit: unitLabel(product),
          quantityScale: product.quantityScale,
        })),
    }))
    .filter((category) => category.products.length > 0);
  return (
    <>
      <PageHeading
        eyebrow="Starter Shack"
        title="Stock Request"
        description="Select what you need from the Bar, then submit your request."
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
      <nav className="request-tabs" aria-label="Starter Shack requests">
        <Link
          className={tab === "new" ? "active" : ""}
          href="/starter-shack?tab=new"
        >
          New Request
        </Link>
        <Link
          className={tab === "status" ? "active" : ""}
          href="/starter-shack?tab=status"
        >
          Request Status
        </Link>
      </nav>
      {tab === "new" &&
        (canSubmit ? (
          <NewStockRequest categories={requestCategories} />
        ) : (
          <section className="empty-panel">
            <h2>View only</h2>
            <p>Your role can review requests but cannot submit one.</p>
          </section>
        ))}
      {tab === "status" && (
        <section className="request-status-list">
          {ownRequests.length === 0 ? (
            <div className="empty-panel">
              <h2>No requests yet</h2>
              <p>Your submitted Starter Shack requests will appear here.</p>
            </div>
          ) : (
            ownRequests.map((request) => (
              <article
                className="request-card"
                id={`request-${request.id}`}
                key={request.id}
              >
                <header>
                  <div>
                    <strong>
                      {request.requestedAt.toLocaleDateString("en-CA")}
                    </strong>
                  </div>
                  <span
                    className={`request-status ${request.status.toLowerCase()}`}
                  >
                    {request.status.replaceAll("_", " ")}
                  </span>
                </header>
                <div className="table-scroll">
                  <table className="request-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Requested</th>
                        <th>Given</th>
                        <th>Stock given</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            <strong>{line.product.name}</strong>
                            <small>{unitLabel(line.product)}</small>
                          </td>
                          <td>{line.requestedQuantity.toString()}</td>
                          <td>{line.quantityGiven.toString()}</td>
                          <td>
                            {line.transferLines[0]?.transfer.completedAt.toLocaleDateString(
                              "en-CA",
                            ) ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {request.notes && (
                  <p className="request-notes">{request.notes}</p>
                )}
                {request.closureComment && request.completedAt && (
                  <p className="request-closure-comment">
                    <strong>
                      {request.status === "CLOSED" ? "Closed" : "Cancelled"}{" "}
                      {request.completedAt.toLocaleString("en-CA")}:
                    </strong>{" "}
                    {request.closureComment}
                  </p>
                )}
              </article>
            ))
          )}
        </section>
      )}
    </>
  );
}
