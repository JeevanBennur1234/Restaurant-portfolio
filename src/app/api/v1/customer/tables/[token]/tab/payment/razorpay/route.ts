import { z } from "zod";
import { db } from "@/server/db";
import { createTabRazorpayOrder } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

export const POST = withApi(
  async ({ params }) => {
    const result = await createTabRazorpayOrder({ db }, params.token);
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);
