import { z } from "zod";
import { db } from "@/server/db";
import { updateMenuItem, deleteMenuItem } from "@/server/services/manager";
import { updateMenuItemSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Item ID is required"),
});

const patchBodySchema = updateMenuItemSchema.omit({ id: true });

export const PATCH = withApi(
  async ({ params, body, actor }) => {
    const result = await updateMenuItem(
      { db, actor },
      { id: params.id, ...body }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema: patchBodySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const DELETE = withApi(
  async ({ params, actor }) => {
    const result = await deleteMenuItem({ db, actor }, { id: params.id });
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
