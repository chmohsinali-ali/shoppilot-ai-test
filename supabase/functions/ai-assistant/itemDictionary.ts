// Item Master Dictionaries — backend-only spelling/recognition reference for
// products the AI extracts on a SALE or PURCHASE. Each industry's items come
// from its own separate reference sheet and are kept in their own file/
// dictionary (never merged) — a shopkeeper's shop type doesn't change which
// dictionaries are checked, but keeping them separate matches how the source
// data was actually organized and supplied:
//   - vegetableItemDictionary.json: fruits & vegetables
//   - groceryItemDictionary.json: kiryana/grocery, incl. branded products
//   - mobileItemDictionary.json: mobile phones & accessories
//   - computerItemDictionary.json: computer/IT hardware
//   - electronicsItemDictionary.json: home electronics/appliances
//   - solarItemDictionary.json: solar/UPS/battery equipment
//   - cctvItemDictionary.json: CCTV/networking equipment
// All are stored verbatim/unmodified and are NEVER a customer, supplier, or
// shop-inventory record — they exist only so the AI can recognize an item and
// normalize its English/Urdu spelling. They are not exhaustive: an item not
// found here is left exactly as the AI already extracted it, never rejected.
// This is completely separate from the Master Name Dictionary
// (nameDictionary.ts) — items are matched as whole phrases, never split into
// tokens the way person names are (a product has no "first/last" concept).

import vegetableRows from "./vegetableItemDictionary.json" with { type: "json" };
import groceryRows from "./groceryItemDictionary.json" with { type: "json" };
import mobileRows from "./mobileItemDictionary.json" with { type: "json" };
import computerRows from "./computerItemDictionary.json" with { type: "json" };
import electronicsRows from "./electronicsItemDictionary.json" with { type: "json" };
import solarRows from "./solarItemDictionary.json" with { type: "json" };
import cctvRows from "./cctvItemDictionary.json" with { type: "json" };
import electricalRows from "./electricalItemDictionary.json" with { type: "json" };
import hardwareRows from "./hardwareItemDictionary.json" with { type: "json" };
import plumbingRows from "./plumbingItemDictionary.json" with { type: "json" };
import motorcycleRows from "./motorcycleItemDictionary.json" with { type: "json" };
import autoPartsRows from "./autoPartsItemDictionary.json" with { type: "json" };
import bicycleRows from "./bicycleItemDictionary.json" with { type: "json" };
import industrialRows from "./industrialItemDictionary.json" with { type: "json" };
import agricultureRows from "./agricultureItemDictionary.json" with { type: "json" };
import kitchenwareRows from "./kitchenwareItemDictionary.json" with { type: "json" };
import stationeryRows from "./stationeryItemDictionary.json" with { type: "json" };
import clothingRows from "./clothingItemDictionary.json" with { type: "json" };
import footwearRows from "./footwearItemDictionary.json" with { type: "json" };
import cosmeticsRows from "./cosmeticsItemDictionary.json" with { type: "json" };
import foodSpecialtyRows from "./foodSpecialtyItemDictionary.json" with { type: "json" };
import pansariRows from "./pansariItemDictionary.json" with { type: "json" };
import medicalRows from "./medicalItemDictionary.json" with { type: "json" };
import sportsToysRows from "./sportsToysItemDictionary.json" with { type: "json" };
import petShopRows from "./petShopItemDictionary.json" with { type: "json" };
import packagingRows from "./packagingItemDictionary.json" with { type: "json" };
import gasApplianceRows from "./gasApplianceItemDictionary.json" with { type: "json" };
import acRefrigerationRows from "./acRefrigerationItemDictionary.json" with { type: "json" };
import waterFilterRows from "./waterFilterItemDictionary.json" with { type: "json" };
import fireSafetyRows from "./fireSafetyItemDictionary.json" with { type: "json" };
import locksRows from "./locksItemDictionary.json" with { type: "json" };
import furnitureRows from "./furnitureItemDictionary.json" with { type: "json" };
import tyreTubeRows from "./tyreTubeItemDictionary.json" with { type: "json" };
import autoAccessoriesRows from "./autoAccessoriesItemDictionary.json" with { type: "json" };
import rickshawRows from "./rickshawItemDictionary.json" with { type: "json" };
import jewelleryRows from "./jewelleryItemDictionary.json" with { type: "json" };
import opticalRows from "./opticalItemDictionary.json" with { type: "json" };
import babyShopRows from "./babyShopItemDictionary.json" with { type: "json" };
import bakeryRows from "./bakeryItemDictionary.json" with { type: "json" };
import dairyShopRows from "./dairyShopItemDictionary.json" with { type: "json" };
import meatShopRows from "./meatShopItemDictionary.json" with { type: "json" };
import seafoodRows from "./seafoodItemDictionary.json" with { type: "json" };
import dryFruitRows from "./dryFruitItemDictionary.json" with { type: "json" };
import audioShopRows from "./audioShopItemDictionary.json" with { type: "json" };
import lightingRows from "./lightingItemDictionary.json" with { type: "json" };
import motorWindingRows from "./motorWindingItemDictionary.json" with { type: "json" };
import roofingRows from "./roofingItemDictionary.json" with { type: "json" };
import doorsWindowsRows from "./doorsWindowsItemDictionary.json" with { type: "json" };
import sanitaryWareRows from "./sanitaryWareItemDictionary.json" with { type: "json" };
import tilesRows from "./tilesItemDictionary.json" with { type: "json" };
import cleaningSuppliesRows from "./cleaningSuppliesItemDictionary.json" with { type: "json" };
import tractorMachineryRows from "./tractorMachineryItemDictionary.json" with { type: "json" };
import generatorMotorRows from "./generatorMotorItemDictionary.json" with { type: "json" };
import pumpMachineryRows from "./pumpMachineryItemDictionary.json" with { type: "json" };
import upsBatteryRows from "./upsBatteryItemDictionary.json" with { type: "json" };
import timberRows from "./timberItemDictionary.json" with { type: "json" };
import paintRows from "./paintItemDictionary.json" with { type: "json" };
import agriInputRows from "./agriInputItemDictionary.json" with { type: "json" };
import bearingsRows from "./bearingsItemDictionary.json" with { type: "json" };
import kitchenwareCrockeryRows from "./kitchenwareCrockeryItemDictionary.json" with { type: "json" };
import homeHouseholdRows from "./homeHouseholdItemDictionary.json" with { type: "json" };

