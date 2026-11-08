import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { sameOrigin } from "@/lib/order-receipts";
import {
  legacyPurchasePreview,
  importLegacyPurchases,
} from "@/lib/legacy-purchase-import";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const actor = await currentUser();
  if (
    !actor ||
    !hasPermission(actor.role, "imports:review") ||
    !hasPermission(actor.role, "operations:post")
  )
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 3200000)
    return Response.json(
      { error: "Workbook must be 3 MB or smaller." },
      { status: 413 },
    );
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024)
      throw new Error("Choose a workbook up to 3 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (form.get("execute") === "true") {
      const result = await importLegacyPurchases(
        actor.id,
        bytes,
        String(form.get("fileHash") ?? ""),
      );
      revalidatePath("/orders");
      revalidatePath("/order-history");
      return Response.json(result);
    }
    return Response.json(await legacyPurchasePreview(bytes));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && !("code" in error)
            ? error.message
            : "Import could not be completed. No partial order import was saved.",
      },
      { status: 400 },
    );
  }
}
