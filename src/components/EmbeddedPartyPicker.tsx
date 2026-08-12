import { useEffect, useState } from 'react';
import { Search, Phone, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Spinner, EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/format';

export type PickedParty = { id: string; name: string };

const PAGE_SIZE = 10;

/**
 * Inline customer/supplier picker rendered DIRECTLY inside a chat
 * message bubble (not a modal, not a separate screen) — used when the
 * AI Assistant finds multiple customers/suppliers sharing the exact
 * same spoken name. Supports search + pagination and scales to any
 * number of duplicates (2, 10, 50, 100+) via server-side paging.
 */
export function EmbeddedPartyPicker({
  kind, shopId, currency, initialSearch, onSelect, onAddNew,
}: {
  kind: 'customer' | 'supplier';
  shopId: string;
  currency?: string;
  initialSearch?: string;
  onSelect: (party: PickedParty) => void;
  /** Shown as a persistent footer option — none of the listed duplicates
   *  is the right person, so create a brand-new record with the spoken
   *  name instead. Omit to hide the option. */
  onAddNew?: (spokenName: string) => void;
}) {
  const [search, setSearch] = useState(initialSearch ?? '');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); runSearch(search, 0); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { runSearch(search, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (q: string, pageIndex: number) => {
    setLoading(true);
    const view = kind === 'customer' ? 'customer_directory' : 'supplier_directory';
    const nameCol = kind === 'customer' ? 'full_name' : 'supplier_name';
    const codeCol = kind === 'customer' ? 'customer_code' : 'supplier_code';
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase.from(view).select('*', { count: 'exact' }).eq('shop_id', shopId).order(nameCol, { ascending: true });
    if (q.trim()) {
      const like = `%${q.trim()}%`;
      query = query.or(`${nameCol}.ilike.${like},primary_phone.ilike.${like},${codeCol}.ilike.${like}`);
    }
    const { data, count } = await query.range(from, to);
    setRows(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  const nameOf = (r: any) => (kind === 'customer' ? r.full_name : r.supplier_name);
  const amountOf = (r: any) => (kind === 'customer' ? r.current_balance : r.current_payable);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          placeholder="Search by name, phone, or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="No matches found" description="Try a different search term." />
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect({ id: r.id, name: nameOf(r) })}
              className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-blue-950/20"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">{nameOf(r)}</p>
                {r.primary_phone && (
                  <p className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" /> {r.primary_phone}</p>
                )}
              </div>
              <span className={`flex-shrink-0 pl-2 text-xs font-semibold ${Number(amountOf(r)) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatMoney(Number(amountOf(r)) || 0, currency)}
              </span>
            </button>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="flex items-center gap-1 disabled:opacity-30"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {onAddNew && (
        <button
          type="button"
          dir="rtl"
          onClick={() => onAddNew(initialSearch ?? search)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-950/20"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {kind === 'customer' ? `نیا کسٹمر "${initialSearch ?? search}" شامل کریں` : `نیا سپلائر "${initialSearch ?? search}" شامل کریں`}
        </button>
      )}
    </div>
  );
}
