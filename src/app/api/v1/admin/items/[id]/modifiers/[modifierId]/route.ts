import { z } from "zod";
import { db } from "@/server/db";
import { updateModifier, deleteModifier } from "@/server/services/manager";
import { updateModifierSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Menu item ID is required"),
  modifierId: z.string().trim().min(1, "Modifier ID is required"),
});

export const PATCH = withApi(
  async ({ params, body, actor }) => {
    const result = await updateModifier(
      { db, actor },
      { id: params.modifierId, menuItemId: params.id, ...body }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema: updateModifierSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const DELETE = withApi(
  async ({ params, actor }) => {
    const result = await deleteModifier(
      { db, actor },
      { id: params.modifierId }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
