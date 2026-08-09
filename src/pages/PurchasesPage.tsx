import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Plus, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { formatMoney, formatDateTime } from '@/lib/format';
import type { Purchase } from '@/types/db';

export function PurchasesPage() {
  const { shop } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!shop) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('purchases').select('*').eq('shop_id', shop.id).order('purchase_date', { ascending: false }).limit(50);
      setPurchases((data ?? []) as Purchase[]);
      setLoading(false);
    })();
  }, [shop]);

  const filtered = search.trim()
    ? purchases.filter((p) => p.purchase_number.toLowerCase().includes(search.toLowerCase()) || p.supplier_name?.toLowerCase().includes(search.toLowerCase()) || p.supplier_invoice_number?.toLowerCase().includes(search.toLowerCase()))
    : purchases;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Purchases" subtitle={`${purchases.length} recent purchases`} action={<Link to="/purchases/new"><Button><Plus className="h-4 w-4" /> New Purchase</Button></Link>} />
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search by purchase no, supplier, invoice..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<ShoppingBag className="h-8 w-8" />} title={search ? 'No matching purchases' : 'No purchases yet'} description={search ? 'Try a different search.' : 'Record purchases from your suppliers to track inventory and payables.'} action={!search && <Link to="/purchases/new"><Button><Plus className="h-4 w-4" /> New Purchase</Button></Link>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr><th className="px-4 py-3 font-medium">Purchase #</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3"><Link to={`/purchases/${p.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{p.purchase_number}</Link></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDateTime(p.purchase_date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{formatMoney(Number(p.grand_total), shop?.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    credit: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  };
  const labels: Record<string, string> = { paid: 'Paid', partial: 'Partial', credit: 'Unpaid' };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.credit}`}>{labels[status] ?? status}</span>;
}
