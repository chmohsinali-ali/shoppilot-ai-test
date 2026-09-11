import { useEffect, useRef, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/types/db';

type RefEntry = { category: string; en: string; alt: string };

// A brand-new shop's own product catalog starts empty, so catalog-only
// matching (like the existing "Search products to add" box) gives zero
// suggestions on day one — useful only once a shopkeeper has spent real
// time typing in hundreds of items, which small shops rarely do (unlike
// a "mart" with dedicated data-entry staff). This reference list of
// common Pakistani shop items (English + Roman Urdu, since that's how
// people actually type — not Urdu script) exists purely to make
// suggestions useful from day one; it is NEVER an actual product, never
// sold or shown as one, and (like the customer name directory) can never
// cover every real item — a typed name with no match just stays as
// typed, same as today.
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
type RefSuggestion = { kind: 'reference'; en: string; alt: string };
type Suggestion = CatalogSuggestion | RefSuggestion;

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
      .filter((p) => p.name.toLowerCase().includes(q) || (p.urdu_name ?? '').toLowerCase().includes(q))
      .slice(0, 5);
    suggestions = catalogMatches.map((product): Suggestion => ({ kind: 'catalog', product }));

    const catalogNames = new Set(catalogMatches.map((p) => p.name.toLowerCase()));
    if (refData && suggestions.length < MAX_SUGGESTIONS) {
      const refMatches = refData.filter(
        (r) => !catalogNames.has(r.en.toLowerCase())
          && (r.en.toLowerCase().includes(q) || r.alt.toLowerCase().includes(q))
      ).slice(0, MAX_SUGGESTIONS - suggestions.length);
      suggestions = suggestions.concat(refMatches.map((r): Suggestion => ({ kind: 'reference', en: r.en, alt: r.alt })));
    }
  }

  const handleSelect = (s: Suggestion) => {
    if (s.kind === 'catalog') {
      onPickCatalog(s.product);
    } else {
      const differs = s.alt && s.alt.toLowerCase() !== s.en.toLowerCase();
      onChange(differs ? `${s.en} (${s.alt})` : s.en);
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
        <div className="absolute z-20 mt-1 max-h-64 w-full min-w-[260px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s) => (
            <button
              key={s.kind === 'catalog' ? `c-${s.product.id}` : `r-${s.en}`}
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
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                      {s.en}{s.alt && s.alt.toLowerCase() !== s.en.toLowerCase() ? ` (${s.alt})` : ''}
                    </p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">Not in your inventory yet</p>
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
