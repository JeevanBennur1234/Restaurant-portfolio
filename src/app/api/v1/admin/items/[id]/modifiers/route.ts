import { z } from "zod";
import { db } from "@/server/db";
import {
  getModifiersForItem,
  createModifier,
} from "@/server/services/manager";
import { createModifierSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Menu item ID is required"),
});

const postBodySchema = createModifierSchema.omit({ menuItemId: true });

export const GET = withApi(
  async ({ params, actor }) => {
    const result = await getModifiersForItem({ db, actor }, params.id);
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await createModifier(
      { db, actor },
      { menuItemId: params.id, ...body }
    );
    return fromServiceResult(result, 201);
  },
  {
    paramsSchema,
    bodySchema: postBodySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
