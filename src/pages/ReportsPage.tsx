import { useEffect, useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, ShoppingBag, Receipt, Wallet, Package,
  Users, Truck, FileDown, Printer, Calendar,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';
import { exportRows, exportExcel, exportPDF } from '@/lib/export';

type ReportType = 'sales' | 'purchases' | 'expenses' | 'profit_loss' | 'inventory' | 'customer_balances' | 'supplier_balances';

const reports: { key: ReportType; label: string; icon: typeof TrendingUp; description: string }[] = [
  { key: 'sales', label: 'Sales Report', icon: TrendingUp, description: 'All sales invoices with totals' },
  { key: 'purchases', label: 'Purchase Report', icon: ShoppingBag, description: 'All purchase invoices with totals' },
  { key: 'expenses', label: 'Expense Report', icon: Receipt, description: 'All expenses by category' },
  { key: 'profit_loss', label: 'Profit & Loss', icon: BarChart3, description: 'Estimated P&L summary' },
  { key: 'inventory', label: 'Inventory Report', icon: Package, description: 'Stock levels and valuation' },
  { key: 'customer_balances', label: 'Customer Balances', icon: Users, description: 'Outstanding receivables' },
  { key: 'supplier_balances', label: 'Supplier Balances', icon: Truck, description: 'Outstanding payables' },
];

export function ReportsPage() {
  const { shop } = useAuth();
  const [active, setActive] = useState<ReportType>('sales');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shop) return;
    (async () => {
      setLoading(true);
      const fromIso = new Date(from + 'T00:00:00').toISOString();
      const toIso = new Date(to + 'T23:59:59').toISOString();
      let rows: Record<string, unknown>[] = [];
      let sums: Record<string, number> = {};

      if (active === 'sales') {
        const { data: d } = await supabase.from('sales').select('*').eq('shop_id', shop.id).gte('sale_date', fromIso).lte('sale_date', toIso).order('sale_date', { ascending: false });
        rows = (d ?? []).map((s: any) => ({ Invoice: s.invoice_number, Customer: s.customer_name ?? 'Walk-in', Date: formatDate(s.sale_date), Total: Number(s.grand_total), Paid: Number(s.amount_paid), Balance: Number(s.balance), Status: s.payment_status }));
        sums = { Total: rows.reduce((a, r) => a + (r.Total as number), 0), Paid: rows.reduce((a, r) => a + (r.Paid as number), 0), Outstanding: rows.reduce((a, r) => a + (r.Balance as number), 0) };
      } else if (active === 'purchases') {
        const { data: d } = await supabase.from('purchases').select('*').eq('shop_id', shop.id).gte('purchase_date', fromIso).lte('purchase_date', toIso).order('purchase_date', { ascending: false });
        rows = (d ?? []).map((p: any) => ({ Purchase: p.purchase_number, Supplier: p.supplier_name ?? '—', Date: formatDate(p.purchase_date), Total: Number(p.grand_total), Paid: Number(p.amount_paid), Balance: Number(p.balance), Status: p.payment_status }));
        sums = { Total: rows.reduce((a, r) => a + (r.Total as number), 0), Paid: rows.reduce((a, r) => a + (r.Paid as number), 0), Payable: rows.reduce((a, r) => a + (r.Balance as number), 0) };
      } else if (active === 'expenses') {
        const { data: d } = await supabase.from('expenses').select('*').eq('shop_id', shop.id).gte('expense_date', fromIso).lte('expense_date', toIso).order('expense_date', { ascending: false });
        rows = (d ?? []).map((e: any) => ({ Number: e.expense_number ?? '—', Date: formatDate(e.expense_date), Category: e.category, Vendor: e.vendor ?? '—', Amount: Number(e.amount), Method: e.payment_method }));
        sums = { Total: rows.reduce((a, r) => a + (r.Amount as number), 0) };
      } else if (active === 'profit_loss') {
        const [s, p, e] = await Promise.all([
          supabase.from('sales').select('grand_total, subtotal').eq('shop_id', shop.id).gte('sale_date', fromIso).lte('sale_date', toIso),
          supabase.from('purchases').select('grand_total').eq('shop_id', shop.id).gte('purchase_date', fromIso).lte('purchase_date', toIso),
          supabase.from('expenses').select('amount').eq('shop_id', shop.id).gte('expense_date', fromIso).lte('expense_date', toIso),
        ]);
        const totalSales = (s.data ?? []).reduce((a: number, r: any) => a + Number(r.grand_total), 0);
        const totalPurchases = (p.data ?? []).reduce((a: number, r: any) => a + Number(r.grand_total), 0);
        const totalExpenses = (e.data ?? []).reduce((a: number, r: any) => a + Number(r.amount), 0);
        const profit = totalSales - totalPurchases - totalExpenses;
        rows = [{ Metric: 'Total Sales', Amount: totalSales }, { Metric: 'Total Purchases', Amount: -totalPurchases }, { Metric: 'Total Expenses', Amount: -totalExpenses }, { Metric: 'Estimated Profit / (Loss)', Amount: profit }];
        sums = { Sales: totalSales, Purchases: totalPurchases, Expenses: totalExpenses, Profit: profit };
      } else if (active === 'inventory') {
        const { data: d } = await supabase.from('products').select('*').eq('shop_id', shop.id).is('deleted_at', null).order('name');
        rows = (d ?? []).map((p: any) => ({ Product: p.name, SKU: p.sku ?? '—', Stock: Number(p.stock), Unit: p.unit, 'Sale Price': Number(p.sale_price), 'Stock Value': Number(p.stock) * Number(p.sale_price), 'Min Level': Number(p.min_stock_level), Status: Number(p.stock) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0 ? 'Low' : Number(p.stock) <= 0 ? 'Out' : 'OK' }));
        sums = { Items: rows.length, StockValue: rows.reduce((a, r) => a + (r['Stock Value'] as number), 0) };
      } else if (active === 'customer_balances') {
        const { data: d } = await supabase.from('customers').select('id, full_name, primary_phone').eq('shop_id', shop.id).is('deleted_at', null).order('full_name');
        const customers = d ?? [];
        const balances = await Promise.all(customers.map(async (c: any) => {
          const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: c.id });
          return { Customer: c.full_name, Phone: c.primary_phone ?? '—', Balance: Number(bal ?? 0) };
        }));
        rows = balances.filter((b) => Math.abs(b.Balance) > 0.01);
        sums = { Customers: rows.length, Outstanding: rows.reduce((a, r) => a + (r.Balance as number), 0) };
      } else if (active === 'supplier_balances') {
        const { data: d } = await supabase.from('suppliers').select('id, supplier_name, primary_phone').eq('shop_id', shop.id).is('deleted_at', null).order('supplier_name');
        const suppliers = d ?? [];
        const balances = await Promise.all(suppliers.map(async (s: any) => {
          const { data: bal } = await supabase.rpc('get_supplier_balance', { p_supplier_id: s.id });
          return { Supplier: s.supplier_name, Phone: s.primary_phone ?? '—', Payable: Number(bal ?? 0) };
        }));
        rows = balances.filter((b) => Math.abs(b.Payable) > 0.01);
        sums = { Suppliers: rows.length, Payable: rows.reduce((a, r) => a + (r.Payable as number), 0) };
      }

      setData(rows);
      setSummary(sums);
      setLoading(false);
    })();
  }, [shop, active, from, to]);

  const cur = shop?.currency ?? 'PKR';
  const activeReport = reports.find((r) => r.key === active)!;

  const handleExport = () => {
    exportRows(`${active}_${from}_to_${to}`, data);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Reports" subtitle="Generate, print, and export business reports" action={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => exportPDF(`ShopPilot-${active}-${from}`)}><Printer className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" onClick={() => exportExcel(`${active}_${from}_to_${to}`, data)} disabled={data.length === 0}><FileDown className="h-4 w-4" /> Excel</Button>
          <Button onClick={() => exportRows(`${active}_${from}_to_${to}`, data)} disabled={data.length === 0}><FileDown className="h-4 w-4" /> CSV</Button>
        </div>
      } />

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Report list */}
        <div className="lg:col-span-1">
          <Card className="p-2">
            <div className="space-y-1">
              {reports.map((r) => (
                <button key={r.key} onClick={() => setActive(r.key)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active === r.key ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <r.icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0"><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-slate-400">{r.description}</p></div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Report content */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title={activeReport.label} subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
            <CardBody className="p-0">
              <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="h-3 w-3" /> From</span>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="h-3 w-3" /> To</span>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm" />
                </label>
              </div>

              {loading ? (
                <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
              ) : data.length === 0 ? (
                <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No data for this period" description="Try a wider date range." />
              ) : (
                <>
                  {/* Summary cards */}
                  {Object.keys(summary).length > 0 && (
                    <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:grid-cols-4">
                      {Object.entries(summary).map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                          <p className="text-xs text-slate-500 dark:text-slate-400">{k}</p>
                          <p className={`text-sm font-bold ${k.toLowerCase().includes('profit') || k.toLowerCase().includes('outstanding') || k.toLowerCase().includes('payable') ? (v < 0 ? 'text-rose-600' : 'text-amber-600') : 'text-slate-900 dark:text-slate-100'}`}>
                            {k === 'Items' || k === 'Customers' || k === 'Suppliers' ? formatNumber(v) : formatMoney(v, cur)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                        <tr>{data.length > 0 && Object.keys(data[0]).map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            {Object.values(row).map((v, j) => {
                              const key = Object.keys(row)[j];
                              const isMoney = ['Total', 'Paid', 'Balance', 'Amount', 'Payable', 'Stock Value', 'Sale Price'].includes(key);
                              return <td key={j} className={`px-4 py-3 ${isMoney ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>{isMoney ? formatMoney(Number(v), cur) : String(v)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
