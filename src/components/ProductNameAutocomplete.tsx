import { useEffect, useRef, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { registerProductAliases } from '@/lib/productDictionary';
import type { Product } from '@/types/db';

type RefEntry = { category: string; en: string; ur: string; aliases: string[] };

// A brand-new shop's own product catalog starts empty, so catalog-only
// matching (like the existing "Search products to add" box) gives zero
// suggestions on day one — useful only once a shopkeeper has spent real
// time typing in hundreds of items, which small shops rarely do (unlike
// a "mart" with dedicated data-entry staff). This reference list — the
// SAME 7,549-item bilingual item dictionary (71 shop-type sheets,
// Urdu script + Roman-Urdu/English aliases) already used server-side by
// the AI Assistant for voice/text product recognition, just consolidated
// into one frontend-friendly file — exists purely to make suggestions
// useful from day one; it is NEVER an actual product, never sold or
// shown as one, and (like the customer name directory) can never cover
// every real item — a typed name with no match just stays as typed,
// same as today.
let cachedRef: RefEntry[] | null = null;
let loadingPromise: Promise<RefEntry[]> | null = null;
function loadRefData(): Promise<RefEntry[]> {
  if (cachedRef) return Promise.resolve(cachedRef);
  if (!loadingPromise) {
    loadingPromise = import('@/data/productDirectory.json').then((mod) => {
      cachedRef = mod.default as RefEntry[];
      return cachedRef;
    });
  }
  return loadingPromise;
}

const MAX_SUGGESTIONS = 8;
const URDU_SCRIPT = /[؀-ۿ]/;

type CatalogSuggestion = { kind: 'catalog'; product: Product; label: string };
type RefSuggestion = { kind: 'reference'; entry: RefEntry; label: string };
type Suggestion = CatalogSuggestion | RefSuggestion;

// Returns both a rank (lower = better — an exact alias hit like "cheeni"
// on White Sugar's "cheeni, chini, sugar" alias list must outrank a mere
// substring hit inside an unrelated word, e.g. "cheeni" also
// substring-matches "Dar Cheeni"/Cinnamon) AND which specific spelling
// matched — picking a suggestion preserves THAT spelling as the
// product's name for this transaction (the "original input" the
// shopkeeper actually searched by, e.g. "Chini" stays "Chini" instead of
// being forced to the dictionary's canonical "White Sugar") rather than
// always normalizing to the English canonical form. Falls back to the
// canonical English form when the closest match was the Urdu-script name
// itself or an Urdu-script alias — product_name always renders as plain
// LTR text elsewhere in the app, so it must never end up holding Urdu
// script (that already has its own dedicated, RTL-rendered field).
function refMatch(entry: RefEntry, q: string): { score: number; label: string } | null {
  const en = entry.en.toLowerCase();
  const latinAliases = entry.aliases.filter((a) => !URDU_SCRIPT.test(a));
  if (en === q) return { score: 0, label: entry.en };
  const exactAlias = latinAliases.find((a) => a.toLowerCase() === q);
  if (exactAlias) return { score: 0, label: exactAlias };
  if (en.startsWith(q)) return { score: 1, label: entry.en };
  const startAlias = latinAliases.find((a) => a.toLowerCase().startsWith(q));
  if (startAlias) return { score: 1, label: startAlias };
  if (en.includes(q)) return { score: 2, label: entry.en };
  const containsAlias = latinAliases.find((a) => a.toLowerCase().includes(q));
  if (containsAlias) return { score: 3, label: containsAlias };
  if (entry.ur.includes(q) || entry.aliases.some((a) => a.includes(q))) return { score: 3, label: entry.en };
  return null;
}

function productMatch(p: Product, q: string): { score: number; label: string } | null {
  const name = p.name.toLowerCase();
  if (name === q) return { score: 0, label: p.name };
  if (name.startsWith(q)) return { score: 1, label: p.name };
  if (name.includes(q)) return { score: 2, label: p.name };
  if ((p.urdu_name ?? '').includes(q)) return { score: 3, label: p.name };
  return null;
}

export function ProductNameAutocomplete({
  value, onChange, products, shopId, currency, onPickCatalog, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  products: Product[];
  shopId: string;
  currency?: string;
  /** Fires for both an existing catalog product AND a reference-dictionary
   *  pick — a reference pick is created as a real product (with its own
   *  product_id) the moment it's selected, since an explicit click on one
   *  specific suggestion already IS the shopkeeper's confirmation of
   *  which product they mean (the same bar the AI Assistant's own
   *  resolveProductLines() uses to auto-create silently). `label` is the
   *  specific spelling that matched what was typed — use it as
   *  product_name so the transaction keeps the shopkeeper's own wording
   *  instead of a normalized/forced name. */
  onPickCatalog: (p: Product, label: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refData, setRefData] = useState<RefEntry[] | null>(cachedRef);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadRefData().then((d) => { if (!cancelled) setRefData(d); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const q = value.trim().toLowerCase();
  let suggestions: Suggestion[] = [];
  if (q.length >= 2) {
    const catalogMatches = products
      .map((p) => ({ p, m: productMatch(p, q) }))
      .filter((x): x is { p: Product; m: { score: number; label: string } } => x.m !== null)
      .sort((a, b) => a.m.score - b.m.score || a.p.name.length - b.p.name.length)
      .slice(0, 5);
    suggestions = catalogMatches.map((x): Suggestion => ({ kind: 'catalog', product: x.p, label: x.m.label }));

    const catalogNames = new Set(catalogMatches.map((x) => x.p.name.toLowerCase()));
    if (refData && suggestions.length < MAX_SUGGESTIONS) {
      const matches = refData
        .filter((r) => !catalogNames.has(r.en.toLowerCase()))
        .map((entry) => ({ entry, m: refMatch(entry, q) }))
        .filter((x): x is { entry: RefEntry; m: { score: number; label: string } } => x.m !== null)
        .sort((a, b) => a.m.score - b.m.score || a.entry.en.length - b.entry.en.length)
        .slice(0, MAX_SUGGESTIONS - suggestions.length);
      suggestions = suggestions.concat(matches.map((x): Suggestion => ({ kind: 'reference', entry: x.entry, label: x.m.label })));
    }
  }

  const handleSelect = async (s: Suggestion) => {
    if (s.kind === 'catalog') {
      onPickCatalog(s.product, s.label);
      setOpen(false);
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from('products')
      .insert({ shop_id: shopId, name: s.entry.en, urdu_name: s.entry.ur || null, unit: 'piece', status: 'active' })
      .select('*')
      .maybeSingle();
    setCreating(false);
    setOpen(false);
    if (error || !data) {
      // Creation failing (rare — network/RLS) must never block the
      // shopkeeper from finishing this line; fall back to a plain
      // unlinked line item, same as free typing has always allowed.
      onChange(s.label);
      return;
    }
    const product = data as Product;
    void registerProductAliases(shopId, product.id, [s.entry.en, s.entry.ur, ...s.entry.aliases]);
    onPickCatalog(product, s.label);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={creating ? 'Adding product…' : (placeholder ?? 'Product name')}
        value={value}
        disabled={creating}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full min-w-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s) => (
            <button
              key={s.kind === 'catalog' ? `c-${s.product.id}` : `r-${s.entry.category}-${s.entry.en}`}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {s.kind === 'catalog' ? (
                <>
                  <Package className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">{s.product.name}</p>
                      {s.product.urdu_name && <p dir="rtl" lang="ur" className="flex-shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">{s.product.urdu_name}</p>}
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatMoney(Number(s.product.sale_price), currency)} · {s.product.stock} {s.product.unit}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{s.entry.en}</p>
                      {s.entry.ur && <p dir="rtl" lang="ur" className="flex-shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">{s.entry.ur}</p>}
                    </div>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">{s.entry.category} · not in your inventory yet</p>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
