import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "@/server/env";

export async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl:
      env.DATABASE_URL.includes("supabase.co") ||
      env.DATABASE_URL.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  });
  const db = drizzle(pool);

  try {
    console.log("Applying database migrations from ./drizzle...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

// When executed directly via `tsx src/server/db/migrate.ts`
if (require.main === module || process.argv[1]?.includes("migrate.ts")) {
  runMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