type ItemRow = { category: string; en: string; ur: string; aliases: string };

type ItemEntry = {
  en: string;
  ur: string;
  category: string;
  aliases: string[];
  source: string;
};

// Checked in this order when looking for a match. Adding another industry
// later is just one more entry here — nothing else needs to change.
const DICTIONARIES: { source: string; rows: ItemRow[] }[] = [
  { source: "vegetable", rows: vegetableRows as ItemRow[] },
  { source: "grocery", rows: groceryRows as ItemRow[] },
  { source: "mobile", rows: mobileRows as ItemRow[] },
  { source: "computer", rows: computerRows as ItemRow[] },
  { source: "electronics", rows: electronicsRows as ItemRow[] },
  { source: "solar", rows: solarRows as ItemRow[] },
  { source: "cctv", rows: cctvRows as ItemRow[] },
  { source: "electrical", rows: electricalRows as ItemRow[] },
  { source: "hardware", rows: hardwareRows as ItemRow[] },
  { source: "plumbing", rows: plumbingRows as ItemRow[] },
  { source: "motorcycle", rows: motorcycleRows as ItemRow[] },
  { source: "auto-parts", rows: autoPartsRows as ItemRow[] },
  { source: "bicycle", rows: bicycleRows as ItemRow[] },
  { source: "industrial", rows: industrialRows as ItemRow[] },
  { source: "agriculture", rows: agricultureRows as ItemRow[] },
  { source: "kitchenware", rows: kitchenwareRows as ItemRow[] },
  { source: "stationery", rows: stationeryRows as ItemRow[] },
  { source: "clothing", rows: clothingRows as ItemRow[] },
  { source: "footwear", rows: footwearRows as ItemRow[] },
  { source: "cosmetics", rows: cosmeticsRows as ItemRow[] },
  { source: "food-specialty", rows: foodSpecialtyRows as ItemRow[] },
  { source: "pansari", rows: pansariRows as ItemRow[] },
  { source: "medical", rows: medicalRows as ItemRow[] },
  { source: "sports-toys", rows: sportsToysRows as ItemRow[] },
  { source: "pet-shop", rows: petShopRows as ItemRow[] },
  { source: "packaging", rows: packagingRows as ItemRow[] },
  { source: "gas-appliance", rows: gasApplianceRows as ItemRow[] },
  { source: "ac-refrigeration", rows: acRefrigerationRows as ItemRow[] },
  { source: "water-filter", rows: waterFilterRows as ItemRow[] },
  { source: "fire-safety", rows: fireSafetyRows as ItemRow[] },
  { source: "locks", rows: locksRows as ItemRow[] },
  { source: "furniture", rows: furnitureRows as ItemRow[] },
  { source: "tyre-tube", rows: tyreTubeRows as ItemRow[] },
  { source: "auto-accessories", rows: autoAccessoriesRows as ItemRow[] },
  { source: "rickshaw", rows: rickshawRows as ItemRow[] },
  { source: "jewellery", rows: jewelleryRows as ItemRow[] },
  { source: "optical", rows: opticalRows as ItemRow[] },
  { source: "baby-shop", rows: babyShopRows as ItemRow[] },
  { source: "bakery", rows: bakeryRows as ItemRow[] },
  { source: "dairy-shop", rows: dairyShopRows as ItemRow[] },
  { source: "meat-shop", rows: meatShopRows as ItemRow[] },
  { source: "seafood", rows: seafoodRows as ItemRow[] },
  { source: "dry-fruit", rows: dryFruitRows as ItemRow[] },
  { source: "audio-shop", rows: audioShopRows as ItemRow[] },
  { source: "lighting", rows: lightingRows as ItemRow[] },
  { source: "motor-winding", rows: motorWindingRows as ItemRow[] },
  { source: "roofing", rows: roofingRows as ItemRow[] },
  { source: "doors-windows", rows: doorsWindowsRows as ItemRow[] },
  { source: "sanitary-ware", rows: sanitaryWareRows as ItemRow[] },
  { source: "tiles", rows: tilesRows as ItemRow[] },
  { source: "cleaning-supplies", rows: cleaningSuppliesRows as ItemRow[] },
  { source: "tractor-machinery", rows: tractorMachineryRows as ItemRow[] },
  { source: "generator-motor", rows: generatorMotorRows as ItemRow[] },
  { source: "pump-machinery", rows: pumpMachineryRows as ItemRow[] },
  { source: "ups-battery", rows: upsBatteryRows as ItemRow[] },
  { source: "timber", rows: timberRows as ItemRow[] },
  { source: "paint", rows: paintRows as ItemRow[] },
  { source: "agri-input", rows: agriInputRows as ItemRow[] },
  { source: "bearings", rows: bearingsRows as ItemRow[] },
  { source: "kitchenware-crockery", rows: kitchenwareCrockeryRows as ItemRow[] },
  { source: "home-household", rows: homeHouseholdRows as ItemRow[] },
];

