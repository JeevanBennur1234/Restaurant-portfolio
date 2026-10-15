import readline from "node:readline";
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
 *   npx tsx scripts/create-manager.ts --password <secret> [--username <name>] [--email <addr>] [--confirm]
 *   MANAGER_PASSWORD=<secret> npx tsx scripts/create-manager.ts [--confirm]
 */

interface ParsedCliArgs {
  username: string;
  password: string;
  email: string;
  isConfirmed: boolean;
  restaurantSlug: string;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--confirm" || arg === "--force") {
      flags.confirm = true;
    } else if (arg === "--password" || arg === "-p") {
      flags.password = argv[++i];
    } else if (arg === "--username" || arg === "-u") {
      flags.username = argv[++i];
    } else if (arg === "--email" || arg === "-e") {
      flags.email = argv[++i];
    } else if (arg === "--restaurant" || arg === "-r") {
      flags.restaurant = argv[++i];
    } else if (arg.startsWith("--password=")) {
      flags.password = arg.slice("--password=".length);
    } else if (arg.startsWith("--username=")) {
      flags.username = arg.slice("--username=".length);
    } else if (arg.startsWith("--email=")) {
      flags.email = arg.slice("--email=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const username = (
    (typeof flags.username === "string" ? flags.username : undefined) ||
    positional[0] ||
    process.env.MANAGER_USERNAME ||
    "owner"
  ).trim().toLowerCase();

  const password = (
    (typeof flags.password === "string" ? flags.password : undefined) ||
    positional[1] ||
    process.env.MANAGER_PASSWORD ||
    ""
  ).trim();

  const email = (
    (typeof flags.email === "string" ? flags.email : undefined) ||
    positional[2] ||
    process.env.MANAGER_EMAIL ||
    `${username}@masalane.local`
  ).trim();

  const isConfirmed = Boolean(flags.confirm);
  const restaurantSlug = (
    (typeof flags.restaurant === "string" ? flags.restaurant : undefined) ||
    process.env.RESTAURANT_SLUG ||
    "masala-lane"
  ).trim();

  return { username, password, email, isConfirmed, restaurantSlug };
}

async function main() {
  const { username, password, email, isConfirmed, restaurantSlug } = parseCliArgs(
    process.argv.slice(2)
  );

  // Require explicit password (no default value)
  if (!password) {
    console.error("❌ Error: Password is required.");
    console.error(
      "   Provide an explicit password via command-line argument (--password <pwd>) or MANAGER_PASSWORD environment variable."
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long.");
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
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, restaurantSlug),
    });

    if (!restaurant) {
      console.error(`❌ Restaurant '${restaurantSlug}' not found in database.`);
      process.exit(1);
    }

    const existingUser = await db.query.staffUsers.findFirst({
      where: eq(schema.staffUsers.username, username),
    });

    if (existingUser) {
      // Protect cross-restaurant accounts: never convert users from another restaurant
      if (existingUser.restaurantId !== restaurant.id) {
        console.error(
          `❌ Security Error: Staff user '${username}' exists but belongs to a different restaurant.`
        );
        console.error(
          "   Cross-restaurant account modification is not permitted."
        );
        process.exit(1);
      }

      // Require explicit confirmation before modifying existing staff account
      if (!isConfirmed) {
        let confirmedInteractively = false;
        if (process.stdin.isTTY && process.stdout.isTTY) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `⚠️  Staff user '${username}' already exists. Update to non-demo manager? (y/N): `,
              resolve
            );
          });
          rl.close();
          confirmedInteractively =
            answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
        }

        if (!confirmedInteractively) {
          console.error(
            `❌ Aborted: Staff user '${username}' already exists.`
          );
          console.error(
            "   To confirm updating this account, pass --confirm or --force flag."
          );
          process.exit(1);
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

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

      console.log(`✅ Existing staff user '${username}' updated to non-demo manager.`);
    } else {
      const passwordHash = await bcrypt.hash(password, 10);

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

      console.log(`✅ Created new non-demo manager '${username}'.`);
    }

    // Security hygiene: only log safe account metadata (never print passwords or hashes)
    console.log(`\n📋 Safe Account Metadata:`);
    console.log(`   Username:      ${username}`);
    console.log(`   Role:          manager`);
    console.log(`   isDemo:        false`);
    console.log(`   Restaurant:    ${restaurant.name} (${restaurant.slug})`);
    console.log(`   Restaurant ID: ${restaurant.id}`);
    console.log(`   Login URL:     http://localhost:3002/admin/login`);
  } catch (err) {
    console.error(
      "❌ Failed to create/update manager account:",
      err instanceof Error ? err.message : "Internal database error"
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err instanceof Error ? err.message : "Unexpected error");
  process.exit(1);
});
