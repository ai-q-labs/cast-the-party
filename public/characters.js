// The six character looks. Everything here is original and fictional: no real
// people, brands, venues or landmarks. The same module is read by the server
// (to build the YouCam requests) and by the page (to draw the cards), so a
// look can never be shown with one recipe and rendered with another.
//
// Each look is a stack of layers, applied to the guest's photo in this order:
//   hairstyle -> hairColor -> makeup -> earrings      (the face card)
//   hat                                               (a separate portrait)
// `variants` holds the two hairstyle templates and the gender value the hat
// engine requires; YouCam groups its hairstyle templates as "female"/"male",
// and the guest picks whichever set they want to wear.

export const LAYER_ORDER = ["hairstyle", "hairColor", "makeup", "earrings", "hat"];

// Units per task, from GET /s2s/v2.0/credit/feature-cost (read 2026-10-24).
export const UNITS = { hairstyle: 1, hairColor: 1, makeup: 1, earrings: 1, hat: 2 };

export const LAYER_LABELS = {
  hairstyle: "Hairstyle",
  hairColor: "Hair colour",
  makeup: "Makeup",
  earrings: "Earrings",
  hat: "Hat portrait",
};

export const PROPS = {
  "hat-newsboy": { file: "props/hat-newsboy.jpg", label: "charcoal wool newsboy cap" },
  "hat-beanie": { file: "props/hat-beanie.jpg", label: "navy ribbed knit beanie" },
  "hat-straw": { file: "props/hat-straw.jpg", label: "straw sun hat with a cream band" },
  "hat-conductor": { file: "props/hat-conductor.jpg", label: "navy peaked conductor cap" },
  "earring-pearl": { file: "props/earring-pearl.jpg", label: "faux pearl drop earring" },
  "earring-rhinestone": { file: "props/earring-rhinestone.jpg", label: "rhinestone drop earring" },
  "earring-leaf": { file: "props/earring-leaf.jpg", label: "gold-tone leaf earring" },
};

const lip = (color, colorIntensity, shape = "original") => ({
  category: "lip_color",
  shape: { name: shape },
  style: { type: "full" },
  palettes: [{ color, texture: "matte", colorIntensity }],
});
const liner = (name, color, colorIntensity) => ({
  category: "eye_liner",
  pattern: { name },
  palettes: [{ color, texture: "matte", colorIntensity }],
});
const brows = (name, color, colorIntensity, thickness = 0) => ({
  category: "eyebrows",
  pattern: { type: "shape", name, curvature: 0, thickness, definition: 50 },
  palettes: [{ color, texture: "matte", colorIntensity }],
});
const blush = (color, colorIntensity) => ({
  category: "blush",
  pattern: { name: "1color1" },
  palettes: [{ color, texture: "matte", colorIntensity }],
});

