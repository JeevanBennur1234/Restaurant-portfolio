import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { env } from "../src/server/env";

/**
 * CLI script to create or update a real non-demo manager account.
 * This allows safe local testing of production-identical non-demo features
 * without disabling demo protections or touching production data.
 *
 * Usage:
 *   npx tsx scripts/create-manager.ts [username] [password] [email]
 *
 * Default:
 *   username: "owner"
 *   password: "OwnerPassword123!"
 *   email: "owner@masalane.local"
 */
async function main() {
  const args = process.argv.slice(2);
  const username = (args[0] || process.env.MANAGER_USERNAME || "owner").trim().toLowerCase();
  const rawPassword = args[1] || process.env.MANAGER_PASSWORD || "OwnerPassword123!";
  const email = (args[2] || process.env.MANAGER_EMAIL || `${username}@masalane.local`).trim();

  if (rawPassword.length < 8) {
    console.error("❌ Password must be at least 8 characters long.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl:
      env.DATABASE_URL.includes("supabase.co") ||
      env.DATABASE_URL.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const db = drizzle(pool, { schema });

  try {
    const restaurantSlug = "masala-lane";
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, restaurantSlug),
    });

    if (!restaurant) {
      console.error(`❌ Restaurant '${restaurantSlug}' not found in database.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const existingUser = await db.query.staffUsers.findFirst({
      where: eq(schema.staffUsers.username, username),
    });

    if (existingUser) {
      await db
        .update(schema.staffUsers)
        .set({
          passwordHash,
          email,
          role: "manager",
          isActive: true,
          isDemo: false,
          sessionVersion: (existingUser.sessionVersion ?? 1) + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.staffUsers.id, existingUser.id));

      console.log(`✅ Existing staff user '${username}' updated to non-demo manager (isDemo = false).`);
    } else {
      await db.insert(schema.staffUsers).values({
        restaurantId: restaurant.id,
        username,
        email,
        passwordHash,
        role: "manager",
        isActive: true,
        isDemo: false,
        sessionVersion: 1,
      });

      console.log(`✅ Created new non-demo manager user '${username}' (isDemo = false).`);
    }

    console.log(`\n📋 Account details:`);
    console.log(`   Username: ${username}`);
    console.log(`   Role: manager`);
    console.log(`   isDemo: false`);
    console.log(`   Login URL: http://localhost:3002/admin/login`);
  } catch (err) {
    console.error("❌ Failed to create/update manager account:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
