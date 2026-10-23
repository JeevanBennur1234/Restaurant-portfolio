import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { diningSessions, orders } from "@/server/db/schema";
import { buildTabReceiptData } from "@/server/services/tabs";
import { generateReceiptPdf } from "@/server/services/receipt-pdf";
import { withApi } from "@/server/api/handler";
import { apiError } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Tab ID is required"),
});

const querySchema = z.object({
  format: z.enum(["a4", "thermal"]).optional(),
});

export const GET = withApi(
  async ({ params, query, actor }) => {
    const session = await db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.id, params.id),
        eq(diningSessions.restaurantId, actor!.restaurantId)
      ),
      with: {
        table: true,
        restaurant: true,
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { items: true, payments: true },
        },
      },
    });

    if (!session) {
      return apiError("NOT_FOUND", "Dining tab not found", 404);
    }

    const receiptData = buildTabReceiptData(session);
    const pdfBuffer = await generateReceiptPdf(receiptData, {
      format: query.format || "a4",
    });

    const filename = `tab-receipt-${receiptData.orderNumber}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  },
  {
    paramsSchema,
    querySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
