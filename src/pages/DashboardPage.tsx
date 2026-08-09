import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  Users,
  Package,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Receipt,
  Plus,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatMoney, formatDateTime, timeAgo } from '@/lib/format';
import type { Sale } from '@/types/db';

type Stats = {
  todaySales: number;
  todayCount: number;
  monthSales: number;
  customerCount: number;
  productCount: number;
  lowStock: number;
  outstanding: number;
  todayExpenses: number;
};

export function DashboardPage() {
  const { shop } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [salesToday, salesMonth, customers, products, expensesRes, ledgerRes, recentSales] = await Promise.all([
        supabase.from('sales').select('grand_total').eq('shop_id', shop.id).gte('sale_date', start.toISOString()),
        supabase.from('sales').select('grand_total').eq('shop_id', shop.id).gte('sale_date', monthStart.toISOString()),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('shop_id', shop.id),
        supabase.from('products').select('id, stock, min_stock_level').eq('shop_id', shop.id).is('deleted_at', null),
        supabase.from('expenses').select('amount').eq('shop_id', shop.id).gte('expense_date', start.toISOString()),
        supabase.from('customer_ledger').select('debit_amount, credit_amount').eq('shop_id', shop.id),
        supabase.from('sales').select('*').eq('shop_id', shop.id).order('sale_date', { ascending: false }).limit(5),
      ]);

      if (cancelled) return;

      const todaySales = salesToday.data?.reduce((s, r) => s + Number(r.grand_total), 0) ?? 0;
      const monthSales = salesMonth.data?.reduce((s, r) => s + Number(r.grand_total), 0) ?? 0;
      const todayExpenses = expensesRes.data?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
      const outstanding = ledgerRes.data?.reduce((s, r) => s + Number(r.debit_amount) - Number(r.credit_amount), 0) ?? 0;
      const lowStock = (products.data ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0).length;

      setStats({
        todaySales,
        todayCount: salesToday.data?.length ?? 0,
        monthSales,
        customerCount: customers.count ?? 0,
        productCount: products.data?.length ?? 0,
        lowStock,
        outstanding,
        todayExpenses,
      });
      setRecent((recentSales.data ?? []) as Sale[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [shop]);

  if (!shop) return null;
  const cur = shop.currency;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title={`Hi, ${shop.name}`}
        subtitle="Here is what is happening in your shop today."
        action={
          <Link to="/assistant">
            <Button>
              <Sparkles className="h-4 w-4" /> Ask AI
            </Button>
          </Link>
        }
      />

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <QuickAction to="/sales/new" icon={ShoppingBag} label="New Sale" color="blue" />
        <QuickAction to="/assistant" icon={Sparkles} label="AI Assistant" color="violet" />
        <QuickAction to="/customers" icon={Users} label="Add Customer" color="emerald" />
        <QuickAction to="/suppliers" icon={Truck} label="Suppliers" color="rose" />
        <QuickAction to="/products" icon={Package} label="Add Product" color="amber" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Today's Sales"
          value={formatMoney(stats?.todaySales ?? 0, cur)}
          sub={`${stats?.todayCount ?? 0} invoices`}
          icon={TrendingUp}
          color="blue"
          loading={loading}
        />
        <StatCard
          title="This Month"
          value={formatMoney(stats?.monthSales ?? 0, cur)}
          sub="Total sales"
          icon={ShoppingBag}
          color="emerald"
          loading={loading}
        />
        <StatCard
          title="Outstanding"
          value={formatMoney(stats?.outstanding ?? 0, cur)}
          sub="Customer receivables"
          icon={Wallet}
          color="amber"
          loading={loading}
        />
        <StatCard
          title="Today's Expenses"
          value={formatMoney(stats?.todayExpenses ?? 0, cur)}
          sub="Spent today"
          icon={Receipt}
          color="rose"
          loading={loading}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Recent sales */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Recent Sales</h3>
            <Link to="/sales" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Loading...</div>
          ) : recent.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No sales yet. <Link to="/sales/new" className="text-blue-600 hover:underline">Create your first sale</Link>.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((s) => (
                <Link
                  key={s.id}
                  to={`/sales/${s.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{s.invoice_number}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {s.customer_name ?? 'Walk-in'} · {timeAgo(s.sale_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMoney(Number(s.grand_total), cur)}</p>
                    <StatusBadge status={s.payment_status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Side info */}
        <div className="space-y-4">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Shop Snapshot</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <SnapshotRow icon={Users} label="Customers" value={stats?.customerCount ?? 0} loading={loading} />
              <SnapshotRow icon={Package} label="Products" value={stats?.productCount ?? 0} loading={loading} />
              <SnapshotRow
                icon={AlertTriangle}
                label="Low stock items"
                value={stats?.lowStock ?? 0}
                loading={loading}
                warn={(stats?.lowStock ?? 0) > 0}
              />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <div className="px-5 py-5">
              <Sparkles className="h-6 w-6 mb-2" />
              <h3 className="font-semibold">Try voice command</h3>
              <p className="mt-1 text-sm text-blue-100">"Mohsin ko 5 kilo cheeni 270 rupay kilo de do"</p>
              <Link to="/assistant">
                <Button variant="secondary" size="sm" className="mt-3 bg-white/15 text-white hover:bg-white/25">
                  Open Assistant <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  color,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
  color: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
}) {
  const colors = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400',
  };
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    </Link>
  );
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof TrendingUp;
  color: 'blue' | 'emerald' | 'amber' | 'rose';
  loading: boolean;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      )}
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
    </Card>
  );
}

function SnapshotRow({
  icon: Icon,
  label,
  value,
  loading,
  warn,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      {loading ? (
        <div className="h-5 w-8 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <span className={`text-sm font-semibold ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    credit: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
    cash: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  const labels: Record<string, string> = { paid: 'Paid', partial: 'Partial', credit: 'Credit', cash: 'Cash' };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? styles.cash}`}>{labels[status] ?? status}</span>;
}
