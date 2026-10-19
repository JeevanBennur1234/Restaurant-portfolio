export interface SeedMenuItem {
  categorySlug: string;
  name: string;
  slug: string;
  imageUrl: string;
  description: string;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  modifiers?: { groupName: string; name: string; pricePaise: number; isRequired: boolean }[];
}

export const SEEDED_DISHES: SeedMenuItem[] = [
  // Category 1: Small Plates & Chaats
  {
    categorySlug: "small-plates-chaats",
    name: "Dahi Ke Kebab",
    slug: "dahi-ke-kebab",
    imageUrl: "/images/dishes/dahi-ke-kebab.jpg",
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
    slug: "palak-patta-chaat",
    imageUrl: "/images/dishes/palak-patta-chaat.jpg",
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
    slug: "kurkuri-bhindi-fries",
    imageUrl: "/images/dishes/kurkuri-bhindi-fries.jpg",
    description: "Julienned tender okra tossed in chickpea crust, chaat masala, and dried mango powder.",
    pricePaise: 22500, // ₹225
    isVeg: true,
    prepTimeMinutes: 10,
  },
  {
    categorySlug: "small-plates-chaats",
    name: "Amritsari Fish Tikka Bites",
    slug: "amritsari-fish-tikka-bites",
    imageUrl: "/images/dishes/amritsari-fish-tikka-bites.jpg",
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
    slug: "galouti-kebab-sliders",
    imageUrl: "/images/dishes/galouti-kebab-sliders.jpg",
    description: "Melt-in-mouth smoked lamb patties infused with 16 spices on mini saffron sheermal buns.",
    pricePaise: 42500, // ₹425
    isVeg: false,
    prepTimeMinutes: 16,
  },

  // Category 2: Tandoor & Sigdi Grills
  {
    categorySlug: "tandoor-sigdi-grills",
    name: "Paneer Tikka Shashlik",
    slug: "paneer-tikka",
    imageUrl: "/images/dishes/paneer-tikka.jpg",
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
    slug: "tandoori-broccoli",
    imageUrl: "/images/dishes/tandoori-broccoli.jpg",
    description: "Broccoli florets steeped in Philadelphia cream cheese, roasted cumin, and mace.",
    pricePaise: 34500, // ₹345
    isVeg: true,
    prepTimeMinutes: 15,
  },
  {
    categorySlug: "tandoor-sigdi-grills",
    name: "Bhatti Da Murgh",
    slug: "bhatti-da-murgh",
    imageUrl: "/images/dishes/bhatti-da-murgh.jpg",
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
    slug: "murgh-malai-tikka",
    imageUrl: "/images/dishes/murgh-malai-tikka.jpg",
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
    slug: "lamb-seekh-kebab",
    imageUrl: "/images/dishes/lamb-seekh-kebab.jpg",
    description: "Hand-pounded minced mutton skewered over coal embers, scented with rose petals and mace.",
    pricePaise: 49500, // ₹495
    isVeg: false,
    prepTimeMinutes: 22,
  },

  // Category 3: Signature Curries
  {
    categorySlug: "signature-curries",
    name: "Old Delhi Butter Chicken",
    slug: "butter-chicken",
    imageUrl: "/images/dishes/butter-chicken.jpg",
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
    slug: "champaran-handi-gosht",
    imageUrl: "/images/dishes/champaran-handi-gosht.jpg",
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
    slug: "dal-makhani",
    imageUrl: "/images/dishes/dal-makhani.jpg",
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
    slug: "paneer-lababdar",
    imageUrl: "/images/dishes/paneer-lababdar.jpg",
    description: "Cottage cheese steeped in rich onion-tomato gravy with grated paneer and freshly pounded spices.",
    pricePaise: 39500, // ₹395
    isVeg: true,
    prepTimeMinutes: 18,
  },
  {
    categorySlug: "signature-curries",
    name: "Dum Aloo Kashmiri",
    slug: "dum-aloo-kashmiri",
    imageUrl: "/images/dishes/dum-aloo-kashmiri.jpg",
    description: "Crisp baby potatoes slow-cooked in sun-dried Kashmiri fennel and dried ginger yogurt sauce.",
    pricePaise: 34500, // ₹345
    isVeg: true,
    prepTimeMinutes: 18,
  },

  // Category 4: Dum Biryanis & Pulao
  {
    categorySlug: "dum-biryanis-pulao",
    name: "Awadhi Murgh Dum Biryani",
    slug: "murgh-dum-biryani",
    imageUrl: "/images/dishes/murgh-dum-biryani.jpg",
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
    slug: "gosht-dum-biryani",
    imageUrl: "/images/dishes/gosht-dum-biryani.jpg",
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
    slug: "subz-dum-biryani",
    imageUrl: "/images/dishes/subz-dum-biryani.jpg",
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
    slug: "jeera-rice",
    imageUrl: "/images/dishes/jeera-rice.jpg",
    description: "Aromatic basmati tossed with toasted royal cumin and clarified organic A2 cow ghee.",
    pricePaise: 22500, // ₹225
    isVeg: true,
    prepTimeMinutes: 12,
  },
  {
    categorySlug: "dum-biryanis-pulao",
    name: "Saffron Motia Pulao",
    slug: "saffron-pulao",
    imageUrl: "/images/dishes/saffron-pulao.jpg",
    description: "Kashmiri saffron scented rice tossed with fresh green peas, paneer pearls, and caramelized onions.",
    pricePaise: 29500, // ₹295
    isVeg: true,
    prepTimeMinutes: 15,
  },

  // Category 5: Artisanal Breads & Sides
  {
    categorySlug: "artisanal-breads-sides",
    name: "Garlic Butter Naan",
    slug: "garlic-naan",
    imageUrl: "/images/dishes/garlic-naan.jpg",
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
    slug: "truffle-cheddar-naan",
    imageUrl: "/images/dishes/truffle-cheddar-naan.jpg",
    description: "Crisp tandoori naan stuffed with aged cheddar and finished with cold-pressed truffle oil.",
    pricePaise: 18500, // ₹185
    isVeg: true,
    prepTimeMinutes: 10,
  },
  {
    categorySlug: "artisanal-breads-sides",
    name: "Laccha Paratha",
    slug: "laccha-paratha",
    imageUrl: "/images/dishes/laccha-paratha.jpg",
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
    slug: "roomali-roti",
    imageUrl: "/images/dishes/roomali-roti.jpg",
    description: "Paper-thin handkerchief bread tossed in air and quickly baked on an inverted wok.",
    pricePaise: 7500, // ₹75
    isVeg: true,
    prepTimeMinutes: 6,
  },
  {
    categorySlug: "artisanal-breads-sides",
    name: "Smoked Burani Garlic Raita",
    slug: "burani-raita",
    imageUrl: "/images/dishes/burani-raita.jpg",
    description: "Creamy set curd infused with slow-roasted garlic cloves and smoked coal essence.",
    pricePaise: 12500, // ₹125
    isVeg: true,
    prepTimeMinutes: 5,
  },
  {
    categorySlug: "artisanal-breads-sides",
    name: "Roasted Masala Papad (₹1 Test Item)",
    slug: "roasted-masala-papad",
    imageUrl: "/images/dishes/roasted-masala-papad.jpg",
    description: "Crisp lentil wafer sprinkled with chaat masala, toasted cumin, and fresh coriander. Specially priced for live payment testing.",
    pricePaise: 100, // ₹1
    isVeg: true,
    prepTimeMinutes: 3,
  },

  // Category 6: Desserts & Beverages
  {
    categorySlug: "desserts-beverages",
    name: "Saffron Angoori Rasmalai",
    slug: "rasmalai",
    imageUrl: "/images/dishes/rasmalai.jpg",
    description: "Miniature poached cottage cheese dumplings soaked in reduced saffron pistachio milk.",
    pricePaise: 24500, // ₹245
    isVeg: true,
    prepTimeMinutes: 8,
  },
  {
    categorySlug: "desserts-beverages",
    name: "Warm Gulab Jamun with Rabdi",
    slug: "gulab-jamun-rabdi",
    imageUrl: "/images/dishes/gulab-jamun-rabdi.jpg",
    description: "Khowa dumplings soaked in rose-cardamom syrup, served over chilled Lucknowi lachha rabdi.",
    pricePaise: 22500, // ₹225
    isVeg: true,
    prepTimeMinutes: 8,
  },
  {
    categorySlug: "desserts-beverages",
    name: "Alphonso Mango & Cardamom Lassi",
    slug: "mango-lassi",
    imageUrl: "/images/dishes/mango-lassi.jpg",
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
    slug: "masala-chai-affogato",
    imageUrl: "/images/dishes/masala-chai-affogato.jpg",
    description: "Single scoop of artisanal malai kulfi drowned in a piping hot shot of concentrated spiced tea.",
    pricePaise: 19500, // ₹195
    isVeg: true,
    prepTimeMinutes: 6,
  },
  {
    categorySlug: "desserts-beverages",
    name: "Smoked Nimbu Shikanji",
    slug: "nimbu-shikanji",
    imageUrl: "/images/dishes/nimbu-shikanji.jpg",
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
