import { useEffect, useState, useMemo, FormEvent } from 'react';
import { Receipt, Search, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDate } from '@/lib/format';
import type { Expense } from '@/types/db';

const categories = ['Rent', 'Electricity', 'Gas', 'Internet', 'Salary', 'Fuel', 'Transport', 'Tea & Refreshments', 'Maintenance', 'Packaging', 'Tax', 'Office Expense', 'Miscellaneous'];

export function ExpensesPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', shop.id)
      .order('expense_date', { ascending: false })
      .limit(50);
    if (error) toast('error', 'Could not load expenses.');
    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) => e.category.toLowerCase().includes(q) || e.vendor?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
  }, [expenses, search]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Expenses"
        subtitle={`${expenses.length} records · ${formatMoney(total, shop?.currency)} total`}
        action={<Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Expense</Button>}
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search by category, vendor, description..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={search ? 'No matching expenses' : 'No expenses recorded'}
            description={search ? 'Try a different search.' : 'Track your shop expenses like rent, electricity, and salaries.'}
            action={!search && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Expense</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(e.expense_date)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{e.category}</span></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.vendor ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.description ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{e.payment_method}</td>
                    <td className="px-4 py-3 font-semibold text-rose-600 dark:text-rose-400">{formatMoney(Number(e.amount), shop?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddExpenseModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
    </div>
  );
}

function AddExpenseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: 'Rent', vendor: '', description: '', amount: 0, payment_method: 'cash', notes: '', expense_date: new Date().toISOString().slice(0, 10) });

  const update = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    setSaving(true);
    const { data: num } = await supabase.rpc('next_number', { p_shop_id: shop.id, p_prefix: 'EXP' });
    const { error } = await supabase.from('expenses').insert({
      shop_id: shop.id,
      expense_number: num,
      expense_date: new Date(form.expense_date).toISOString(),
      category: form.category,
      vendor: form.vendor || null,
      description: form.description || null,
      amount: form.amount,
      payment_method: form.payment_method,
      notes: form.notes || null,
      created_by: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Expense recorded.');
    setForm({ category: 'Rent', vendor: '', description: '', amount: 0, payment_method: 'cash', notes: '', expense_date: new Date().toISOString().slice(0, 10) });
    onClose();
    onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Expense" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => update('category', e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.expense_date} onChange={(e) => update('expense_date', e.target.value)} />
          </Field>
        </div>
        <Field label="Vendor (optional)"><Input placeholder="Shop owner, company" value={form.vendor} onChange={(e) => update('vendor', e.target.value)} /></Field>
        <Field label="Description (optional)"><Input placeholder="What was this for" value={form.description} onChange={(e) => update('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount"><Input type="number" min={0} step="0.01" required value={form.amount || ''} onChange={(e) => update('amount', parseFloat(e.target.value) || 0)} /></Field>
          <Field label="Payment method">
            <Select value={form.payment_method} onChange={(e) => update('payment_method', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="mobile">Mobile / EasyPaisa</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes (optional)"><Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Expense</Button>
        </div>
      </form>
    </Modal>
  );
}
