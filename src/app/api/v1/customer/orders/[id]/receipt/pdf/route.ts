import { z } from "zod";
import { db } from "@/server/db";
import { getCustomerReceipt } from "@/server/services/billing";
import { generateReceiptPdf } from "@/server/services/receipt-pdf";
import { withApi } from "@/server/api/handler";
import { apiError } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

const querySchema = z.object({
  format: z.enum(["a4", "thermal"]).optional(),
  token: z.string().optional(),
});

export const GET = withApi(
  async ({ params, query, tableToken }) => {
    const result = await getCustomerReceipt(
      { db },
      { orderId: params.id, token: tableToken! }
    );

    if (!result.ok) {
      return apiError(result.code, result.message, result.status);
    }

    const pdfBuffer = await generateReceiptPdf(result.data, {
      format: query.format || "a4",
    });

    const filename = `receipt-${result.data.orderNumber}.pdf`;

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
    requireTableToken: true,
    rateLimit: "customer",
  }
);
