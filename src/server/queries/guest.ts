import { eq, asc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  tables,
  restaurants,
  categories,
  menuItems,
} from "@/server/db/schema";
import { tokenParamSchema } from "@/lib/validations/guest";

export interface GuestModifier {
  id: string;
  groupName: string;
  name: string;
  pricePaise: number;
  isRequired: boolean;
}

export interface GuestMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifiers: GuestModifier[];
}

export interface GuestCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface GuestTable {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
}

export interface GuestRestaurant {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface GuestMenuData {
  restaurant: GuestRestaurant;
  table: GuestTable;
  categories: GuestCategory[];
  items: GuestMenuItem[];
}

export type GuestQueryResult =
  | { success: true; data: GuestMenuData }
  | { success: false; error: "INVALID_TOKEN" | "NOT_FOUND" | "INACTIVE_TABLE" };

// Deterministic seed catalog for demo fallback when PostgreSQL service is offline
const DEMO_CATEGORIES: GuestCategory[] = [
  { id: "cat-1", name: "Small Plates & Chaats", slug: "small-plates-chaats", sortOrder: 1 },
  { id: "cat-2", name: "Tandoor & Sigdi Grills", slug: "tandoor-sigdi-grills", sortOrder: 2 },
  { id: "cat-3", name: "Signature Curries", slug: "signature-curries", sortOrder: 3 },
  { id: "cat-4", name: "Dum Biryanis & Pulao", slug: "dum-biryanis-pulao", sortOrder: 4 },
  { id: "cat-5", name: "Artisanal Breads & Sides", slug: "artisanal-breads-sides", sortOrder: 5 },
  { id: "cat-6", name: "Desserts & Beverages", slug: "desserts-beverages", sortOrder: 6 },
];

const DEMO_ITEMS: GuestMenuItem[] = [
  // Small Plates
  {
    id: "item-1",
    categoryId: "cat-1",
    name: "Dahi Ke Kebab",
    description: "Crispy pan-seared hung curd croquettes flavored with cardamom and crushed green chillies.",
    pricePaise: 28500,
    isVeg: true,
    prepTimeMinutes: 12,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 1,
    modifiers: [
      { id: "mod-1", groupName: "Dip Choice", name: "Mint & Coriander Chutney", pricePaise: 0, isRequired: true },
      { id: "mod-2", groupName: "Dip Choice", name: "Roasted Garlic Yoghurt", pricePaise: 3000, isRequired: false },
    ],
  },
  {
    id: "item-2",
    categoryId: "cat-1",
    name: "Palak Patta Chaat",
    description: "Flash-fried baby spinach leaves drizzled with sweetened curd, tamarind glaze, and crisp sev.",
    pricePaise: 24500,
    isVeg: true,
    prepTimeMinutes: 10,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 2,
    modifiers: [
      { id: "mod-3", groupName: "Spice Level", name: "Mild & Tangy", pricePaise: 0, isRequired: true },
      { id: "mod-4", groupName: "Spice Level", name: "Extra Spiced", pricePaise: 0, isRequired: false },
    ],
  },
  {
    id: "item-3",
    categoryId: "cat-1",
    name: "Kurkuri Bhindi Fries",
    description: "Julienned tender okra tossed in spiced chickpea crust, chaat masala, and dried mango powder.",
    pricePaise: 22500,
    isVeg: true,
    prepTimeMinutes: 10,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 3,
    modifiers: [],
  },
  {
    id: "item-4",
    categoryId: "cat-1",
    name: "Amritsari Fish Tikka Bites",
    description: "Carom-seed spiced river sole fillets crisped in cold-pressed mustard oil with pickled radish.",
    pricePaise: 39500,
    isVeg: false,
    prepTimeMinutes: 15,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 4,
    modifiers: [
      { id: "mod-5", groupName: "Dip", name: "Bengali Kasundi Dip", pricePaise: 0, isRequired: true },
      { id: "mod-6", groupName: "Dip", name: "Spicy Lemon Glaze", pricePaise: 2500, isRequired: false },
    ],
  },
  {
    id: "item-5",
    categoryId: "cat-1",
    name: "Galouti Kebab Sliders",
    description: "Melt-in-mouth smoked lamb patties infused with 16 spices served on mini saffron sheermal buns.",
    pricePaise: 42500,
    isVeg: false,
    prepTimeMinutes: 16,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 5,
    modifiers: [],
  },

  // Tandoor & Sigdi Grills
  {
    id: "item-6",
    categoryId: "cat-2",
    name: "Paneer Tikka Shashlik",
    description: "Tandoor-charred cottage cheese cubes with bell peppers, red onion petals, and kasuri methi marinade.",
    pricePaise: 36500,
    isVeg: true,
    prepTimeMinutes: 18,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 6,
    modifiers: [
      { id: "mod-7", groupName: "Marination", name: "Classic Mustard & Yellow Chilli", pricePaise: 0, isRequired: true },
      { id: "mod-8", groupName: "Marination", name: "Rich Malai Cream", pricePaise: 3500, isRequired: false },
    ],
  },
  {
    id: "item-7",
    categoryId: "cat-2",
    name: "Tandoori Broccoli Charred Floret",
    description: "Broccoli florets steeped in Philadelphia cream cheese, roasted cumin, and mace.",
    pricePaise: 34500,
    isVeg: true,
    prepTimeMinutes: 15,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 7,
    modifiers: [],
  },
  {
    id: "item-8",
    categoryId: "cat-2",
    name: "Bhatti Da Murgh",
    description: "Rustic bone-in chicken thighs roasted in charcoal bhatti with crushed peppercorns and malt vinegar.",
    pricePaise: 44500,
    isVeg: false,
    prepTimeMinutes: 20,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 8,
    modifiers: [
      { id: "mod-9", groupName: "Spice Level", name: "Punjab Regular Spice", pricePaise: 0, isRequired: true },
      { id: "mod-10", groupName: "Spice Level", name: "Extra Fiery Guntur Chilli", pricePaise: 0, isRequired: false },
    ],
  },
  {
    id: "item-9",
    categoryId: "cat-2",
    name: "Murgh Malai Tikka",
    description: "Velvety boneless chicken morsels marinated in green cardamom, cashew paste, and fresh cream.",
    pricePaise: 46500,
    isVeg: false,
    prepTimeMinutes: 18,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 9,
    modifiers: [
      { id: "mod-11", groupName: "Garnish", name: "Smoked Silver Leaf & Pistachio", pricePaise: 4000, isRequired: false },
    ],
  },
  {
    id: "item-10",
    categoryId: "cat-2",
    name: "Sigdi Lamb Seekh Kebab",
    description: "Hand-pounded minced mutton skewered over coal embers, scented with rose petals and mace.",
    pricePaise: 49500,
    isVeg: false,
    prepTimeMinutes: 22,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 10,
    modifiers: [],
  },

  // Signature Curries
  {
    id: "item-11",
    categoryId: "cat-3",
    name: "Old Delhi Butter Chicken",
    description: "Charcoal-smoked chicken simmered in velvet satin tomato gravy, dairy butter, and fenugreek.",
    pricePaise: 48500,
    isVeg: false,
    prepTimeMinutes: 20,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 11,
    modifiers: [
      { id: "mod-12", groupName: "Preparation", name: "Classic Bone-In Cut", pricePaise: 0, isRequired: true },
      { id: "mod-13", groupName: "Preparation", name: "Tender Boneless Fillet", pricePaise: 5000, isRequired: false },
    ],
  },
  {
    id: "item-12",
    categoryId: "cat-3",
    name: "Champaran Handi Gosht",
    description: "Slow-braised mutton sealed in clay pots with whole roasted garlic pods and pure mustard oil.",
    pricePaise: 56500,
    isVeg: false,
    prepTimeMinutes: 25,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 12,
    modifiers: [
      { id: "mod-14", groupName: "Spice Level", name: "Authentic Champaran", pricePaise: 0, isRequired: true },
      { id: "mod-15", groupName: "Spice Level", name: "Moderate Heat", pricePaise: 0, isRequired: false },
    ],
  },
  {
    id: "item-13",
    categoryId: "cat-3",
    name: "Dal Makhani 24-Hour Simmer",
    description: "Whole black urad lentils slow-cooked overnight with vine-ripened tomatoes and butter.",
    pricePaise: 36500,
    isVeg: true,
    prepTimeMinutes: 15,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 13,
    modifiers: [
      { id: "mod-16", groupName: "Butter", name: "Classic White Makkhan", pricePaise: 0, isRequired: true },
      { id: "mod-17", groupName: "Butter", name: "Extra Makkhan Dollop", pricePaise: 3000, isRequired: false },
    ],
  },
  {
    id: "item-14",
    categoryId: "cat-3",
    name: "Paneer Lababdar",
    description: "Cottage cheese steeped in rich onion-tomato gravy with grated paneer and freshly pounded spices.",
    pricePaise: 39500,
    isVeg: true,
    prepTimeMinutes: 18,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 14,
    modifiers: [],
  },
  {
    id: "item-15",
    categoryId: "cat-3",
    name: "Dum Aloo Kashmiri",
    description: "Crisp baby potatoes slow-cooked in sun-dried Kashmiri fennel and dried ginger yogurt sauce.",
    pricePaise: 34500,
    isVeg: true,
    prepTimeMinutes: 18,
    imageUrl: null,
    isAvailable: false, // Mark one item as unavailable to test Sold Out state
    sortOrder: 15,
    modifiers: [],
  },

  // Dum Biryanis
  {
    id: "item-16",
    categoryId: "cat-4",
    name: "Awadhi Murgh Dum Biryani",
    description: "Fragrant aged basmati rice layered with saffron chicken, brown onions, and kewra essence.",
    pricePaise: 46500,
    isVeg: false,
    prepTimeMinutes: 25,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 16,
    modifiers: [
      { id: "mod-18", groupName: "Raita", name: "Burani Garlic Raita", pricePaise: 0, isRequired: true },
      { id: "mod-19", groupName: "Raita", name: "Cool Boondi Raita", pricePaise: 0, isRequired: false },
    ],
  },
  {
    id: "item-17",
    categoryId: "cat-4",
    name: "Gosht Dum Biryani",
    description: "Succulent cuts of lamb marinated overnight, dum cooked in brass degh with long-grain rice.",
    pricePaise: 58500,
    isVeg: false,
    prepTimeMinutes: 28,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 17,
    modifiers: [
      { id: "mod-20", groupName: "Side Accompaniment", name: "Hyderabadi Mirchi Ka Salan", pricePaise: 4000, isRequired: false },
    ],
  },
  {
    id: "item-18",
    categoryId: "cat-4",
    name: "Subz Tarkari Dum Biryani",
    description: "Garden vegetables, baby corn, and fresh cottage cheese layered with fragrant herbs and saffron.",
    pricePaise: 38500,
    isVeg: true,
    prepTimeMinutes: 20,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 18,
    modifiers: [
      { id: "mod-21", groupName: "Raita", name: "Pomegranate Mint Raita", pricePaise: 0, isRequired: true },
    ],
  },
  {
    id: "item-19",
    categoryId: "cat-4",
    name: "Jeera & Ghee Brown Basmati",
    description: "Aromatic basmati tossed with toasted royal cumin and clarified organic A2 cow ghee.",
    pricePaise: 22500,
    isVeg: true,
    prepTimeMinutes: 12,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 19,
    modifiers: [],
  },
  {
    id: "item-20",
    categoryId: "cat-4",
    name: "Saffron Motia Pulao",
    description: "Kashmiri saffron scented rice tossed with fresh green peas, paneer pearls, and caramelized onions.",
    pricePaise: 29500,
    isVeg: true,
    prepTimeMinutes: 15,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 20,
    modifiers: [],
  },

  // Artisanal Breads & Sides
  {
    id: "item-21",
    categoryId: "cat-5",
    name: "Garlic Butter Naan",
    description: "Hand-stretched leavened flatbread baked on tandoor walls, brushed with garlic butter.",
    pricePaise: 11500,
    isVeg: true,
    prepTimeMinutes: 8,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 21,
    modifiers: [
      { id: "mod-22", groupName: "Butter", name: "Classic Garlic Butter", pricePaise: 0, isRequired: true },
      { id: "mod-23", groupName: "Butter", name: "Smoked Chilli Garlic Glaze", pricePaise: 2000, isRequired: false },
    ],
  },
  {
    id: "item-22",
    categoryId: "cat-5",
    name: "Truffle & Aged Cheddar Naan",
    description: "Crisp tandoori naan stuffed with aged cheddar and finished with cold-pressed truffle oil.",
    pricePaise: 18500,
    isVeg: true,
    prepTimeMinutes: 10,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 22,
    modifiers: [],
  },
  {
    id: "item-23",
    categoryId: "cat-5",
    name: "Laccha Paratha",
    description: "Flaky, multi-layered spiral bread made with whole wheat, baked to golden crisp perfection.",
    pricePaise: 9500,
    isVeg: true,
    prepTimeMinutes: 8,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 23,
    modifiers: [
      { id: "mod-24", groupName: "Flour", name: "Whole Wheat Atta", pricePaise: 0, isRequired: true },
      { id: "mod-25", groupName: "Flour", name: "Pudina (Mint) Infused", pricePaise: 1500, isRequired: false },
    ],
  },
  {
    id: "item-24",
    categoryId: "cat-5",
    name: "Roomali Roti",
    description: "Paper-thin handkerchief bread tossed in air and quickly baked on an inverted wok.",
    pricePaise: 7500,
    isVeg: true,
    prepTimeMinutes: 6,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 24,
    modifiers: [],
  },
  {
    id: "item-25",
    categoryId: "cat-5",
    name: "Smoked Burani Garlic Raita",
    description: "Creamy set curd infused with slow-roasted garlic cloves and smoked coal essence.",
    pricePaise: 12500,
    isVeg: true,
    prepTimeMinutes: 5,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 25,
    modifiers: [],
  },

  // Desserts & Beverages
  {
    id: "item-26",
    categoryId: "cat-6",
    name: "Saffron Angoori Rasmalai",
    description: "Miniature poached cottage cheese dumplings soaked in reduced saffron pistachio milk.",
    pricePaise: 24500,
    isVeg: true,
    prepTimeMinutes: 8,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 26,
    modifiers: [],
  },
  {
    id: "item-27",
    categoryId: "cat-6",
    name: "Warm Gulab Jamun with Rabdi",
    description: "Khowa dumplings soaked in rose-cardamom syrup, served over chilled Lucknowi lachha rabdi.",
    pricePaise: 22500,
    isVeg: true,
    prepTimeMinutes: 8,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 27,
    modifiers: [],
  },
  {
    id: "item-28",
    categoryId: "cat-6",
    name: "Alphonso Mango & Cardamom Lassi",
    description: "Churned thick yogurt blended with Ratnagiri mango pulp and freshly ground green cardamom.",
    pricePaise: 17500,
    isVeg: true,
    prepTimeMinutes: 6,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 28,
    modifiers: [
      { id: "mod-26", groupName: "Sweetness", name: "Standard Sweet", pricePaise: 0, isRequired: true },
      { id: "mod-27", groupName: "Sweetness", name: "Low Sweetness", pricePaise: 0, isRequired: false },
    ],
  },
  {
    id: "item-29",
    categoryId: "cat-6",
    name: "Masala Chai Affogato",
    description: "Single scoop of artisanal malai kulfi drowned in a piping hot shot of concentrated spiced tea.",
    pricePaise: 19500,
    isVeg: true,
    prepTimeMinutes: 6,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 29,
    modifiers: [],
  },
  {
    id: "item-30",
    categoryId: "cat-6",
    name: "Smoked Nimbu Shikanji",
    description: "Traditional Delhi spiced lemonade with rock salt, roasted cumin, fresh mint, and soda.",
    pricePaise: 14500,
    isVeg: true,
    prepTimeMinutes: 5,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 30,
    modifiers: [
      { id: "mod-28", groupName: "Base", name: "Chilled Still Water", pricePaise: 0, isRequired: true },
      { id: "mod-29", groupName: "Base", name: "Sparkling Club Soda", pricePaise: 3000, isRequired: false },
    ],
  },
];

/**
 * Resolves a QR token to table and menu data on the server
 */
export async function getGuestTableAndMenu(
  rawToken: string
): Promise<GuestQueryResult> {
  const parsed = tokenParamSchema.safeParse(rawToken);
  if (!parsed.success) {
    return { success: false, error: "INVALID_TOKEN" };
  }
  const token = parsed.data;

  try {
    // 1. Attempt PostgreSQL resolution via Drizzle
    const tableRecord = await db.query.tables.findFirst({
      where: eq(tables.qrToken, token),
    });

    if (tableRecord) {
      if (!tableRecord.isActive) {
        return { success: false, error: "INACTIVE_TABLE" };
      }

      const restaurantRecord = await db.query.restaurants.findFirst({
        where: eq(restaurants.id, tableRecord.restaurantId),
      });

      if (!restaurantRecord || !restaurantRecord.isActive) {
        return { success: false, error: "NOT_FOUND" };
      }

      const categoryRecords = await db.query.categories.findMany({
        where: eq(categories.restaurantId, restaurantRecord.id),
        orderBy: [asc(categories.sortOrder)],
      });

      const menuItemRecords = await db.query.menuItems.findMany({
        where: eq(menuItems.restaurantId, restaurantRecord.id),
        orderBy: [asc(menuItems.sortOrder)],
      });

      const modifierRecords = await db.query.modifiers.findMany();
      const modifiersByItemId = new Map<string, GuestModifier[]>();
      for (const m of modifierRecords) {
        const list = modifiersByItemId.get(m.menuItemId) ?? [];
        list.push({
          id: m.id,
          groupName: m.groupName,
          name: m.name,
          pricePaise: m.pricePaise,
          isRequired: m.isRequired,
        });
        modifiersByItemId.set(m.menuItemId, list);
      }

      const formattedItems: GuestMenuItem[] = menuItemRecords.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        pricePaise: item.pricePaise,
        isVeg: item.isVeg,
        prepTimeMinutes: item.prepTimeMinutes,
        imageUrl: item.imageUrl,
        isAvailable: item.isAvailable,
        sortOrder: item.sortOrder,
        modifiers: modifiersByItemId.get(item.id) ?? [],
      }));

