import { useEffect, useState, useMemo, FormEvent } from 'react';
import { Shield, Plus, Search, ShieldCheck, ShieldAlert, Wrench, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { computeWarrantyExpiry } from '@/lib/calc';
import type { Warranty, WarrantyClaim, Customer } from '@/types/db';

export function WarrantyPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'warranties' | 'claims'>('warranties');
  const [showAdd, setShowAdd] = useState(false);
  const [showClaim, setShowClaim] = useState<Warranty | null>(null);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const [w, c] = await Promise.all([
      supabase.from('warranties').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }),
      supabase.from('warranty_claims').select('*').eq('shop_id', shop.id).order('claim_date', { ascending: false }),
    ]);
    setWarranties((w.data ?? []) as Warranty[]);
    setClaims((c.data ?? []) as WarrantyClaim[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warranties;
    return warranties.filter((w) => w.product_name.toLowerCase().includes(q) || w.customer_name?.toLowerCase().includes(q) || w.warranty_number.toLowerCase().includes(q) || w.serial_number?.toLowerCase().includes(q));
  }, [warranties, search]);

  const today = new Date().toISOString().slice(0, 10);
  const expiredCount = warranties.filter((w) => w.warranty_expiry_date < today && w.status === 'active').length;
  const pendingClaims = claims.filter((c) => c.claim_status === 'pending' || c.claim_status === 'under_repair').length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Warranty Management" subtitle={`${warranties.length} warranties · ${expiredCount} expired · ${pendingClaims} pending claims`} action={<Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Warranty</Button>} />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('warranties')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab === 'warranties' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Shield className="h-4 w-4" /> Warranties</button>
        <button onClick={() => setTab('claims')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab === 'claims' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Wrench className="h-4 w-4" /> Claims ({claims.length})</button>
      </div>

      {tab === 'warranties' && (
        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search by product, customer, serial..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : tab === 'warranties' ? (
        filtered.length === 0 ? (
          <Card><EmptyState icon={<Shield className="h-8 w-8" />} title={search ? 'No matching warranties' : 'No warranties yet'} description={search ? 'Try a different search.' : 'Add warranty records for products you sell with warranty.'} action={!search && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Warranty</Button>} /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((w) => {
              const isExpired = w.warranty_expiry_date < today && w.status === 'active';
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isExpired ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40'}`}>
                        {isExpired ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{w.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{w.warranty_number}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {w.customer_name && <p>Customer: {w.customer_name}</p>}
                    {w.serial_number && <p>Serial: {w.serial_number}</p>}
                    <p>Start: {formatDate(w.warranty_start_date)}</p>
                    <p className={isExpired ? 'font-medium text-rose-600' : ''}>Expiry: {formatDate(w.warranty_expiry_date)}</p>
                    <p>Duration: {w.warranty_duration} {w.warranty_unit}</p>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShowClaim(w)}><Wrench className="h-4 w-4" /> File Claim</Button>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        claims.length === 0 ? (
          <Card><EmptyState icon={<Wrench className="h-8 w-8" />} title="No warranty claims" description="File a claim from a warranty card." /></Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"><tr><th className="px-4 py-3 font-medium">Claim #</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Cost</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">{c.claim_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.product_name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{c.customer_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(c.claim_date)}</td>
                    <td className="px-4 py-3"><ClaimBadge status={c.claim_status} /></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.cost > 0 ? `${c.cost}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      <AddWarrantyModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <ClaimModal warranty={showClaim} onClose={() => setShowClaim(null)} onCreated={load} />
    </div>
  );
}

function AddWarrantyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product_name: '', customer_id: '', customer_name: '', serial_number: '', batch_number: '', warranty_provider: '', warranty_start_date: new Date().toISOString().slice(0, 10), warranty_duration: 12, warranty_unit: 'months', warranty_terms: '', notes: '' });

  useEffect(() => {
    if (open && shop) {
      supabase.from('customers').select('id, full_name').eq('shop_id', shop.id).is('deleted_at', null).order('full_name').then(({ data }) => setCustomers((data ?? []) as Customer[]));
    }
  }, [open, shop]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    setSaving(true);
    const expiry = computeWarrantyExpiry(form.warranty_start_date, form.warranty_duration, form.warranty_unit);
    const { data: num } = await supabase.rpc('next_number', { p_shop_id: shop.id, p_prefix: 'WAR' });
    const customer = customers.find((c) => c.id === form.customer_id);
    const { error } = await supabase.from('warranties').insert({
      shop_id: shop.id, warranty_number: num,
      customer_id: form.customer_id || null, customer_name: customer?.full_name || form.customer_name || null,
      product_name: form.product_name, serial_number: form.serial_number || null, batch_number: form.batch_number || null,
      warranty_provider: form.warranty_provider || null,
      warranty_start_date: form.warranty_start_date, warranty_duration: form.warranty_duration, warranty_unit: form.warranty_unit,
      warranty_expiry_date: expiry, warranty_terms: form.warranty_terms || null, notes: form.notes || null, created_by: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Warranty recorded.');
    setForm({ product_name: '', customer_id: '', customer_name: '', serial_number: '', batch_number: '', warranty_provider: '', warranty_start_date: new Date().toISOString().slice(0, 10), warranty_duration: 12, warranty_unit: 'months', warranty_terms: '', notes: '' });
    onClose(); onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Warranty" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Product name"><Input required value={form.product_name} onChange={(e) => update('product_name', e.target.value)} /></Field>
        <Field label="Customer (optional)">
          <Select value={form.customer_id} onChange={(e) => update('customer_id', e.target.value)}>
            <option value="">Walk-in / select</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Serial number"><Input value={form.serial_number} onChange={(e) => update('serial_number', e.target.value)} /></Field>
          <Field label="Batch number"><Input value={form.batch_number} onChange={(e) => update('batch_number', e.target.value)} /></Field>
        </div>
        <Field label="Warranty provider"><Input value={form.warranty_provider} onChange={(e) => update('warranty_provider', e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Start date"><Input type="date" value={form.warranty_start_date} onChange={(e) => update('warranty_start_date', e.target.value)} /></Field>
          <Field label="Duration"><Input type="number" min={0} value={form.warranty_duration} onChange={(e) => update('warranty_duration', e.target.value)} /></Field>
          <Field label="Unit">
            <Select value={form.warranty_unit} onChange={(e) => update('warranty_unit', e.target.value)}>
              <option value="days">Days</option><option value="months">Months</option><option value="years">Years</option><option value="lifetime">Lifetime</option>
            </Select>
          </Field>
        </div>
        <Field label="Terms (optional)"><Textarea rows={2} value={form.warranty_terms} onChange={(e) => update('warranty_terms', e.target.value)} /></Field>
        <Field label="Notes (optional)"><Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save Warranty</Button></div>
      </form>
    </Modal>
  );
}

function ClaimModal({ warranty, onClose, onCreated }: { warranty: Warranty | null; onClose: () => void; onCreated: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [problem, setProblem] = useState('');
  const [status, setStatus] = useState('pending');
  const [cost, setCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (warranty) { setProblem(''); setStatus('pending'); setCost(0); setNotes(''); } }, [warranty]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user || !warranty) return;
    setSaving(true);
    const { data: num } = await supabase.rpc('next_number', { p_shop_id: shop.id, p_prefix: 'WCL' });
    const { error } = await supabase.from('warranty_claims').insert({
      shop_id: shop.id, claim_number: num, warranty_id: warranty.id,
      customer_id: warranty.customer_id, customer_name: warranty.customer_name,
      product_name: warranty.product_name, problem_description: problem,
      claim_status: status, cost, notes, created_by: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Claim filed.');
    onClose(); onCreated();
  };

  if (!warranty) return null;

  return (
    <Modal open={!!warranty} onClose={onClose} title={`File Claim — ${warranty.product_name}`} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <p className="font-medium text-slate-900 dark:text-slate-100">{warranty.warranty_number}</p>
          <p className="text-xs text-slate-500">Expiry: {formatDate(warranty.warranty_expiry_date)}</p>
        </div>
        <Field label="Problem description"><Textarea rows={3} required value={problem} onChange={(e) => setProblem(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Claim status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pending</option><option value="accepted">Accepted</option><option value="under_repair">Under Repair</option><option value="repaired">Repaired</option><option value="replaced">Replaced</option><option value="rejected">Rejected</option><option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Cost (if any)"><Input type="number" min={0} step="0.01" value={cost || ''} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>File Claim</Button></div>
      </form>
    </Modal>
  );
}

function ClaimBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    accepted: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
    under_repair: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400',
    repaired: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    replaced: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
    closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? styles.pending}`}>{status.replace('_', ' ')}</span>;
}
