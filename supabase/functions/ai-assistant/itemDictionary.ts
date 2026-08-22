// Item Master Dictionaries — backend-only spelling/recognition reference for
// products the AI extracts on a SALE or PURCHASE. Two separate source
// datasets, kept apart because they come from separate reference sheets and
// serve different item ranges:
//   - vegetableItemDictionary.json: fruits & vegetables (from the shopkeeper's
//     "Fruits & Vegetables" sheet)
//   - groceryItemDictionary.json: kiryana/grocery inventory, including
//     branded products and generic pack/form vocabulary (from the
//     shopkeeper's "Master Inventory" sheet)
// Both are stored verbatim/unmodified and are NEVER a customer, supplier, or
// shop-inventory record — they exist only so the AI can recognize an item
// and normalize its English/Urdu spelling. They are not exhaustive: an item
// not found here is left exactly as the AI already extracted it, never
// rejected. This is completely separate from the Master Name Dictionary
// (nameDictionary.ts) — items are matched as whole phrases, never split into
// tokens the way person names are (a product has no "first/last" concept).

import vegetableRows from "./vegetableItemDictionary.json" with { type: "json" };
import groceryRows from "./groceryItemDictionary.json" with { type: "json" };

type ItemRow = { category: string; en: string; ur: string; aliases: string };

type ItemEntry = {
  en: string;
  ur: string;
  category: string;
  aliases: string[];
  source: "vegetable" | "grocery";
};

let vegEntries: ItemEntry[] | null = null;
let groEntries: ItemEntry[] | null = null;

function buildEntries(rows: ItemRow[], source: "vegetable" | "grocery"): ItemEntry[] {
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

function getVegEntries(): ItemEntry[] {
  if (!vegEntries) vegEntries = buildEntries(vegetableRows as ItemRow[], "vegetable");
  return vegEntries;
}

function getGroEntries(): ItemEntry[] {
  if (!groEntries) groEntries = buildEntries(groceryRows as ItemRow[], "grocery");
  return groEntries;
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
  const distance = levenshteinDistance(s, t);
  if (distance === 0 || distance > 2) return false;
  const maxLen = Math.max(s.length, t.length);
  return distance / maxLen <= 0.34;
}

/**
 * Matches a full item phrase (never split into words — an item has no
 * first/last-name concept) against one dictionary's entries: exact match
 * (English, case-insensitive; Urdu script; or any alias) first, then a
 * close spelling variant within the same tolerance used elsewhere in the
 * app. Returns null when nothing is a confident match.
 */
function matchInEntries(raw: string, entries: ItemEntry[]): ItemEntry | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const cleanedLower = cleaned.toLowerCase();
  const cleanedNorm = cleaned.normalize("NFC");

  for (const e of entries) {
    if (e.en.toLowerCase() === cleanedLower) return e;
    if (e.ur.normalize("NFC") === cleanedNorm) return e;
    for (const a of e.aliases) {
      if (a.toLowerCase() === cleanedLower) return e;
    }
  }

  let best: ItemEntry | null = null;
  let bestDist = Infinity;
  for (const e of entries) {
    const candidates = [e.en, ...e.aliases];
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

export type ItemMatch = { name_en: string; name_ur: string; category: string; source: "vegetable" | "grocery" };

/**
 * Looks up a product name (as already extracted/translated by the AI)
 * against both item dictionaries and returns the canonical English/Urdu
 * spelling if a confident match exists. Checks the vegetable sheet first,
 * then the grocery sheet — the two datasets are never merged into one file,
 * but a single product only needs to belong to one of them. Returns null
 * (leave the AI's own value untouched) when nothing matches in either —
 * these sheets are a reference, not an exhaustive allowlist.
 */
export function correctItemName(raw: string): ItemMatch | null {
  const veg = matchInEntries(raw, getVegEntries());
  if (veg) return { name_en: veg.en, name_ur: veg.ur, category: veg.category, source: veg.source };
  const gro = matchInEntries(raw, getGroEntries());
  if (gro) return { name_en: gro.en, name_ur: gro.ur, category: gro.category, source: gro.source };
  return null;
}
