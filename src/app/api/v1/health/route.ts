import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { apiOk, apiError } from "@/server/api/envelope";


export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return apiOk({
      status: "ok",
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check database probe failed:", err);
    return apiError("INTERNAL", "Health check probe failed", 500);
  }
}
