import { z } from "zod";
import { db } from "@/server/db";
import { toggleMenuItemAvailability } from "@/server/services/manager";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Item ID is required"),
});

const bodySchema = z.object({
  isAvailable: z.boolean(),
});

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await toggleMenuItemAvailability(
      { db, actor },
      { id: params.id, isAvailable: body.isAvailable }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