      return {
        success: true,
        data: {
          restaurant: {
            id: restaurantRecord.id,
            name: restaurantRecord.name,
            slug: restaurantRecord.slug,
            currency: restaurantRecord.currency,
          },
          table: {
            id: tableRecord.id,
            tableNumber: tableRecord.tableNumber,
            capacity: tableRecord.capacity,
            qrToken: tableRecord.qrToken,
          },
          categories: categoryRecords.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            sortOrder: c.sortOrder,
          })),
          items: formattedItems,
        },
      };
    }
  } catch (error) {
    console.warn("Drizzle DB query unreachable, evaluating demo fallback:", (error as Error).message);
  }

  // 2. Demo environment fallback: Match known demo tokens, "demo-table-X", or any table in demoTablesStore
  const {
    demoTablesStore,
    demoCategoriesStore,
    demoMenuItemsStore,
    initializeDemoDataIfNeeded,
  } = await import("@/server/demo-data");

  initializeDemoDataIfNeeded();

  // Find table from demoTablesStore
  let matchedTable: { id: string; tableNumber: string; capacity: number; qrToken: string } | null = null;

  for (const t of demoTablesStore.values()) {
    if (t.qrToken === token && t.isActive) {
      matchedTable = {
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        qrToken: t.qrToken,
      };
      break;
    }
  }

  const isDemoPattern =
    token === "demo" ||
    token.startsWith("demo-table-") ||
    token === "table-7" ||
    token === "table7";

  if (!matchedTable && isDemoPattern) {
    let tableNum = "Table 7";
    if (token.startsWith("demo-table-")) {
      const num = token.replace("demo-table-", "");
      tableNum = `Table ${num || "7"}`;
    }

    matchedTable = {
      id: "tbl-demo-7",
      tableNumber: tableNum,
      capacity: 4,
      qrToken: token,
    };
  }

  if (matchedTable) {
    const liveCategories = Array.from(demoCategoriesStore.values())
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
      }));

    const liveItems = Array.from(demoMenuItemsStore.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        pricePaise: i.pricePaise,
        isVeg: i.isVeg,
        prepTimeMinutes: i.prepTimeMinutes,
        imageUrl: i.imageUrl,
        isAvailable: i.isAvailable,
        sortOrder: i.sortOrder,
        modifiers: i.modifiers.map((m) => ({
          id: m.id,
          groupName: m.groupName,
          name: m.name,
          pricePaise: m.pricePaise,
          isRequired: m.isRequired,
        })),
      }));

    return {
      success: true,
      data: {
        restaurant: {
          id: "rest-masala-lane",
          name: "Masala Lane",
          slug: "masala-lane",
          currency: "INR",
        },
        table: matchedTable,
        categories: liveCategories.length > 0 ? liveCategories : DEMO_CATEGORIES,
        items: liveItems.length > 0 ? liveItems : DEMO_ITEMS,
      },
    };
  }

  // Unknown or invalid token
  return { success: false, error: "NOT_FOUND" };
}
