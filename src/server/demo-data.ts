import { demoOrdersStore, type DemoOrder, type DemoOrderItem } from "@/server/demo-orders";

export interface DemoCategory {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoModifier {
  id: string;
  menuItemId: string;
  groupName: string;
  name: string;
  pricePaise: number;
  isRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoMenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  modifiers: DemoModifier[];
}

export interface DemoTable {
  id: string;
  restaurantId: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Global persistent storage across hot reloads
const globalForDemoData = globalThis as unknown as {
  demoCategories: Map<string, DemoCategory> | undefined;
  demoMenuItems: Map<string, DemoMenuItem> | undefined;
  demoTables: Map<string, DemoTable> | undefined;
  demoDataInitialized: boolean | undefined;
};

export const demoCategoriesStore =
  globalForDemoData.demoCategories ?? new Map<string, DemoCategory>();
export const demoMenuItemsStore =
  globalForDemoData.demoMenuItems ?? new Map<string, DemoMenuItem>();
export const demoTablesStore =
  globalForDemoData.demoTables ?? new Map<string, DemoTable>();

if (process.env.NODE_ENV !== "production") {
  globalForDemoData.demoCategories = demoCategoriesStore;
  globalForDemoData.demoMenuItems = demoMenuItemsStore;
  globalForDemoData.demoTables = demoTablesStore;
}

/**
 * Initializes realistic default catalog and past 7-day orders for demo preview
 */
export function initializeDemoDataIfNeeded() {
  if (globalForDemoData.demoDataInitialized && demoCategoriesStore.size > 0) {
    return;
  }

  const REST_ID = "rest-masala-lane";
  const now = new Date();

  // 1. Initialize Tables (12 tables with random unguessable tokens)
  if (demoTablesStore.size === 0) {
    const defaultTables: Array<{ num: string; cap: number; token: string }> = [
      { num: "Table 1", cap: 2, token: "ml-tbl-a19f82d" },
      { num: "Table 2", cap: 2, token: "ml-tbl-b28e71c" },
      { num: "Table 3", cap: 4, token: "ml-tbl-c37d60b" },
      { num: "Table 4", cap: 4, token: "ml-tbl-d46c59a" },
      { num: "Table 5", cap: 4, token: "ml-tbl-e55b48f" },
      { num: "Table 6", cap: 6, token: "ml-tbl-f64a37e" },
      { num: "Table 7", cap: 4, token: "demo" }, // Canonical demo token
      { num: "Table 8", cap: 6, token: "ml-tbl-h82815c" },
      { num: "Table 9", cap: 8, token: "ml-tbl-i91704b" },
      { num: "Table 10", cap: 4, token: "ml-tbl-j00693a" },
      { num: "Table 11", cap: 2, token: "ml-tbl-k19582f" },
      { num: "Table 12", cap: 6, token: "ml-tbl-l28471e" },
    ];

    defaultTables.forEach((t, i) => {
      const id = `tbl-${i + 1}`;
      demoTablesStore.set(id, {
        id,
        restaurantId: REST_ID,
        tableNumber: t.num,
        capacity: t.cap,
        qrToken: t.token,
        isActive: true,
        createdAt: new Date(now.getTime() - 14 * 86400000),
        updatedAt: now,
      });
    });
  }

  // 2. Initialize Categories
  if (demoCategoriesStore.size === 0) {
    const defaultCategories = [
      { id: "cat-1", name: "Small Plates & Chaats", slug: "small-plates-chaats", sortOrder: 1 },
      { id: "cat-2", name: "Tandoor & Sigdi Grills", slug: "tandoor-sigdi-grills", sortOrder: 2 },
      { id: "cat-3", name: "Signature Curries", slug: "signature-curries", sortOrder: 3 },
      { id: "cat-4", name: "Dum Biryanis & Pulao", slug: "dum-biryanis-pulao", sortOrder: 4 },
      { id: "cat-5", name: "Artisanal Breads & Sides", slug: "artisanal-breads-sides", sortOrder: 5 },
      { id: "cat-6", name: "Desserts & Beverages", slug: "desserts-beverages", sortOrder: 6 },
    ];

    defaultCategories.forEach((c) => {
      demoCategoriesStore.set(c.id, {
        id: c.id,
        restaurantId: REST_ID,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: true,
        createdAt: new Date(now.getTime() - 14 * 86400000),
        updatedAt: now,
      });
    });
  }

  // 3. Initialize Menu Items (30 items)
  if (demoMenuItemsStore.size === 0) {
    const rawItems: Array<{
      id: string;
      cat: string;
      name: string;
      desc: string;
      pricePaise: number;
      isVeg: boolean;
      prep: number;
      isAvail: boolean;
      mods: Array<{ id: string; group: string; name: string; price: number; req: boolean }>;
    }> = [
      {
        id: "item-1",
        cat: "cat-1",
        name: "Dahi Ke Kebab",
        desc: "Crispy pan-seared hung curd croquettes flavored with cardamom and crushed green chillies.",
        pricePaise: 28500,
        isVeg: true,
        prep: 12,
        isAvail: true,
        mods: [
          { id: "mod-1", group: "Dip Choice", name: "Mint & Coriander Chutney", price: 0, req: true },
          { id: "mod-2", group: "Dip Choice", name: "Roasted Garlic Yoghurt", price: 3000, req: false },
        ],
      },
      {
        id: "item-2",
        cat: "cat-1",
        name: "Palak Patta Chaat",
        desc: "Flash-fried baby spinach leaves drizzled with sweetened curd, tamarind glaze, and crisp sev.",
        pricePaise: 24500,
        isVeg: true,
        prep: 10,
        isAvail: true,
        mods: [
          { id: "mod-3", group: "Spice Level", name: "Mild & Tangy", price: 0, req: true },
          { id: "mod-4", group: "Spice Level", name: "Extra Spiced", price: 0, req: false },
        ],
      },
      {
        id: "item-3",
        cat: "cat-1",
        name: "Kurkuri Bhindi Fries",
        desc: "Julienned tender okra tossed in spiced chickpea crust, chaat masala, and dried mango powder.",
        pricePaise: 22500,
        isVeg: true,
        prep: 10,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-4",
        cat: "cat-1",
        name: "Amritsari Fish Tikka Bites",
        desc: "Carom-seed spiced river sole fillets crisped in cold-pressed mustard oil with pickled radish.",
        pricePaise: 39500,
        isVeg: false,
        prep: 15,
        isAvail: true,
        mods: [
          { id: "mod-5", group: "Dip", name: "Bengali Kasundi Dip", price: 0, req: true },
          { id: "mod-6", group: "Dip", name: "Spicy Lemon Glaze", price: 2500, req: false },
        ],
      },
      {
        id: "item-5",
        cat: "cat-1",
        name: "Galouti Kebab Sliders",
        desc: "Melt-in-mouth smoked lamb patties infused with 16 spices served on mini saffron sheermal buns.",
        pricePaise: 42500,
        isVeg: false,
        prep: 16,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-6",
        cat: "cat-2",
        name: "Paneer Tikka Shashlik",
        desc: "Tandoor-charred cottage cheese cubes with bell peppers, red onion petals, and kasuri methi marinade.",
        pricePaise: 36500,
        isVeg: true,
        prep: 18,
        isAvail: true,
        mods: [
          { id: "mod-7", group: "Marination", name: "Classic Mustard & Yellow Chilli", price: 0, req: true },
          { id: "mod-8", group: "Marination", name: "Rich Malai Cream", price: 3500, req: false },
        ],
      },
      {
        id: "item-7",
        cat: "cat-2",
        name: "Tandoori Broccoli Charred Floret",
        desc: "Broccoli florets steeped in Philadelphia cream cheese, roasted cumin, and mace.",
        pricePaise: 34500,
        isVeg: true,
        prep: 15,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-8",
        cat: "cat-2",
        name: "Bhatti Da Murgh",
        desc: "Rustic bone-in chicken thighs roasted in charcoal bhatti with crushed peppercorns and malt vinegar.",
        pricePaise: 44500,
        isVeg: false,
        prep: 20,
        isAvail: true,
        mods: [
          { id: "mod-9", group: "Spice Level", name: "Punjab Regular Spice", price: 0, req: true },
          { id: "mod-10", group: "Spice Level", name: "Extra Fiery Guntur Chilli", price: 0, req: false },
        ],
      },
      {
        id: "item-9",
        cat: "cat-2",
        name: "Murgh Malai Tikka",
        desc: "Velvety boneless chicken morsels marinated in green cardamom, cashew paste, and fresh cream.",
        pricePaise: 46500,
        isVeg: false,
        prep: 18,
        isAvail: true,
        mods: [
          { id: "mod-11", group: "Garnish", name: "Smoked Silver Leaf & Pistachio", price: 4000, req: false },
        ],
      },
      {
        id: "item-10",
        cat: "cat-2",
        name: "Sigdi Lamb Seekh Kebab",
        desc: "Hand-pounded minced mutton skewered over coal embers, scented with rose petals and mace.",
        pricePaise: 49500,
        isVeg: false,
        prep: 22,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-11",
        cat: "cat-3",
        name: "Old Delhi Butter Chicken",
        desc: "Charcoal-smoked chicken simmered in velvet satin tomato gravy, dairy butter, and fenugreek.",
        pricePaise: 48500,
        isVeg: false,
        prep: 20,
        isAvail: true,
        mods: [
          { id: "mod-12", group: "Preparation", name: "Classic Bone-In Cut", price: 0, req: true },
          { id: "mod-13", group: "Preparation", name: "Tender Boneless Fillet", price: 5000, req: false },
        ],
      },
      {
        id: "item-12",
        cat: "cat-3",
        name: "Champaran Handi Gosht",
        desc: "Slow-braised mutton sealed in clay pots with whole roasted garlic pods and pure mustard oil.",
        pricePaise: 56500,
        isVeg: false,
        prep: 25,
        isAvail: true,
        mods: [
          { id: "mod-14", group: "Spice Level", name: "Authentic Champaran", price: 0, req: true },
          { id: "mod-15", group: "Spice Level", name: "Moderate Heat", price: 0, req: false },
        ],
      },
      {
        id: "item-13",
        cat: "cat-3",
        name: "Dal Makhani 24-Hour Simmer",
        desc: "Whole black urad lentils slow-cooked overnight with vine-ripened tomatoes and butter.",
        pricePaise: 36500,
        isVeg: true,
        prep: 15,
        isAvail: true,
        mods: [
          { id: "mod-16", group: "Butter", name: "Classic White Makkhan", price: 0, req: true },
          { id: "mod-17", group: "Butter", name: "Extra Makkhan Dollop", price: 3000, req: false },
        ],
      },
      {
        id: "item-14",
        cat: "cat-3",
        name: "Paneer Lababdar",
        desc: "Cottage cheese steeped in rich onion-tomato gravy with grated paneer and freshly pounded spices.",
        pricePaise: 39500,
        isVeg: true,
        prep: 18,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-15",
        cat: "cat-3",
        name: "Dum Aloo Kashmiri",
        desc: "Crisp baby potatoes slow-cooked in sun-dried Kashmiri fennel and dried ginger yogurt sauce.",
        pricePaise: 34500,
        isVeg: true,
        prep: 18,
        isAvail: false,
        mods: [],
      },
      {
        id: "item-16",
        cat: "cat-4",
        name: "Awadhi Murgh Dum Biryani",
        desc: "Fragrant aged basmati rice layered with saffron chicken, brown onions, and kewra essence.",
        pricePaise: 46500,
        isVeg: false,
        prep: 25,
        isAvail: true,
        mods: [
          { id: "mod-18", group: "Raita", name: "Burani Garlic Raita", price: 0, req: true },
          { id: "mod-19", group: "Raita", name: "Cool Boondi Raita", price: 0, req: false },
        ],
      },
      {
        id: "item-17",
        cat: "cat-4",
        name: "Gosht Dum Biryani",
        desc: "Succulent cuts of lamb marinated overnight, dum cooked in brass degh with long-grain rice.",
        pricePaise: 58500,
        isVeg: false,
        prep: 28,
        isAvail: true,
        mods: [
          { id: "mod-20", group: "Side Accompaniment", name: "Hyderabadi Mirchi Ka Salan", price: 4000, req: false },
        ],
      },
      {
        id: "item-18",
        cat: "cat-4",
        name: "Subz Tarkari Dum Biryani",
        desc: "Garden vegetables, baby corn, and fresh cottage cheese layered with fragrant herbs and saffron.",
        pricePaise: 38500,
        isVeg: true,
        prep: 20,
        isAvail: true,
        mods: [
          { id: "mod-21", group: "Raita", name: "Pomegranate Mint Raita", price: 0, req: true },
        ],
      },
      {
        id: "item-19",
        cat: "cat-4",
        name: "Jeera & Ghee Brown Basmati",
        desc: "Aromatic basmati tossed with toasted royal cumin and clarified organic A2 cow ghee.",
        pricePaise: 22500,
        isVeg: true,
        prep: 12,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-20",
        cat: "cat-4",
        name: "Saffron Motia Pulao",
        desc: "Kashmiri saffron scented rice tossed with fresh green peas, paneer pearls, and caramelized onions.",
        pricePaise: 29500,
        isVeg: true,
        prep: 15,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-21",
        cat: "cat-5",
        name: "Garlic Butter Naan",
        desc: "Hand-stretched leavened flatbread baked on tandoor walls, brushed with garlic butter.",
        pricePaise: 11500,
        isVeg: true,
        prep: 8,
        isAvail: true,
        mods: [
          { id: "mod-22", group: "Butter", name: "Classic Garlic Butter", price: 0, req: true },
          { id: "mod-23", group: "Butter", name: "Smoked Chilli Garlic Glaze", price: 2000, req: false },
        ],
      },
      {
        id: "item-22",
        cat: "cat-5",
        name: "Truffle & Aged Cheddar Naan",
        desc: "Crisp tandoori naan stuffed with aged cheddar and finished with cold-pressed truffle oil.",
        pricePaise: 18500,
        isVeg: true,
        prep: 10,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-23",
        cat: "cat-5",
        name: "Laccha Paratha",
        desc: "Flaky, multi-layered spiral bread made with whole wheat, baked to golden crisp perfection.",
        pricePaise: 9500,
        isVeg: true,
        prep: 8,
        isAvail: true,
        mods: [
          { id: "mod-24", group: "Flour", name: "Whole Wheat Atta", price: 0, req: true },
          { id: "mod-25", group: "Flour", name: "Pudina (Mint) Infused", price: 1500, req: false },
        ],
      },
      {
        id: "item-24",
        cat: "cat-5",
        name: "Roomali Roti",
        desc: "Paper-thin handkerchief bread tossed in air and quickly baked on an inverted wok.",
        pricePaise: 7500,
        isVeg: true,
        prep: 6,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-25",
        cat: "cat-5",
        name: "Smoked Burani Garlic Raita",
        desc: "Creamy set curd infused with slow-roasted garlic cloves and smoked coal essence.",
        pricePaise: 12500,
        isVeg: true,
        prep: 5,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-26",
        cat: "cat-6",
        name: "Saffron Angoori Rasmalai",
        desc: "Miniature poached cottage cheese dumplings soaked in reduced saffron pistachio milk.",
        pricePaise: 24500,
        isVeg: true,
        prep: 8,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-27",
        cat: "cat-6",
        name: "Warm Gulab Jamun with Rabdi",
        desc: "Khowa dumplings soaked in rose-cardamom syrup, served over chilled Lucknowi lachha rabdi.",
        pricePaise: 22500,
        isVeg: true,
        prep: 8,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-28",
        cat: "cat-6",
        name: "Alphonso Mango & Cardamom Lassi",
        desc: "Churned thick yogurt blended with Ratnagiri mango pulp and freshly ground green cardamom.",
        pricePaise: 17500,
        isVeg: true,
        prep: 6,
        isAvail: true,
        mods: [
          { id: "mod-26", group: "Sweetness", name: "Standard Sweet", price: 0, req: true },
          { id: "mod-27", group: "Sweetness", name: "Low Sweetness", price: 0, req: false },
        ],
      },
      {
        id: "item-29",
        cat: "cat-6",
        name: "Masala Chai Affogato",
        desc: "Single scoop of artisanal malai kulfi drowned in a piping hot shot of concentrated spiced tea.",
        pricePaise: 19500,
        isVeg: true,
        prep: 6,
        isAvail: true,
        mods: [],
      },
      {
        id: "item-30",
        cat: "cat-6",
        name: "Smoked Nimbu Shikanji",
        desc: "Traditional Delhi spiced lemonade with rock salt, roasted cumin, fresh mint, and soda.",
        pricePaise: 14500,
        isVeg: true,
        prep: 5,
        isAvail: true,
        mods: [
          { id: "mod-28", group: "Base", name: "Chilled Still Water", price: 0, req: true },
          { id: "mod-29", group: "Base", name: "Sparkling Club Soda", price: 3000, req: false },
        ],
      },
    ];

    rawItems.forEach((ri, idx) => {
      const modifiers: DemoModifier[] = ri.mods.map((m) => ({
        id: m.id,
        menuItemId: ri.id,
        groupName: m.group,
        name: m.name,
        pricePaise: m.price,
        isRequired: m.req,
        createdAt: now,
        updatedAt: now,
      }));

      demoMenuItemsStore.set(ri.id, {
        id: ri.id,
        restaurantId: REST_ID,
        categoryId: ri.cat,
        name: ri.name,
        description: ri.desc,
        pricePaise: ri.pricePaise,
        isVeg: ri.isVeg,
        prepTimeMinutes: ri.prep,
        imageUrl: null,
        isAvailable: ri.isAvail,
        sortOrder: idx + 1,
        createdAt: new Date(now.getTime() - 14 * 86400000),
        updatedAt: now,
        modifiers,
      });
    });
  }

  // 4. Populate Realistic Past 7 Days Orders in demoOrdersStore if empty
  if (demoOrdersStore.size === 0) {
    const historicalOrderBlueprints: Array<{
      orderNumber: string;
      daysAgo: number;
      minutesAgo: number;
      tableNum: string;
      status: DemoOrder["status"];
      paymentStatus: DemoOrder["paymentStatus"];
      paymentMethod: DemoOrder["paymentMethod"];
      customerName: string;
      itemSpecs: Array<{ name: string; price: number; qty: number }>;
    }> = [
      // Today orders (0 days ago)
      {
        orderNumber: "ML-7841",
        daysAgo: 0,
        minutesAgo: 15,
        tableNum: "Table 7",
        status: "preparing",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Aarav Sharma",
        itemSpecs: [
          { name: "Old Delhi Butter Chicken", price: 48500, qty: 1 },
          { name: "Garlic Butter Naan", price: 11500, qty: 2 },
          { name: "Alphonso Mango & Cardamom Lassi", price: 17500, qty: 1 },
        ],
      },
      {
        orderNumber: "ML-7840",
        daysAgo: 0,
        minutesAgo: 45,
        tableNum: "Table 3",
        status: "ready",
        paymentStatus: "counter",
        paymentMethod: "counter",
        customerName: "Pooja Hegde",
        itemSpecs: [
          { name: "Paneer Tikka Shashlik", price: 36500, qty: 1 },
          { name: "Dal Makhani 24-Hour Simmer", price: 36500, qty: 1 },
          { name: "Laccha Paratha", price: 9500, qty: 3 },
        ],
      },
      {
        orderNumber: "ML-7839",
        daysAgo: 0,
        minutesAgo: 90,
        tableNum: "Table 5",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Vikram Rathore",
        itemSpecs: [
          { name: "Awadhi Murgh Dum Biryani", price: 46500, qty: 2 },
          { name: "Smoked Burani Garlic Raita", price: 12500, qty: 1 },
          { name: "Warm Gulab Jamun with Rabdi", price: 22500, qty: 2 },
        ],
      },
      {
        orderNumber: "ML-7838",
        daysAgo: 0,
        minutesAgo: 120,
        tableNum: "Table 1",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Divya Nambiar",
        itemSpecs: [
          { name: "Dahi Ke Kebab", price: 28500, qty: 1 },
          { name: "Champaran Handi Gosht", price: 56500, qty: 1 },
          { name: "Roomali Roti", price: 7500, qty: 4 },
        ],
      },
      {
        orderNumber: "ML-7837",
        daysAgo: 0,
        minutesAgo: 180,
        tableNum: "Table 9",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: "counter",
        customerName: "Karthik Verma",
        itemSpecs: [
          { name: "Amritsari Fish Tikka Bites", price: 39500, qty: 2 },
          { name: "Sigdi Lamb Seekh Kebab", price: 49500, qty: 2 },
          { name: "Gosht Dum Biryani", price: 58500, qty: 2 },
        ],
      },
      {
        orderNumber: "ML-7836",
        daysAgo: 0,
        minutesAgo: 240,
        tableNum: "Table 4",
        status: "cancelled",
        paymentStatus: "failed",
        paymentMethod: "pay_now",
        customerName: "Guest (Table 4)",
        itemSpecs: [
          { name: "Subz Tarkari Dum Biryani", price: 38500, qty: 1 },
        ],
      },

      // Yesterday (1 day ago)
      {
        orderNumber: "ML-7721",
        daysAgo: 1,
        minutesAgo: 200,
        tableNum: "Table 2",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Rohan Iyer",
        itemSpecs: [
          { name: "Old Delhi Butter Chicken", price: 48500, qty: 2 },
          { name: "Garlic Butter Naan", price: 11500, qty: 4 },
          { name: "Saffron Angoori Rasmalai", price: 24500, qty: 2 },
        ],
      },
      {
        orderNumber: "ML-7720",
        daysAgo: 1,
        minutesAgo: 340,
        tableNum: "Table 6",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Meera Sen",
        itemSpecs: [
          { name: "Awadhi Murgh Dum Biryani", price: 46500, qty: 3 },
          { name: "Murgh Malai Tikka", price: 46500, qty: 1 },
        ],
      },
      {
        orderNumber: "ML-7719",
        daysAgo: 1,
        minutesAgo: 450,
        tableNum: "Table 8",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: "counter",
        customerName: "Amitabh Banerjee",
        itemSpecs: [
          { name: "Dal Makhani 24-Hour Simmer", price: 36500, qty: 2 },
          { name: "Paneer Tikka Shashlik", price: 36500, qty: 2 },
          { name: "Laccha Paratha", price: 9500, qty: 6 },
        ],
      },

      // 2 days ago
      {
        orderNumber: "ML-7615",
        daysAgo: 2,
        minutesAgo: 180,
        tableNum: "Table 11",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Sneha Kapur",
        itemSpecs: [
          { name: "Champaran Handi Gosht", price: 56500, qty: 1 },
          { name: "Jeera & Ghee Brown Basmati", price: 22500, qty: 1 },
        ],
      },
      {
        orderNumber: "ML-7614",
        daysAgo: 2,
        minutesAgo: 300,
        tableNum: "Table 7",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Nikhil Joshi",
        itemSpecs: [
          { name: "Old Delhi Butter Chicken", price: 48500, qty: 2 },
          { name: "Garlic Butter Naan", price: 11500, qty: 3 },
        ],
      },

      // 3 days ago
      {
        orderNumber: "ML-7509",
        daysAgo: 3,
        minutesAgo: 220,
        tableNum: "Table 12",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Ananya Desai",
        itemSpecs: [
          { name: "Gosht Dum Biryani", price: 58500, qty: 3 },
          { name: "Galouti Kebab Sliders", price: 42500, qty: 2 },
        ],
      },

      // 4 days ago
      {
        orderNumber: "ML-7402",
        daysAgo: 4,
        minutesAgo: 260,
        tableNum: "Table 3",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Siddharth Rao",
        itemSpecs: [
          { name: "Bhatti Da Murgh", price: 44500, qty: 2 },
          { name: "Awadhi Murgh Dum Biryani", price: 46500, qty: 2 },
        ],
      },

      // 5 days ago
      {
        orderNumber: "ML-7311",
        daysAgo: 5,
        minutesAgo: 240,
        tableNum: "Table 5",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: "counter",
        customerName: "Tanvi Saxena",
        itemSpecs: [
          { name: "Paneer Lababdar", price: 39500, qty: 2 },
          { name: "Truffle & Aged Cheddar Naan", price: 18500, qty: 4 },
        ],
      },

      // 6 days ago
      {
        orderNumber: "ML-7208",
        daysAgo: 6,
        minutesAgo: 300,
        tableNum: "Table 10",
        status: "served",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Harish Nair",
        itemSpecs: [
          { name: "Old Delhi Butter Chicken", price: 48500, qty: 2 },
          { name: "Dal Makhani 24-Hour Simmer", price: 36500, qty: 1 },
          { name: "Garlic Butter Naan", price: 11500, qty: 4 },
        ],
      },
    ];

    historicalOrderBlueprints.forEach((bp, index) => {
      const orderDate = new Date(
        now.getTime() - bp.daysAgo * 86400000 - bp.minutesAgo * 60000
      );

      const items: DemoOrderItem[] = bp.itemSpecs.map((spec, itemIdx) => ({
        id: `demo-item-${index}-${itemIdx}`,
        menuItemId: `item-${itemIdx + 1}`,
        itemName: spec.name,
        itemPricePaise: spec.price,
        quantity: spec.qty,
        selectedModifiers: [],
        totalPaise: spec.price * spec.qty,
        notes: null,
      }));

      const subtotalPaise = items.reduce((sum, item) => sum + item.totalPaise, 0);
      const taxPaise = Math.round(subtotalPaise * 0.05);
      const totalPaise = subtotalPaise + taxPaise;

      const orderId = `ord-hist-${index + 1}`;
      demoOrdersStore.set(orderId, {
        id: orderId,
        restaurantId: REST_ID,
        tableId: `tbl-demo-${bp.tableNum.replace(/\D/g, "") || "1"}`,
        tableNumber: bp.tableNum,
        orderNumber: bp.orderNumber,
        status: bp.status,
        paymentStatus: bp.paymentStatus,
        paymentMethod: bp.paymentMethod,
        subtotalPaise,
        taxPaise,
        totalPaise,
        customerName: bp.customerName,
        customerPhone: "+91 98765 43210",
        specialInstructions: null,
        createdAt: orderDate,
        updatedAt: orderDate,
        items,
        events: [
          {
            id: `evt-${orderId}-1`,
            fromStatus: null,
            toStatus: "placed",
            note: "Order placed by guest",
            createdAt: orderDate,
          },
          ...(bp.status !== "placed"
            ? [
                {
                  id: `evt-${orderId}-2`,
                  fromStatus: "placed" as const,
                  toStatus: bp.status,
                  note: `Order marked ${bp.status}`,
                  createdAt: new Date(orderDate.getTime() + 10 * 60000),
                },
              ]
            : []),
        ],
      });
    });
  }

  globalForDemoData.demoDataInitialized = true;
}

// Auto-initialize on load
initializeDemoDataIfNeeded();