export const CHARACTERS = [
  {
    id: "night-editor",
    name: "The Night Editor",
    setting: "A city daily's newsroom, 1926",
    brief:
      "Runs the late desk and decides what the city reads at dawn. Knows every rumour before it is printed, and which ones never will be.",
    look: "Sharp ink-black bob or slicked-back hair, a berry mouth, thin brows, pearl drops and a newsboy cap.",
    variants: {
      female: { hairstyle: "female_choppy_bob", label: "Choppy bob" },
      male: { hairstyle: "male_modern_slick_back", label: "Slicked back" },
    },
    hairColor: { hex: "#1B1717", name: "ink black", intensity: 85 },
    makeup: [lip("#7A1F3D", 75), liner("Upper6", "#1A1A1A", 70), brows("Thin1", "#2A2220", 45, -20)],
    makeupNote: "berry matte lip, thin dark liner, thin brows",
    earrings: "earring-pearl",
    hat: { prop: "hat-newsboy", style: "style_urban_fashion" },
    shopping: [
      { item: "Charcoal wool newsboy cap", layer: "hat", q: "grey wool newsboy cap" },
      { item: "Faux pearl drop earrings (clip-on if ears are not pierced)", layer: "earrings", q: "faux pearl drop earrings clip on" },
      { item: "Berry matte lipstick", layer: "makeup", q: "berry matte lipstick" },
      { item: "Dark waistcoat (vest)", q: "charcoal waistcoat vest" },
      { item: "Sleeve garters", q: "sleeve garters arm bands" },
      { item: "A pencil to keep behind one ear", q: "carpenter pencil" },
    ],
  },
  {
    id: "inn-keeper",
    name: "The Hot-Spring Inn Keeper",
    setting: "A mountain hot-spring inn, 1958",
    brief:
      "Has kept the inn through three snowed-in winters and remembers every guest's room number. Tonight, one room key is missing.",
    look: "Hair pinned up in a neat bun or parted in the middle, dark espresso colour, a soft coral lip.",
    variants: {
      female: { hairstyle: "female_top_bun", label: "Top bun" },
      male: { hairstyle: "male_center_parted_style", label: "Centre part" },
    },
    hairColor: { hex: "#2B1D16", name: "dark espresso", intensity: 75 },
    makeup: [lip("#C8645A", 45), brows("Straight1", "#2B1D16", 35)],
    makeupNote: "soft coral lip, straight natural brows",
    earrings: null,
    hat: null,
    shopping: [
      { item: "Plain cotton wrap robe with wide sleeves", q: "cotton wrap robe wide sleeves" },
      { item: "Short open-front jacket to wear over it", q: "short open front kimono jacket" },
      { item: "Wooden hair stick or simple comb", layer: "hairstyle", q: "wooden hair stick" },
      { item: "Soft coral lipstick", layer: "makeup", q: "coral lipstick" },
      { item: "Split-toe socks", q: "split toe socks" },
      { item: "A ring of old keys (the missing one is the point)", q: "antique skeleton key ring" },
    ],
  },
  {
    id: "lighthouse-keeper",
    name: "The Lighthouse Keeper",
    setting: "A storm-bound island light, 1894",
    brief:
      "Logs every ship that passes and every lamp that fails. The log for the night of the wreck has a page torn out.",
    look: "Wind-worn hair (a fishtail braid or a messy crop) turned salt grey, and a navy knit beanie.",
    variants: {
      female: { hairstyle: "female_fishtail_braid", label: "Fishtail braid" },
      male: { hairstyle: "male_messy_surfer_cut", label: "Messy crop" },
    },
    hairColor: { hex: "#8C8B87", name: "salt grey", intensity: 80 },
    makeup: null,
    earrings: null,
    hat: { prop: "hat-beanie", style: "style_warm_cozy" },
    shopping: [
      { item: "Navy ribbed knit beanie", layer: "hat", q: "navy ribbed knit beanie" },
      { item: "Grey hair spray or chalk (wash-out)", layer: "hairColor", q: "temporary grey hair color spray" },
      { item: "Cable-knit fisherman sweater", q: "cable knit fisherman sweater" },
      { item: "Yellow rain jacket", q: "yellow rain jacket" },
      { item: "Lantern with a battery candle", q: "metal lantern battery candle" },
      { item: "A battered logbook", q: "vintage leather logbook" },
    ],
  },
  {
    id: "club-singer",
    name: "The Supper-Club Singer",
    setting: "A basement supper club, 1934",
    brief:
      "Sings the last set every night and sees the whole room from the stage. Saw who left the table at 11:40, and is not saying.",
    look: "Glossy waves or a slick, platinum hair, a classic red lip with winged liner, rhinestone drops.",
    variants: {
      female: { hairstyle: "female_romantic_waves", label: "Romantic waves" },
      male: { hairstyle: "male_modern_slick_back", label: "Slicked back" },
    },
    hairColor: { hex: "#E3D3A8", name: "platinum", intensity: 85 },
    makeup: [lip("#B0102A", 80), liner("OpenWings1", "#111111", 75)],
    makeupNote: "classic red matte lip, winged liner",
    earrings: "earring-rhinestone",
    hat: null,
    shopping: [
      { item: "Rhinestone drop earrings (clip-on fine)", layer: "earrings", q: "rhinestone drop earrings clip on" },
      { item: "Classic red matte lipstick", layer: "makeup", q: "classic red matte lipstick" },
      { item: "Platinum wig or wash-out colour", layer: "hairColor", q: "platinum blonde wig vintage waves" },
      { item: "Sequinned dress or velvet dinner jacket", q: "sequin dress 1930s" },
      { item: "Satin gloves or a pocket square", q: "satin opera gloves" },
      { item: "Toy vintage microphone", q: "vintage microphone prop" },
    ],
  },
  {
    id: "botanist",
    name: "The Greenhouse Botanist",
    setting: "A country-house glasshouse, 1908",
    brief:
      "Grows the rarest plants in the county, including one that should not be in the house at all. Knows exactly how much of it is missing.",
    look: "A braided crown or a curtain fringe in copper, a rosy flush, a gold leaf earring and a straw sun hat.",
    variants: {
      female: { hairstyle: "female_halo_braid", label: "Halo braid" },
      male: { hairstyle: "male_curtain", label: "Curtain fringe" },
    },
    hairColor: { hex: "#A0461E", name: "copper", intensity: 75 },
    makeup: [blush("#D9827A", 40), lip("#B5655C", 45)],
    makeupNote: "rosy blush, muted rose lip",
    earrings: "earring-leaf",
    hat: { prop: "hat-straw", style: "style_bohemian" },
    shopping: [
      { item: "Straw sun hat with a ribbon band", layer: "hat", q: "straw sun hat ribbon band" },
      { item: "Small gold-tone leaf earrings", layer: "earrings", q: "gold leaf drop earrings" },
      { item: "Copper wash-out hair colour", layer: "hairColor", q: "temporary copper hair color" },
      { item: "Linen apron with pockets", q: "linen garden apron" },
      { item: "Gardening gloves", q: "leather gardening gloves" },
      { item: "Magnifying glass", q: "brass magnifying glass" },
    ],
  },
  {
    id: "station-master",
    name: "The Station Master",
    setting: "A snowbound mountain railway, 1951",
    brief:
      "Holds the timetable, the keys and the telegraph. The 9:15 never arrived, and the station master signed for it anyway.",
    look: "A neat side part or short centre part in coal-dark hair, and a navy peaked cap.",
    variants: {
      female: { hairstyle: "female_side_part_straight", label: "Side part" },
      male: { hairstyle: "male_center_parted_style", label: "Centre part" },
    },
    hairColor: { hex: "#2E2A28", name: "coal", intensity: 80 },
    makeup: null,
    earrings: null,
    hat: { prop: "hat-conductor", style: "style_urban_fashion" },
    shopping: [
      { item: "Navy peaked cap", layer: "hat", q: "navy conductor cap" },
      { item: "Navy double-breasted jacket", q: "navy double breasted jacket" },
      { item: "Pocket watch on a chain", q: "pocket watch chain" },
      { item: "Whistle", q: "metal whistle" },
      { item: "Ticket punch (a hole punch works)", q: "ticket punch" },
    ],
  },
];

export function layersFor(character) {
  return LAYER_ORDER.filter((k) => (k === "hairstyle" ? true : Boolean(character[k])));
}

export function unitsFor(layers) {
  return layers.reduce((s, k) => s + (UNITS[k] || 0), 0);
}

export function shoppingLinks(q) {
  const e = encodeURIComponent(q);
  return [
    { label: "Etsy", href: `https://www.etsy.com/search?q=${e}` },
    { label: "eBay", href: `https://www.ebay.com/sch/i.html?_nkw=${e}` },
    { label: "Google Shopping", href: `https://www.google.com/search?tbm=shop&q=${e}` },
  ];
}