let cachedEntries: ItemEntry[][] | null = null; // parallel to DICTIONARIES
let cachedAmbiguousTerms: Set<string> | null = null;

function buildEntries(rows: ItemRow[], source: string): ItemEntry[] {
  const list: ItemEntry[] = [];
  for (const r of rows) {
    if (!r.en) continue; // skip stray blank rows
    list.push({
      en: r.en,
      ur: r.ur,
      category: r.category,
      aliases: (r.aliases || "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      source,
    });
  }
  return list;
}

function getAllEntries(): ItemEntry[][] {
  if (!cachedEntries) {
    cachedEntries = DICTIONARIES.map((d) => buildEntries(d.rows, d.source));
  }
  return cachedEntries;
}

// A term (English name or alias) that names more than one DISTINCT item can
// never be confidently resolved to just one of them — whether that
// collision is WITHIN one dictionary (e.g. every "Rice - X Pack" row in the
// grocery sheet also lists bare "چاول" as an alias) or ACROSS two different
// industry dictionaries (e.g. "camera" meaning both a mobile spare part and
// a CCTV camera, "battery" meaning both a phone battery and a solar
// battery — both real collisions found when the mobile/computer/
// electronics/solar/cctv dictionaries were added). Computed once across ALL
// dictionaries combined, not per-dictionary, so a cross-industry collision
// is caught the same way an in-dictionary one already was.
function getAmbiguousTerms(): Set<string> {
  if (cachedAmbiguousTerms) return cachedAmbiguousTerms;
  const counts = new Map<string, number>();
  for (const entries of getAllEntries()) {
    for (const e of entries) {
      const keys = new Set([e.en.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())]);
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  cachedAmbiguousTerms = new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  return cachedAmbiguousTerms;
}

// Same algorithm as nameDictionary.ts / src/lib/nameMatch.ts (kept as a
// local copy since edge functions deploy as a standalone bundle).
function levenshteinDistance(a: string, b: string): number {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j];
  }
  return prev[t.length];
}

