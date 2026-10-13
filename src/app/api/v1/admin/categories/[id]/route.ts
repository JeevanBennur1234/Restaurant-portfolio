import { z } from "zod";
import { db } from "@/server/db";
import { updateCategory, deleteCategory } from "@/server/services/manager";
import { updateCategorySchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Category ID is required"),
});

const patchBodySchema = updateCategorySchema.omit({ id: true });

export const PATCH = withApi(
  async ({ params, body, actor }) => {
    const result = await updateCategory(
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
    const result = await deleteCategory({ db, actor }, { id: params.id });
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);
