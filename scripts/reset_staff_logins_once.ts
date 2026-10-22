/**
 * One-time recovery helper for the DinePulse Masala Lane staff accounts.
 * Run from the C:\Agency project root with: npx tsx scripts/reset-staff-logins.once.ts
 * It updates only the existing 'owner' and 'kitchen' users for the 'masala-lane'
 * restaurant (or creates them if missing), with random passwords and non-demo status.
 * No restaurant/menu/order/table data is deleted.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { poolConfig } from "../src/server/db/pool-config";

const accounts = [
  {
    username: "owner",
    email: "owner@masalane.local",
    role: "manager" as const,
    password: crypto.randomBytes(24).toString("base64url"),
  },
  {
    username: "kitchen",
    email: "kitchen@masalane.restaurant",
    role: "kitchen" as const,
    password: crypto.randomBytes(24).toString("base64url"),
  },
];

async function main() {
  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema });
  try {
    await db.transaction(async (tx) => {
      const [restaurant] = await tx
        .select()
        .from(schema.restaurants)
        .where(eq(schema.restaurants.slug, "masala-lane"))
        .limit(1);
      if (!restaurant) {
        throw new Error("Restaurant 'masala-lane' was not found; no staff accounts were changed.");
      }

      for (const account of accounts) {
        const [existing] = await tx
          .select()
          .from(schema.staffUsers)
          .where(eq(schema.staffUsers.username, account.username))
          .limit(1);
        if (existing && existing.restaurantId !== restaurant.id) {
          throw new Error(
            `Username '${account.username}' belongs to a different restaurant; refusing to modify accounts.`,
          );
        }

        const passwordHash = await bcrypt.hash(account.password, 12);
        if (existing) {
          await tx
            .update(schema.staffUsers)
            .set({
              passwordHash,
              email: account.email,
              role: account.role,
              isActive: true,
              isDemo: false,
              sessionVersion: (existing.sessionVersion ?? 1) + 1,
              updatedAt: new Date(),
            })
            .where(eq(schema.staffUsers.id, existing.id));
        } else {
          await tx.insert(schema.staffUsers).values({
            restaurantId: restaurant.id,
            username: account.username,
            email: account.email,
            passwordHash,
            role: account.role,
            isActive: true,
            isDemo: false,
            sessionVersion: 1,
          });
        }
      }
    });

    // Print passwords only after the transaction has committed successfully.
    console.log("STAFF_LOGIN_RESET=SUCCESS");
    console.log("Restaurant: Masala Lane (masala-lane)");
    console.log("Manager URL: https://dinepulse-manager.vercel.app/admin");
    console.log(`Manager username: ${accounts[0].username}`);
    console.log(`Manager password: ${accounts[0].password}`);
    console.log("");
    console.log("Kitchen URL: https://dinepulse-kitchen.vercel.app/kitchen");
    console.log(`Kitchen username: ${accounts[1].username}`);
    console.log(`Kitchen password: ${accounts[1].password}`);
    console.log("");
    console.log("Both accounts are active and marked non-demo. Save these passwords now.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Staff login reset failed. No passwords were printed.",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
