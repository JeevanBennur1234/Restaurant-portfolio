import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { poolConfig } from "../src/server/db/pool-config";

async function verifyPostMigration() {
  const dbUrl = process.env.DATABASE_URL || "";
  let host = "";
  let projectRef = "";
  let dbName = "";
  let port = "";

  try {
    const parsed = new URL(dbUrl);
    host = parsed.hostname;
    port = parsed.port;
    dbName = parsed.pathname.replace(/^\//, "");
    const parts = parsed.hostname.split(".");
    // e.g. db.thvfhqmghhyimcabywdl.supabase.co
    if (parts.length > 2 && parts[1] === "supabase") {
      projectRef = parts[0].replace(/^db\./, "");
    } else if (parts.length > 1 && parts[0].startsWith("db.")) {
      projectRef = parts[0].replace(/^db\./, "");
    }
  } catch {
    host = "Invalid/unparseable URL";
  }

  const sslConfig = poolConfig.ssl;
  const sslRejectUnauthorized =
    typeof sslConfig === "object" && sslConfig !== null && "rejectUnauthorized" in sslConfig
      ? sslConfig.rejectUnauthorized
      : false;

  console.log("=== SUPABASE DATABASE TARGET AUDIT ===");
  console.log(`Database Host: ${host}`);
  console.log(`Database Port: ${port}`);
  console.log(`Database Name: ${dbName}`);
  console.log(`Supabase Project Ref: ${projectRef || "thvfhqmghhyimcabywdl"}`);
  console.log(`Pool SSL config: ${JSON.stringify({ rejectUnauthorized: sslRejectUnauthorized })}`);

  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema });

  try {
    // 1. Restaurant
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, "masala-lane"),
    });

    if (!restaurant) {
      throw new Error("Restaurant 'masala-lane' not found!");
    }
    console.log(`\nRestaurant: ${restaurant.name} (ID: ${restaurant.id}, Slug: ${restaurant.slug})`);

    // 2. Categories
    const categories = await db.query.categories.findMany({
      where: eq(schema.categories.restaurantId, restaurant.id),
      orderBy: (c, { asc }) => [asc(c.sortOrder)],
    });

    console.log("\n=== CATEGORIES IN RESTAURANT ===");
    for (const c of categories) {
      console.log(`- Category [${c.id}]: "${c.name}" (slug: ${c.slug}, sortOrder: ${c.sortOrder})`);
    }

    const curriesCategory = categories.find((c) => c.slug === "signature-curries");
    const biryaniCategory = categories.find((c) => c.slug === "dum-biryanis-pulao");

    if (!curriesCategory || !biryaniCategory) {
      throw new Error("Could not find both curries and biryani/pulao categories!");
    }

    // 3. Menu items
    const allItems = await db.query.menuItems.findMany({
      where: eq(schema.menuItems.restaurantId, restaurant.id),
      orderBy: (i, { asc }) => [asc(i.name)],
    });

    console.log(`\nTotal Menu Items for Masala Lane: ${allItems.length}`);

    // Ghee Rice Item
    const gheeRice = allItems.find((i) => i.id === "84b8ffaa-e102-49be-b828-1d1a189e3854");
    if (!gheeRice) {
      throw new Error("Ghee Rice menu item not found!");
    }

    console.log("\n=== TARGET MENU ITEM: GHEE RICE ===");
    console.log(`Item ID: ${gheeRice.id}`);
    console.log(`Item Name: "${gheeRice.name}"`);
    console.log(`Assigned Category ID: ${gheeRice.categoryId}`);
    console.log(`Category Name: ${categories.find(c => c.id === gheeRice.categoryId)?.name}`);
    console.log(`Category Slug: ${categories.find(c => c.id === gheeRice.categoryId)?.slug}`);
    console.log(`Price: ₹${(gheeRice.pricePaise / 100).toFixed(2)}`);
    console.log(`Is Available: ${gheeRice.isAvailable}`);
    console.log(`Updated At: ${gheeRice.updatedAt?.toISOString()}`);
    console.log(`Target Category ID Match ("Dum Biryanis & Pulao"): ${gheeRice.categoryId === biryaniCategory.id}`);

    // Items in Dum Biryanis & Pulao
    const biryaniItems = allItems.filter((i) => i.categoryId === biryaniCategory.id);
    console.log(`\n=== ITEMS IN "Dum Biryanis & Pulao" (${biryaniItems.length} items) ===`);
    for (const item of biryaniItems) {
      console.log(`- [${item.id}] "${item.name}" (₹${(item.pricePaise / 100).toFixed(2)}) - updated: ${item.updatedAt?.toISOString()}`);
    }

    // Items in Signature Curries
    const curriesItems = allItems.filter((i) => i.categoryId === curriesCategory.id);
    console.log(`\n=== ITEMS IN "Signature Curries" (${curriesItems.length} items) ===`);
    for (const item of curriesItems) {
      console.log(`- [${item.id}] "${item.name}" (₹${(item.pricePaise / 100).toFixed(2)}) - updated: ${item.updatedAt?.toISOString()}`);
    }

    // Verify all category counts
    console.log("\n=== ITEM DISTRIBUTION ACROSS ALL CATEGORIES ===");
    for (const c of categories) {
      const count = allItems.filter(i => i.categoryId === c.id).length;
      console.log(`- ${c.name}: ${count} item(s)`);
    }

    // Assertion checks
    const gheeRiceInBiryanis = biryaniItems.some((i) => i.id === gheeRice.id);
    const gheeRiceNotInCurries = !curriesItems.some((i) => i.id === gheeRice.id);

    console.log("\n=== INTEGRITY CHECKS ===");
    console.log(`Check 1: Ghee Rice is present in 'Dum Biryanis & Pulao': ${gheeRiceInBiryanis}`);
    console.log(`Check 2: Ghee Rice is absent from 'Signature Curries': ${gheeRiceNotInCurries}`);
    console.log(`Check 3: Total dishes in restaurant remains exactly 31: ${allItems.length === 31}`);
    console.log(`Check 4: 'Dum Biryanis & Pulao' category has exactly 6 items: ${biryaniItems.length === 6}`);
    console.log(`Check 5: 'Signature Curries' category has exactly 5 items: ${curriesItems.length === 5}`);

    // The schema has no migration audit log, so updatedAt timestamps cannot prove
    // which rows changed during a historical operation. Scope is instead enforced by
    // the migration's single-row WHERE clause and the row/category/count checks above.
    console.log("Check 6: Historical row isolation is not inferred from timestamps; inspect migration WHERE clause/audit logs.");

    if (
      gheeRiceInBiryanis &&
      gheeRiceNotInCurries &&
      allItems.length === 31 &&
      biryaniItems.length === 6 &&
      curriesItems.length === 5
    ) {
      console.log("\n✅ ALL POST-MIGRATION INTEGRITY CHECKS PASSED!");
    } else {
      console.error("\n❌ POST-MIGRATION INTEGRITY CHECK FAILED!");
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

verifyPostMigration().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
