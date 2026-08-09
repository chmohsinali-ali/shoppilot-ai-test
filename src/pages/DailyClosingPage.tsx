import { useEffect, useState, FormEvent } from 'react';
import { CalendarClock, Lock, Save, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Textarea } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDate } from '@/lib/format';
import type { DailyClosing } from '@/types/db';

export function DailyClosingPage() {
  const { shop, user, hasPermission } = useAuth();
  const toast = useToast();
  const [closings, setClosings] = useState<DailyClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [existing, setExisting] = useState<DailyClosing | null>(null);
  const [autoData, setAutoData] = useState({
    opening_cash: 0, cash_sales: 0, customer_payments: 0, supplier_payments: 0, expenses: 0,
  });
  const [actualCash, setActualCash] = useState(0);
  const [withdrawals, setWithdrawals] = useState(0);
  const [deposits, setDeposits] = useState(0);
  const [managerNotes, setManagerNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission('daily_closing.manage');

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data: list } = await supabase.from('daily_closings').select('*').eq('shop_id', shop.id).order('closing_date', { ascending: false }).limit(30);
    setClosings((list ?? []) as DailyClosing[]);
    setLoading(false);
  };

  const loadDay = async (date: string) => {
    if (!shop) return;
    setSelectedDate(date);
    setExisting(null);
    setActualCash(0); setWithdrawals(0); setDeposits(0); setManagerNotes('');

    // Check if a closing already exists for this date
    const { data: existing } = await supabase.from('daily_closings').select('*').eq('shop_id', shop.id).eq('closing_date', date).maybeSingle();
    if (existing) {
      setExisting(existing as DailyClosing);
      setActualCash(Number((existing as DailyClosing).actual_cash));
      setWithdrawals(Number((existing as DailyClosing).cash_withdrawals));
      setDeposits(Number((existing as DailyClosing).cash_deposits));
      setManagerNotes((existing as DailyClosing).manager_notes ?? '');
      return;
    }

    // Auto-calculate from transactions on that date
    const dayStart = new Date(date + 'T00:00:00').toISOString();
    const dayEnd = new Date(date + 'T23:59:59').toISOString();
    const [sales, payments, supplierPayments, expenses] = await Promise.all([
      supabase.from('sales').select('grand_total, payment_method').eq('shop_id', shop.id).gte('sale_date', dayStart).lte('sale_date', dayEnd).eq('payment_method', 'cash'),
      supabase.from('customer_ledger').select('credit_amount').eq('shop_id', shop.id).eq('entry_type', 'CUSTOMER_PAYMENT').gte('transaction_date', dayStart).lte('transaction_date', dayEnd),
      supabase.from('supplier_ledger').select('debit_amount').eq('shop_id', shop.id).eq('entry_type', 'SUPPLIER_PAYMENT').gte('transaction_date', dayStart).lte('transaction_date', dayEnd),
      supabase.from('expenses').select('amount').eq('shop_id', shop.id).eq('payment_method', 'cash').gte('expense_date', dayStart).lte('expense_date', dayEnd),
    ]);
    const cashSales = (sales.data ?? []).reduce((s: number, r: any) => s + Number(r.grand_total), 0);
    const custPayments = (payments.data ?? []).reduce((s: number, r: any) => s + Number(r.credit_amount), 0);
    const supPayments = (supplierPayments.data ?? []).reduce((s: number, r: any) => s + Number(r.debit_amount), 0);
    const exp = (expenses.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    setAutoData({ opening_cash: 0, cash_sales: cashSales, customer_payments: custPayments, supplier_payments: supPayments, expenses: exp });
  };

  useEffect(() => { load(); }, [shop]);
  useEffect(() => { if (shop) loadDay(selectedDate); }, [shop, selectedDate]);

  const expectedCash = autoData.opening_cash + autoData.cash_sales + autoData.customer_payments - autoData.supplier_payments - autoData.expenses - withdrawals + deposits;
  const difference = actualCash - expectedCash;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('daily_closings').insert({
      shop_id: shop.id,
      closing_date: selectedDate,
      opening_cash: autoData.opening_cash,
      cash_sales: autoData.cash_sales,
      customer_payments: autoData.customer_payments,
      supplier_payments: autoData.supplier_payments,
      expenses: autoData.expenses,
      cash_withdrawals: withdrawals,
      cash_deposits: deposits,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      difference: difference,
      manager_notes: managerNotes,
      is_locked: true,
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', `Daily closing for ${formatDate(selectedDate)} saved and locked.`);
    load();
    loadDay(selectedDate);
  };

  const reopen = async () => {
    if (!existing) return;
    const { error } = await supabase.from('daily_closings').update({ is_locked: false }).eq('id', existing.id);
    if (error) { toast('error', error.message); return; }
    await supabase.from('audit_logs').insert({
      shop_id: shop!.id, user_id: user!.id, action: 'daily_closing.reopen', entity_type: 'daily_closing', entity_id: existing.id,
      metadata: { date: existing.closing_date },
    });
    toast('success', 'Daily closing reopened for editing.');
    load();
    loadDay(selectedDate);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const cur = shop?.currency ?? 'PKR';
  const isLocked = existing?.is_locked;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Daily Closing" subtitle="Reconcile cash at the end of each business day" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Closing date">
          <Input type="date" value={selectedDate} onChange={(e) => loadDay(e.target.value)} className="h-9 text-sm w-48" />
        </Field>
        {isLocked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Lock className="h-4 w-4" /> Locked
          </span>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader title={`Closing for ${formatDate(selectedDate)}`} subtitle={isLocked ? 'This day is closed and locked' : 'Auto-calculated from transactions'} />
        <CardBody className="space-y-4">
          {!isLocked && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              Cash sales, customer payments, supplier payments, and expenses are automatically pulled from your transactions for this date.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <MoneyRow label="Opening cash" value={autoData.opening_cash} editable={!isLocked} onChange={(v) => setAutoData((d) => ({ ...d, opening_cash: v }))} cur={cur} />
            <MoneyRow label="Cash sales (auto)" value={autoData.cash_sales} cur={cur} />
            <MoneyRow label="Customer payments (auto)" value={autoData.customer_payments} cur={cur} />
            <MoneyRow label="Supplier payments (auto)" value={autoData.supplier_payments} cur={cur} negative />
            <MoneyRow label="Expenses (auto)" value={autoData.expenses} cur={cur} negative />
            <MoneyRow label="Withdrawals" value={withdrawals} editable={!isLocked} onChange={setWithdrawals} cur={cur} negative />
            <MoneyRow label="Deposits" value={deposits} editable={!isLocked} onChange={setDeposits} cur={cur} />
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Expected cash</span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatMoney(expectedCash, cur)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <Field label="Actual cash counted">
                <Input type="number" step="0.01" value={actualCash || ''} onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)} disabled={isLocked} className="h-10 text-base font-medium" />
              </Field>
              <div className="flex-shrink-0">
                <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 ${Math.abs(difference) < 0.01 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'}`}>
                  {Math.abs(difference) < 0.01 ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  <div>
                    <p className="text-xs font-medium">Difference</p>
                    <p className="text-sm font-bold">{formatMoney(difference, cur)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!isLocked && (
            <Field label="Manager notes (optional)"><Textarea rows={2} value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} /></Field>
          )}
          {isLocked && existing && (
            <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p><span className="font-medium">Expected:</span> {formatMoney(Number(existing.expected_cash), cur)}</p>
              <p><span className="font-medium">Actual:</span> {formatMoney(Number(existing.actual_cash), cur)}</p>
              <p><span className="font-medium">Difference:</span> {formatMoney(Number(existing.difference), cur)}</p>
              {existing.manager_notes && <p><span className="font-medium">Notes:</span> {existing.manager_notes}</p>}
              <p className="text-xs text-slate-400">Closed on {formatDate(existing.closed_at ?? existing.created_at)}</p>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end gap-2 pt-2">
              {isLocked ? (
                <Button variant="outline" onClick={reopen}><Lock className="h-4 w-4" /> Reopen for editing</Button>
              ) : (
                <Button onClick={save} loading={saving} size="lg"><Save className="h-4 w-4" /> Close & Lock Day</Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* History */}
      <Card>
        <CardHeader title="Recent Closings" subtitle="Last 30 days" />
        <CardBody className="p-0">
          {closings.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No closings yet" description="Close your first day to see history here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Expected</th><th className="px-4 py-3 font-medium">Actual</th><th className="px-4 py-3 font-medium">Diff</th><th className="px-4 py-3 font-medium">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {closings.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => loadDay(c.closing_date)}>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(c.closing_date)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatMoney(Number(c.expected_cash), cur)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatMoney(Number(c.actual_cash), cur)}</td>
                      <td className={`px-4 py-3 font-medium ${Math.abs(Number(c.difference)) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatMoney(Number(c.difference), cur)}</td>
                      <td className="px-4 py-3">{c.is_locked ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Lock className="h-3 w-3" /> Locked</span> : <span className="text-xs text-amber-600">Open</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function MoneyRow({ label, value, editable, onChange, cur, negative }: { label: string; value: number; editable?: boolean; onChange?: (v: number) => void; cur: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      {editable && onChange ? (
        <Input type="number" step="0.01" value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="h-8 w-28 text-right text-sm" />
      ) : (
        <span className={`text-sm font-semibold ${negative ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100'}`}>{negative && value > 0 ? '-' : ''}{formatMoney(value, cur)}</span>
      )}
    </div>
  );
}
