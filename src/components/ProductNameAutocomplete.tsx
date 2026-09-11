import { useEffect, useRef, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { formatMoney, bilingualName } from '@/lib/format';
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

type CatalogSuggestion = { kind: 'catalog'; product: Product };
type RefSuggestion = { kind: 'reference'; entry: RefEntry };
type Suggestion = CatalogSuggestion | RefSuggestion;

// Lower is better. An exact alias hit ("cheeni" -> White Sugar, whose
// alias list is literally "cheeni, chini, sugar") must outrank a mere
// substring hit inside an unrelated longer word (e.g. "cheeni" also
// substring-matches "Dar Cheeni" / Cinnamon) — plain .filter().slice()
// left the right answer buried under noise since the 7,549-item
// dictionary was built for voice-command matching, not ranked typing
// suggestions.
function refScore(entry: RefEntry, q: string): number {
  const en = entry.en.toLowerCase();
  if (en === q) return 0;
  if (entry.aliases.some((a) => a.toLowerCase() === q)) return 0;
  if (en.startsWith(q)) return 1;
  if (entry.aliases.some((a) => a.toLowerCase().startsWith(q))) return 1;
  if (en.includes(q)) return 2;
  if (entry.aliases.some((a) => a.toLowerCase().includes(q))) return 3;
  if (entry.ur.includes(q)) return 3;
  return 4;
}

function productScore(p: Product, q: string): number {
  const name = p.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if ((p.urdu_name ?? '').includes(q)) return 3;
  return 4;
}

export function ProductNameAutocomplete({
  value, onChange, products, currency, onPickCatalog, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  products: Product[];
  currency?: string;
  onPickCatalog: (p: Product) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
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
      .map((p) => ({ p, score: productScore(p, q) }))
      .filter((x) => x.score < 4)
      .sort((a, b) => a.score - b.score || a.p.name.length - b.p.name.length)
      .slice(0, 5)
      .map((x) => x.p);
    suggestions = catalogMatches.map((product): Suggestion => ({ kind: 'catalog', product }));

    const catalogNames = new Set(catalogMatches.map((p) => p.name.toLowerCase()));
    if (refData && suggestions.length < MAX_SUGGESTIONS) {
      const matches = refData
        .filter((r) => !catalogNames.has(r.en.toLowerCase()))
        .map((entry) => ({ entry, score: refScore(entry, q) }))
        .filter((x) => x.score < 4)
        .sort((a, b) => a.score - b.score || a.entry.en.length - b.entry.en.length)
        .slice(0, MAX_SUGGESTIONS - suggestions.length)
        .map((x) => x.entry);
      suggestions = suggestions.concat(matches.map((entry): Suggestion => ({ kind: 'reference', entry })));
    }
  }

  const handleSelect = (s: Suggestion) => {
    if (s.kind === 'catalog') {
      onPickCatalog(s.product);
    } else {
      onChange(bilingualName(s.entry.en, s.entry.ur));
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={placeholder ?? 'Product name'}
        value={value}
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
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">{s.product.name}</p>
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
