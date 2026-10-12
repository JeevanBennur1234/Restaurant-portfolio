import * as dotenv from "dotenv";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Please configure .env.local or .env");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function seed() {
  console.log("🌱 Starting DinePulse database seed for 'Masala Lane'...");

  // 1. Check or insert Restaurant
  const restaurantSlug = "masala-lane";
  const existingRestaurant = await db.query.restaurants.findFirst({
    where: eq(schema.restaurants.slug, restaurantSlug),
  });

  let restaurantId: string;

  if (existingRestaurant) {
    console.log(`ℹ️ Restaurant '${existingRestaurant.name}' already exists (ID: ${existingRestaurant.id}).`);
    restaurantId = existingRestaurant.id;

    // Clean up existing child records for fresh seed state
    console.log("🧹 Cleaning previous seed records for Masala Lane...");
    await db.delete(schema.tables).where(eq(schema.tables.restaurantId, restaurantId));
    await db.delete(schema.categories).where(eq(schema.categories.restaurantId, restaurantId));
    await db.delete(schema.staffUsers).where(eq(schema.staffUsers.restaurantId, restaurantId));
  } else {
    const [inserted] = await db
      .insert(schema.restaurants)
      .values({
        name: "Masala Lane",
        slug: restaurantSlug,
        description: "Warm flavours, editorial dining & authentic regional craft in Bengaluru",
        currency: "INR",
        isActive: true,
      })
      .returning();
    restaurantId = inserted.id;
    console.log(`✅ Created Restaurant: Masala Lane (ID: ${restaurantId})`);
  }

  // 2. Insert 12 Tables with random unguessable QR tokens
  console.log("🍽️ Generating 12 tables with cryptographically unguessable QR tokens...");
  const tableValues = Array.from({ length: 12 }, (_, i) => {
    const tableNum = i + 1;
    // Unguessable 32-character random hex token
    const qrToken = crypto.randomBytes(16).toString("hex");
    const capacity = tableNum <= 4 ? 2 : tableNum <= 10 ? 4 : 6;

    return {
      restaurantId,
      tableNumber: `Table ${tableNum}`,
      capacity,
      qrToken,
      isActive: true,
    };
  });

  const insertedTables = await db.insert(schema.tables).values(tableValues).returning();
  console.log(`✅ Inserted ${insertedTables.length} tables.`);

  // 3. Insert 6 Categories
  console.log("📂 Inserting 6 menu categories...");
  const categoryData = [
    { name: "Small Plates & Chaats", slug: "small-plates-chaats", sortOrder: 1 },
    { name: "Tandoor & Sigdi Grills", slug: "tandoor-sigdi-grills", sortOrder: 2 },
    { name: "Signature Curries", slug: "signature-curries", sortOrder: 3 },
    { name: "Dum Biryanis & Pulao", slug: "dum-biryanis-pulao", sortOrder: 4 },
    { name: "Artisanal Breads & Sides", slug: "artisanal-breads-sides", sortOrder: 5 },
    { name: "Desserts & Beverages", slug: "desserts-beverages", sortOrder: 6 },
  ];

  const categoryMap = new Map<string, string>();
  for (const cat of categoryData) {
    const [insertedCat] = await db
      .insert(schema.categories)
      .values({
        restaurantId,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
      })
      .returning();
    categoryMap.set(cat.slug, insertedCat.id);
  }
  console.log(`✅ Inserted 6 categories.`);

  // 4. Insert 30 Realistic Indian Menu Items (with 1-2 modifiers on some)
  console.log("🍛 Inserting 30 realistic Indian menu items with integer paise prices...");

  interface SeedMenuItem {
    categorySlug: string;
    name: string;
    description: string;
    pricePaise: number;
    isVeg: boolean;
    prepTimeMinutes: number;
    modifiers?: { groupName: string; name: string; pricePaise: number; isRequired: boolean }[];
  }

  const itemsToSeed: SeedMenuItem[] = [
    // Category 1: Small Plates & Chaats
    {
      categorySlug: "small-plates-chaats",
      name: "Dahi Ke Kebab",
      description: "Crispy pan-seared hung curd croquettes flavored with cardamom and crushed green chillies.",
      pricePaise: 28500, // ₹285
      isVeg: true,
      prepTimeMinutes: 12,
      modifiers: [
        { groupName: "Dip Choice", name: "Mint & Coriander Chutney", pricePaise: 0, isRequired: true },
        { groupName: "Dip Choice", name: "Roasted Garlic Yoghurt", pricePaise: 3000, isRequired: false },
      ],
    },
    {
      categorySlug: "small-plates-chaats",
      name: "Palak Patta Chaat",
      description: "Flash-fried baby spinach leaves drizzled with sweetened curd, tamarind glaze, and sev.",
      pricePaise: 24500, // ₹245
      isVeg: true,
      prepTimeMinutes: 10,
      modifiers: [
        { groupName: "Spice Level", name: "Mild & Tangy", pricePaise: 0, isRequired: true },
        { groupName: "Spice Level", name: "Extra Spiced", pricePaise: 0, isRequired: false },
      ],
    },
    {
      categorySlug: "small-plates-chaats",
      name: "Kurkuri Bhindi Fries",
      description: "Julienned tender okra tossed in chickpea crust, chaat masala, and dried mango powder.",
      pricePaise: 22500, // ₹225
      isVeg: true,
      prepTimeMinutes: 10,
    },
    {
      categorySlug: "small-plates-chaats",
      name: "Amritsari Fish Tikka Bites",
      description: "Carom-seed spiced river sole fillets crisped in mustard oil, served with pickled radish.",
      pricePaise: 39500, // ₹395
      isVeg: false,
      prepTimeMinutes: 15,
      modifiers: [
        { groupName: "Dip", name: "Bengali Kasundi Dip", pricePaise: 0, isRequired: true },
        { groupName: "Dip", name: "Spicy Lemon Glaze", pricePaise: 2500, isRequired: false },
      ],
    },
    {
      categorySlug: "small-plates-chaats",
      name: "Galouti Kebab Sliders",
      description: "Melt-in-mouth smoked lamb patties infused with 16 spices on mini saffron sheermal buns.",
      pricePaise: 42500, // ₹425
      isVeg: false,
      prepTimeMinutes: 16,
    },

    // Category 2: Tandoor & Sigdi Grills
    {
      categorySlug: "tandoor-sigdi-grills",
      name: "Paneer Tikka Shashlik",
      description: "Tandoor-charred cottage cheese cubes with bell peppers, onion petals, and kasuri methi marinade.",
      pricePaise: 36500, // ₹365
      isVeg: true,
      prepTimeMinutes: 18,
      modifiers: [
        { groupName: "Marination", name: "Classic Mustard & Yellow Chilli", pricePaise: 0, isRequired: true },
        { groupName: "Marination", name: "Rich Malai Cream", pricePaise: 3500, isRequired: false },
      ],
    },
    {
      categorySlug: "tandoor-sigdi-grills",
      name: "Tandoori Broccoli Charred Floret",
      description: "Broccoli florets steeped in Philadelphia cream cheese, roasted cumin, and mace.",
      pricePaise: 34500, // ₹345
      isVeg: true,
      prepTimeMinutes: 15,
    },
    {
      categorySlug: "tandoor-sigdi-grills",
      name: "Bhatti Da Murgh",
      description: "Rustic bone-in chicken thighs roasted in charcoal bhatti with crushed peppercorns and malt vinegar.",
      pricePaise: 44500, // ₹445
      isVeg: false,
      prepTimeMinutes: 20,
      modifiers: [
        { groupName: "Spice Level", name: "Punjab Regular Spice", pricePaise: 0, isRequired: true },
        { groupName: "Spice Level", name: "Extra Fiery Guntur Chilli", pricePaise: 0, isRequired: false },
      ],
    },
    {
      categorySlug: "tandoor-sigdi-grills",
      name: "Murgh Malai Tikka",
      description: "Velvety boneless chicken morsels marinated in green cardamom, cashew paste, and fresh cream.",
      pricePaise: 46500, // ₹465
      isVeg: false,
      prepTimeMinutes: 18,
      modifiers: [
        { groupName: "Garnish", name: "Smoked Silver Leaf & Pistachio", pricePaise: 4000, isRequired: false },
      ],
    },
    {
      categorySlug: "tandoor-sigdi-grills",
      name: "Sigdi Lamb Seekh Kebab",
      description: "Hand-pounded minced mutton skewered over coal embers, scented with rose petals and mace.",
      pricePaise: 49500, // ₹495
      isVeg: false,
      prepTimeMinutes: 22,
    },

    // Category 3: Signature Curries
    {
      categorySlug: "signature-curries",
      name: "Old Delhi Butter Chicken",
      description: "Charcoal-smoked chicken simmered in velvet satin tomato gravy, dairy butter, and fenugreek.",
      pricePaise: 48500, // ₹485
      isVeg: false,
      prepTimeMinutes: 20,
      modifiers: [
        { groupName: "Preparation", name: "Classic Bone-In Cut", pricePaise: 0, isRequired: true },
        { groupName: "Preparation", name: "Tender Boneless Fillet", pricePaise: 5000, isRequired: false },
      ],
    },
    {
      categorySlug: "signature-curries",
      name: "Champaran Handi Gosht",
      description: "Slow-braised mutton sealed in clay pots with whole roasted garlic pods and pure mustard oil.",
      pricePaise: 56500, // ₹565
      isVeg: false,
      prepTimeMinutes: 25,
      modifiers: [
        { groupName: "Spice Level", name: "Authentic Champaran", pricePaise: 0, isRequired: true },
        { groupName: "Spice Level", name: "Moderate Heat", pricePaise: 0, isRequired: false },
      ],
    },
    {
      categorySlug: "signature-curries",
      name: "Dal Makhani 24-Hour Simmer",
      description: "Whole black urad lentils slow-cooked overnight with vine-ripened tomatoes and butter.",
      pricePaise: 36500, // ₹365
      isVeg: true,
      prepTimeMinutes: 15,
      modifiers: [
        { groupName: "Butter", name: "Classic White Makkhan", pricePaise: 0, isRequired: true },
        { groupName: "Butter", name: "Extra Makkhan Dollop", pricePaise: 3000, isRequired: false },
      ],
    },
    {
      categorySlug: "signature-curries",
      name: "Paneer Lababdar",
      description: "Cottage cheese steeped in rich onion-tomato gravy with grated paneer and freshly pounded spices.",
      pricePaise: 39500, // ₹395
      isVeg: true,
      prepTimeMinutes: 18,
    },
    {
      categorySlug: "signature-curries",
      name: "Dum Aloo Kashmiri",
      description: "Crisp baby potatoes slow-cooked in sun-dried Kashmiri fennel and dried ginger yogurt sauce.",
      pricePaise: 34500, // ₹345
      isVeg: true,
      prepTimeMinutes: 18,
    },

    // Category 4: Dum Biryanis & Pulao
    {
      categorySlug: "dum-biryanis-pulao",
      name: "Awadhi Murgh Dum Biryani",
      description: "Fragrant aged basmati rice layered with saffron chicken, brown onions, and kewra essence.",
      pricePaise: 46500, // ₹465
      isVeg: false,
      prepTimeMinutes: 25,
      modifiers: [
        { groupName: "Raita", name: "Burani Garlic Raita", pricePaise: 0, isRequired: true },
        { groupName: "Raita", name: "Cool Boondi Raita", pricePaise: 0, isRequired: false },
      ],
    },
    {
      categorySlug: "dum-biryanis-pulao",
      name: "Gosht Dum Biryani",
      description: "Succulent cuts of lamb marinated overnight, dum cooked in brass degh with long-grain rice.",
      pricePaise: 58500, // ₹585
      isVeg: false,
      prepTimeMinutes: 28,
      modifiers: [
        { groupName: "Side Accompaniment", name: "Hyderabadi Mirchi Ka Salan", pricePaise: 4000, isRequired: false },
      ],
    },
    {
      categorySlug: "dum-biryanis-pulao",
      name: "Subz Tarkari Dum Biryani",
      description: "Garden vegetables, baby corn, and fresh cottage cheese layered with fragrant herbs and saffron.",
      pricePaise: 38500, // ₹385
      isVeg: true,
      prepTimeMinutes: 20,
      modifiers: [
        { groupName: "Raita", name: "Pomegranate Mint Raita", pricePaise: 0, isRequired: true },
      ],
    },
    {
      categorySlug: "dum-biryanis-pulao",
      name: "Jeera & Ghee Brown Basmati",
      description: "Aromatic basmati tossed with toasted royal cumin and clarified organic A2 cow ghee.",
      pricePaise: 22500, // ₹225
      isVeg: true,
      prepTimeMinutes: 12,
    },
    {
      categorySlug: "dum-biryanis-pulao",
      name: "Saffron Motia Pulao",
      description: "Kashmiri saffron scented rice tossed with fresh green peas, paneer pearls, and caramelized onions.",
      pricePaise: 29500, // ₹295
      isVeg: true,
      prepTimeMinutes: 15,
    },

    // Category 5: Artisanal Breads & Sides
    {
      categorySlug: "artisanal-breads-sides",
      name: "Garlic Butter Naan",
      description: "Hand-stretched leavened flatbread baked on tandoor walls, brushed with garlic butter.",
      pricePaise: 11500, // ₹115
      isVeg: true,
      prepTimeMinutes: 8,
      modifiers: [
        { groupName: "Butter", name: "Classic Garlic Butter", pricePaise: 0, isRequired: true },
        { groupName: "Butter", name: "Smoked Chilli Garlic Glaze", pricePaise: 2000, isRequired: false },
      ],
    },
    {
      categorySlug: "artisanal-breads-sides",
      name: "Truffle & Aged Cheddar Naan",
      description: "Crisp tandoori naan stuffed with aged cheddar and finished with cold-pressed truffle oil.",
      pricePaise: 18500, // ₹185
      isVeg: true,
      prepTimeMinutes: 10,
    },
    {
      categorySlug: "artisanal-breads-sides",
      name: "Laccha Paratha",
      description: "Flaky, multi-layered spiral bread made with whole wheat, baked to golden crisp perfection.",
      pricePaise: 9500, // ₹95
      isVeg: true,
      prepTimeMinutes: 8,
      modifiers: [
        { groupName: "Flour", name: "Whole Wheat Atta", pricePaise: 0, isRequired: true },
        { groupName: "Flour", name: "Pudina (Mint) Infused", pricePaise: 1500, isRequired: false },
      ],
    },
    {
      categorySlug: "artisanal-breads-sides",
      name: "Roomali Roti",
      description: "Paper-thin handkerchief bread tossed in air and quickly baked on an inverted wok.",
      pricePaise: 7500, // ₹75
      isVeg: true,
      prepTimeMinutes: 6,
    },
    {
      categorySlug: "artisanal-breads-sides",
      name: "Smoked Burani Garlic Raita",
      description: "Creamy set curd infused with slow-roasted garlic cloves and smoked coal essence.",
      pricePaise: 12500, // ₹125
      isVeg: true,
      prepTimeMinutes: 5,
    },

    // Category 6: Desserts & Beverages
    {
      categorySlug: "desserts-beverages",
      name: "Saffron Angoori Rasmalai",
      description: "Miniature poached cottage cheese dumplings soaked in reduced saffron pistachio milk.",
      pricePaise: 24500, // ₹245
      isVeg: true,
      prepTimeMinutes: 8,
    },
    {
      categorySlug: "desserts-beverages",
      name: "Warm Gulab Jamun with Rabdi",
      description: "Khowa dumplings soaked in rose-cardamom syrup, served over chilled Lucknowi lachha rabdi.",
      pricePaise: 22500, // ₹225
      isVeg: true,
      prepTimeMinutes: 8,
    },
    {
      categorySlug: "desserts-beverages",
      name: "Alphonso Mango & Cardamom Lassi",
      description: "Churned thick yogurt blended with Ratnagiri mango pulp and freshly ground green cardamom.",
      pricePaise: 17500, // ₹175
      isVeg: true,
      prepTimeMinutes: 6,
      modifiers: [
        { groupName: "Sweetness", name: "Standard Sweet", pricePaise: 0, isRequired: true },
        { groupName: "Sweetness", name: "Low Sweetness", pricePaise: 0, isRequired: false },
      ],
    },
    {
      categorySlug: "desserts-beverages",
      name: "Masala Chai Affogato",
      description: "Single scoop of artisanal malai kulfi drowned in a piping hot shot of concentrated spiced tea.",
      pricePaise: 19500, // ₹195
      isVeg: true,
      prepTimeMinutes: 6,
    },
    {
      categorySlug: "desserts-beverages",
      name: "Smoked Nimbu Shikanji",
      description: "Traditional Delhi spiced lemonade with rock salt, roasted cumin, fresh mint, and soda.",
      pricePaise: 14500, // ₹145
      isVeg: true,
      prepTimeMinutes: 5,
      modifiers: [
        { groupName: "Base", name: "Chilled Still Water", pricePaise: 0, isRequired: true },
        { groupName: "Base", name: "Sparkling Club Soda", pricePaise: 3000, isRequired: false },
      ],
    },
  ];

  let insertedItemCount = 0;
  let insertedModifierCount = 0;

  for (let idx = 0; idx < itemsToSeed.length; idx++) {
    const item = itemsToSeed[idx];
    const categoryId = categoryMap.get(item.categorySlug);
    if (!categoryId) continue;

    const [insertedItem] = await db
      .insert(schema.menuItems)
      .values({
        restaurantId,
        categoryId,
        name: item.name,
        description: item.description,
        pricePaise: item.pricePaise,
        isVeg: item.isVeg,
        prepTimeMinutes: item.prepTimeMinutes,
        sortOrder: idx + 1,
        isAvailable: true,
      })
      .returning();

    insertedItemCount++;

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        await db.insert(schema.modifiers).values({
          menuItemId: insertedItem.id,
          groupName: mod.groupName,
          name: mod.name,
          pricePaise: mod.pricePaise,
          isRequired: mod.isRequired,
        });
        insertedModifierCount++;
      }
    }
  }

  console.log(`✅ Inserted ${insertedItemCount} menu items with ${insertedModifierCount} modifiers.`);

  // 5. Insert Two Staff Users (kitchen, manager) with Hashed Passwords
  console.log("👥 Creating 2 staff users (kitchen, manager) with bcrypt hashed passwords...");

  const kitchenPasswordHash = bcrypt.hashSync("kitchen123", 10);
  const managerPasswordHash = bcrypt.hashSync("manager123", 10);

  const staff = [
    {
      restaurantId,
      username: "kitchen",
      email: "kitchen@masalane.demo",
      passwordHash: kitchenPasswordHash,
      role: "kitchen" as const,
      isActive: true,
    },
    {
      restaurantId,
      username: "manager",
      email: "manager@masalane.demo",
      passwordHash: managerPasswordHash,
      role: "manager" as const,
      isActive: true,
    },
  ];

  for (const user of staff) {
    await db.insert(schema.staffUsers).values(user);
  }
  console.log("✅ Inserted staff users: 'kitchen' (pw: kitchen123) and 'manager' (pw: manager123).");

  console.log("\n🎉 Seed completed successfully!");
  console.log(`Summary:
  - Restaurant: Masala Lane (${restaurantId})
  - Tables: 12 (with indexed unguessable qr_token)
  - Categories: 6
  - Menu Items: 30 (with veg flags, prep minutes, integer paise)
  - Modifiers: ${insertedModifierCount}
  - Staff Users: 2 (kitchen, manager)
  `);

  await pool.end();
}

seed().catch(async (error) => {
  console.error("❌ Seed failed:", error);
  await pool.end();
  process.exit(1);
});
