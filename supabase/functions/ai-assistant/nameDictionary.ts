// Master Name Dictionary — backend-only spelling reference for Muslim /
// Pakistani names, used ONLY to correct STT/spelling variants in a
// customer or supplier name the AI has already extracted. This is NEVER a
// source of customer/supplier records: it never creates accounts, is never
// returned to the frontend, and is never merged with a shop's own
// customers/suppliers tables. It also is not exhaustive — a name not found
// here is left exactly as given, never rejected or flagged invalid.
//
// masterNameDictionary.json is the source sheet, stored verbatim/unmodified
// (4994 rows of {en_full, en_first, en_last, ur_full, ur_first, ur_last} —
// originally every First Name x Last Name combination from the source
// data). A name token can appear in either the first-name or last-name
// position across different real people (e.g. "Ali" is a first name in one
// row and a last name in another), so matching here is done per TOKEN, not
// per full name: the first-name and last-name columns are collapsed into
// one deduplicated token list in memory before any lookup — the JSON file
// on disk is only ever read, never rewritten.

import rawRows from "./masterNameDictionary.json" with { type: "json" };

type NameRow = {
  en_full: string;
  en_first: string;
  en_last: string;
  ur_full: string;
  ur_first: string;
  ur_last: string;
};

type NameToken = { en: string; ur: string };

let tokensCache: NameToken[] | null = null;

function loadTokens(): NameToken[] {
  if (!tokensCache) {
    const rows = rawRows as NameRow[];
    const seen = new Set<string>();
    const list: NameToken[] = [];
    for (const r of rows) {
      if (r.en_first && !seen.has(r.en_first.toLowerCase())) {
        seen.add(r.en_first.toLowerCase());
        list.push({ en: r.en_first, ur: r.ur_first });
      }
      if (r.en_last && !seen.has(r.en_last.toLowerCase())) {
        seen.add(r.en_last.toLowerCase());
        list.push({ en: r.en_last, ur: r.ur_last });
      }
    }
    tokensCache = list;
  }
  return tokensCache;
}

// Same algorithm as src/lib/nameMatch.ts (kept as a local copy since edge
// functions deploy as a standalone bundle and can't import from src/).
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
 * Looks up a single name token (one word) against the dictionary — exact
 * match (English, case-insensitive, or Urdu script) first, then a close
 * spelling variant (STT/typo noise) within the same tolerance used
 * elsewhere in the app for name matching. Returns null (leave the token
 * untouched) when nothing in the dictionary is a confident match — an
 * unmatched name is normal and expected, not an error.
 */
export function correctNameToken(rawToken: string): NameToken | null {
  const cleaned = rawToken.trim();
  if (!cleaned) return null;
  const list = loadTokens();
  const cleanedNorm = cleaned.normalize("NFC");

  for (const t of list) {
    if (t.en.toLowerCase() === cleaned.toLowerCase() || t.ur.normalize("NFC") === cleanedNorm) return t;
  }

  let best: NameToken | null = null;
  let bestDist = Infinity;
  for (const t of list) {
    if (isNearMatch(t.en, cleaned)) {
      const d = levenshteinDistance(t.en, cleaned);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
  }
  return best;
}

/**
 * Corrects every whitespace-separated word of a full customer/supplier
 * name independently (position-independent — a token matches whether the
 * dictionary has it recorded as a first name or a last name), rebuilding
 * the name with the dictionary's canonical English spelling wherever a
 * confident match was found. Any word with no match is kept exactly as
 * given.
 */
export function correctFullName(rawName: string): string {
  const parts = rawName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return rawName;
  return parts.map((p) => correctNameToken(p)?.en ?? p).join(" ");
}