function isNearMatch(a: string, b: string): boolean {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (!s || !t || s === t) return false;
  // Two different real, unrelated English words can sit surprisingly close
  // in edit distance — e.g. "bread" vs the "thread" alias in Household
  // sewing supplies (2 edits, "b" -> "th") slipped through the original
  // 0.34 ratio threshold and returned "Thread" for a shopkeeper who said
  // "bread". Unlike a genuine STT/spelling variant of the SAME word (where
  // one edit in a longer word is normal noise), a collision between two
  // different dictionary words is exactly the failure mode this dictionary
  // must never produce, so both the minimum length and the ratio are kept
  // tight — a missed near-match just leaves the model's own (usually
  // correct) guess untouched, which is far safer than a wrong swap.
  if (Math.min(s.length, t.length) < 6) return false;
  const distance = levenshteinDistance(s, t);
  if (distance === 0 || distance > 2) return false;
  const maxLen = Math.max(s.length, t.length);
  if (distance / maxLen > 0.2) return false;

  // Same failure mode as bread/thread, but across a shared multi-word
  // suffix instead of the whole string: "gas regulator" vs "Fan Regulator"
  // (found live testing) is only 2 edits apart overall — well inside the
  // ratio above — yet is a completely different product (gas-stove part
  // vs ceiling-fan part) whose FIRST word was substituted wholesale, not
  // typo'd. A shared trailing noun ("regulator", "filter", "pump", ...)
  // with an entirely different leading modifier word is a different item,
  // not a spelling variant, so when both sides are multi-word, the
  // leading words must themselves be a close variant of each other (not
  // just the phrase as a whole).
  const sWords = s.split(/\s+/);
  const tWords = t.split(/\s+/);
  if (sWords.length > 1 && tWords.length > 1 && sWords[0] !== tWords[0]) {
    const firstWordMaxLen = Math.max(sWords[0].length, tWords[0].length);
    const firstWordDist = levenshteinDistance(sWords[0], tWords[0]);
    if (firstWordMaxLen === 0 || firstWordDist / firstWordMaxLen > 0.34) return false;
  }
  return true;
}

/**
 * Matches a full item phrase (never split into words — an item has no
 * first/last-name concept) against one dictionary's entries: exact match
 * (English, case-insensitive; Urdu script; or any non-ambiguous alias)
 * first, then a close spelling variant within the same tolerance used
 * elsewhere in the app. Returns null when nothing is a confident match.
 */
function matchInEntries(raw: string, entries: ItemEntry[], ambiguous: Set<string>): ItemEntry | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const cleanedLower = cleaned.toLowerCase();
  const cleanedNorm = cleaned.normalize("NFC");

  for (const e of entries) {
    if (e.en.toLowerCase() === cleanedLower && !ambiguous.has(cleanedLower)) return e;
    if (e.ur.normalize("NFC") === cleanedNorm) return e;
    for (const a of e.aliases) {
      if (a.toLowerCase() === cleanedLower && !ambiguous.has(a.toLowerCase())) return e;
    }
  }

  let best: ItemEntry | null = null;
  let bestDist = Infinity;
  for (const e of entries) {
    const candidates = [e.en, ...e.aliases].filter((c) => !ambiguous.has(c.toLowerCase()));
    for (const c of candidates) {
      if (isNearMatch(c, cleaned)) {
        const d = levenshteinDistance(c, cleaned);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
    }
  }
  return best;
}

export type ItemMatch = { name_en: string; name_ur: string; category: string; source: string };

/**
 * Looks up a product name (as already extracted/translated by the AI)
 * against every item dictionary, in priority order, and returns the
 * canonical English/Urdu spelling for the first confident match. Returns
 * null (leave the AI's own value untouched) when nothing matches
 * confidently anywhere — these sheets are a reference, not an exhaustive
 * allowlist, and a term that's ambiguous across dictionaries is treated the
 * same as no match at all rather than guessed.
 */
export function correctItemName(raw: string): ItemMatch | null {
  const ambiguous = getAmbiguousTerms();
  const allEntries = getAllEntries();
  for (const entries of allEntries) {
    const match = matchInEntries(raw, entries, ambiguous);
    if (match) return { name_en: match.en, name_ur: match.ur, category: match.category, source: match.source };
  }
  return null;
}
