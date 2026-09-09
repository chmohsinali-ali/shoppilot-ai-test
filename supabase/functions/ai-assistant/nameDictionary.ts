// Master Name Dictionary — backend-only spelling reference for Muslim /
// Pakistani names, used ONLY to correct STT/spelling variants in a
// customer or supplier name the AI has already extracted. This is NEVER a
// source of customer/supplier records: it never creates accounts, is never
// returned to the frontend, and is never merged with a shop's own
// customers/suppliers tables. It also is not exhaustive — a name not found
// here is left exactly as given, never rejected or flagged invalid.
//
// nameTokens.json (~460 deduped {en, ur} entries) is a generated slice of
// the full ~30,000-full-name reference sheet (source kept at
// scripts/data/nameDictionarySource.json, NOT under supabase/functions/ —
// that full sheet is ~4.5MB and pushed a function deploy over Supabase's
// payload limit; the only thing this file's logic ever needed from it was
// the deduped list of individual first/last name tokens, which is what
// nameTokens.json already is). Matching here is done per TOKEN, not per
// full name, since a token can appear in either the first-name or
// last-name position across different real people (e.g. "Ali" is a first
// name for one person and a last name for another). Regenerate this file
// from the source sheet if more names are ever added there.

import rawTokens from "./nameTokens.json" with { type: "json" };

type NameToken = { en: string; ur: string };

function loadTokens(): NameToken[] {
  return rawTokens as NameToken[];
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
    // Never let a near-match SHRINK the spoken name — a longer name that
    // happens to end the same way a shorter token starts (e.g. "Nasira" vs
    // "Nasir") is very likely a different, unlisted name, not a
    // misspelling — cutting it down would silently change who the
    // transaction is for. Growing or same-length corrections
    // (Muhsin->Mohsin, Salim->Saleem) stay safe.
    if (t.en.length < cleaned.length) continue;
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
