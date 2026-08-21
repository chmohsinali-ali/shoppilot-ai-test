// DB-backed half of the bilingual product dictionary — pure matching
// logic lives in productMatch.ts (kept dependency-free/testable); this
// file is the Supabase-touching counterpart used by both the AI
// Assistant's voice/text product resolution and the manual Products page,
// so both paths share one product dictionary per shop instead of two
// separate implementations.
import { supabase } from '@/lib/supabase';
import { matchProductAlias, normalizeAlias, type AliasRow } from '@/lib/productMatch';

export type CanonicalProduct = { id: string; nameEn: string; nameUr: string | null };

// Below this, a product-name identification is not trusted enough to
// act on silently — same threshold and rationale as the transaction-level
// LOW_CONFIDENCE_THRESHOLD in AssistantPage.tsx, applied here to each
// product's own name_confidence instead.
const PRODUCT_NAME_CONFIDENCE_THRESHOLD = 0.6;

export type RawProductLine = {
  name_en: string;
  name_ur: string;
  name_confidence: number;
  quantity: number;
  unit?: string;
  price: number;
  currency?: string;
  [key: string]: unknown; // carries through FMCG purchase-only fields untouched
};

export type ResolvedProductLine = RawProductLine & {
  productId: string;
  nameEn: string;
  nameUr: string;
};

export type ProductResolutionOutcome =
  | { kind: 'resolved'; lines: ResolvedProductLine[] }
  | {
      kind: 'needs-confirmation';
      resolvedSoFar: ResolvedProductLine[];
      pending: RawProductLine;
      remaining: RawProductLine[];
      confirmMode: 'confirm-new' | 'near-match';
      nearMatch?: CanonicalProduct;
    };

export async function fetchShopAliases(shopId: string): Promise<AliasRow[]> {
  const { data } = await supabase.from('product_aliases').select('alias, product_id').eq('shop_id', shopId);
  return ((data ?? []) as Array<{ alias: string; product_id: string }>).map((r) => ({ alias: r.alias, productId: r.product_id }));
}

export async function fetchCanonicalProduct(productId: string): Promise<CanonicalProduct | null> {
  const { data } = await supabase.from('products').select('id, name, urdu_name').eq('id', productId).maybeSingle();
  if (!data) return null;
  return { id: data.id, nameEn: data.name, nameUr: data.urdu_name };
}

// Best-effort alias registration — silently ignores the case where this
// exact alias text is already registered (for this product or, per the
// shop-wide unique index, technically only possible for this same
// product given how callers use it) since that just means there is
// nothing new to record.
export async function registerProductAlias(shopId: string, productId: string, alias: string): Promise<void> {
  const trimmed = alias.trim();
  if (!trimmed) return;
  const { error } = await supabase.from('product_aliases').insert({ shop_id: shopId, product_id: productId, alias: trimmed });
  if (error && error.code !== '23505') {
    // Non-duplicate errors are swallowed too — alias bookkeeping must
    // never block the actual sale/purchase/product-save it supports.
    console.warn('registerProductAlias failed:', error.message);
  }
}

export async function registerProductAliases(shopId: string, productId: string, aliases: string[]): Promise<void> {
  const unique = Array.from(new Set(aliases.map((a) => a.trim()).filter(Boolean)));
  await Promise.all(unique.map((alias) => registerProductAlias(shopId, productId, alias)));
}

// Creates a brand-new product record from a resolved bilingual name and
// immediately registers its own name(s) as aliases, so the very next time
// this product is mentioned (in any script/spelling close to what was
// just used) it resolves instead of creating a duplicate.
export async function createProduct(
  shopId: string, nameEn: string, nameUr: string, unit: string, extraAliases: string[] = []
): Promise<CanonicalProduct | null> {
  const { data, error } = await supabase
    .from('products')
    .insert({ shop_id: shopId, name: nameEn, urdu_name: nameUr || null, unit: unit || 'piece', status: 'active' })
    .select('id, name, urdu_name')
    .maybeSingle();
  if (error || !data) return null;
  await registerProductAliases(shopId, data.id, [nameEn, nameUr, ...extraAliases]);
  return { id: data.id, nameEn: data.name, nameUr: data.urdu_name };
}

// The ONE product-resolution engine shared by both SALE (customer) and
// PURCHASE (supplier) flows — per the requirement that customer and
// supplier behavior must be identical, this is not duplicated per side.
// Resolves each raw AI-parsed product line against the shop's own
// bilingual alias dictionary:
//   - exact alias match -> use the existing product silently.
//   - near (phonetic-variant) match with high name_confidence -> use the
//     existing product AND silently register the new phrasing as an
//     alias for next time (so "tamatar" spoken differently keeps getting
//     faster to resolve, never asking twice for the same drift).
//   - near match with low name_confidence, or no match at all -> pause
//     and ask the shopkeeper to confirm (new-product creation, or "did
//     you mean X") rather than guessing — mirrors the customer/supplier
//     duplicate-confirmation pattern in AssistantPage.tsx.
// Processes lines in order and stops at the FIRST one needing
// confirmation so the caller can resume later with resolvedSoFar/remaining.
export async function resolveProductLines(
  shopId: string,
  rawProducts: RawProductLine[],
  resolvedSoFar: ResolvedProductLine[] = []
): Promise<ProductResolutionOutcome> {
  const aliases = await fetchShopAliases(shopId);
  const acc = [...resolvedSoFar];
  const startIndex = resolvedSoFar.length;

  for (let i = startIndex; i < rawProducts.length; i++) {
    const p = rawProducts[i];
    const match = matchProductAlias(p.name_en, p.name_ur, aliases);

    if (match.kind === 'exact') {
      const canonical = await fetchCanonicalProduct(match.productId);
      acc.push({ ...p, productId: match.productId, nameEn: canonical?.nameEn ?? p.name_en, nameUr: canonical?.nameUr ?? p.name_ur });
      continue;
    }

    if (match.kind === 'near') {
      if ((p.name_confidence ?? 0) >= PRODUCT_NAME_CONFIDENCE_THRESHOLD) {
        const canonical = await fetchCanonicalProduct(match.productId);
        await registerProductAliases(shopId, match.productId, [p.name_en, p.name_ur]);
        acc.push({ ...p, productId: match.productId, nameEn: canonical?.nameEn ?? p.name_en, nameUr: canonical?.nameUr ?? p.name_ur });
        continue;
      }
      const canonical = await fetchCanonicalProduct(match.productId);
      return { kind: 'needs-confirmation', resolvedSoFar: acc, pending: p, remaining: rawProducts.slice(i + 1), confirmMode: 'near-match', nearMatch: canonical ?? undefined };
    }

    // No match anywhere in this shop's dictionary — a genuinely new product.
    if ((p.name_confidence ?? 0) >= PRODUCT_NAME_CONFIDENCE_THRESHOLD) {
      const created = await createProduct(shopId, p.name_en, p.name_ur, p.unit ?? 'piece');
      if (created) {
        acc.push({ ...p, productId: created.id, nameEn: created.nameEn, nameUr: created.nameUr ?? p.name_ur });
        continue;
      }
    }
    return { kind: 'needs-confirmation', resolvedSoFar: acc, pending: p, remaining: rawProducts.slice(i + 1), confirmMode: 'confirm-new' };
  }

  return { kind: 'resolved', lines: acc };
}

export { normalizeAlias };
