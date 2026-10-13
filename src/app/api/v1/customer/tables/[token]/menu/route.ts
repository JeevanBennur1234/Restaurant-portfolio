import { z } from "zod";
import { db } from "@/server/db";
import { getMenuForTable } from "@/server/services/customer";
import { tokenParamSchema } from "@/lib/validations/guest";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  token: tokenParamSchema,
});

export const GET = withApi(
  async ({ params }) => {
    const result = await getMenuForTable({ db }, params.token);
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    rateLimit: "customer",
  }
);
