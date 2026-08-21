// Pure product-alias matching helpers used by the AI Assistant's product
// resolution flow (bilingual Urdu/English product dictionary + voice
// aliases). Mirrors nameMatch.ts's approach for customer/supplier names —
// no DB/network calls here, intentionally testable in isolation.
import { isNearMatch, levenshteinDistance } from '@/lib/nameMatch';

export function normalizeAlias(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type AliasRow = { alias: string; productId: string };

export type ProductAliasMatch =
  | { kind: 'exact'; productId: string }
  | { kind: 'near'; productId: string; matchedAlias: string; distance: number }
  | { kind: 'none' };

// Looks up a spoken/typed product phrase against a shop's known aliases.
// Checks BOTH the English and Urdu name the AI returned, since either one
// might match an alias registered from a previous, differently-phrased
// voice command for the same product.
export function matchProductAlias(nameEn: string, nameUr: string, aliases: AliasRow[]): ProductAliasMatch {
  const candidates = [normalizeAlias(nameEn), normalizeAlias(nameUr)].filter(Boolean);
  if (candidates.length === 0 || aliases.length === 0) return { kind: 'none' };

  for (const row of aliases) {
    const normalized = normalizeAlias(row.alias);
    if (candidates.includes(normalized)) return { kind: 'exact', productId: row.productId };
  }

  let best: { productId: string; matchedAlias: string; distance: number } | null = null;
  for (const row of aliases) {
    for (const candidate of candidates) {
      if (!isNearMatch(candidate, row.alias)) continue;
      const distance = levenshteinDistance(candidate, row.alias);
      if (!best || distance < best.distance) {
        best = { productId: row.productId, matchedAlias: row.alias, distance };
      }
    }
  }
  if (best) return { kind: 'near', productId: best.productId, matchedAlias: best.matchedAlias, distance: best.distance };
  return { kind: 'none' };
}
