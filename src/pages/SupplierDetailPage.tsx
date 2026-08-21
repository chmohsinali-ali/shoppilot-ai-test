import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, Phone, MapPin, Wallet, Plus, ShoppingBag,
  ArrowDownLeft, ArrowUpRight, Receipt, Pencil, Trash2, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageLoader } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { phoneAlreadyUsed, isDuplicatePhoneError, DUPLICATE_PHONE_MESSAGE_SUPPLIER } from '@/lib/partyValidation';
import type { Supplier, SupplierLedgerEntry, Purchase } from '@/types/db';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { shop } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  const load = async () => {
    if (!shop || !id) return;
    setLoading(true);
    const [sup, ledg, pur, bal] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', id).maybeSingle(),
      supabase.from('supplier_ledger').select('*').eq('supplier_id', id)
        .order('transaction_date', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('purchases').select('*').eq('supplier_id', id).order('purchase_date', { ascending: false }).limit(10),
      supabase.rpc('get_supplier_balance', { p_supplier_id: id }),
    ]);
    setSupplier(sup.data as Supplier | null);
    setLedger((ledg.data ?? []) as SupplierLedgerEntry[]);
    setPurchases((pur.data ?? []) as Purchase[]);
    setBalance(Number(bal.data ?? 0));
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop, id]);

  if (loading) return <PageLoader />;
  if (!supplier) return <div className="mx-auto max-w-3xl px-4 py-10"><EmptyState icon={<Building2 className="h-8 w-8" />} title="Supplier not found" /></div>;

  const cur = shop?.currency ?? 'PKR';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={() => navigate('/suppliers')} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to suppliers
      </button>

      <Card className="mb-6 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Building2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{supplier.supplier_name}</h1>
              {supplier.company_name && <p className="text-sm text-slate-500 dark:text-slate-400">{supplier.company_name}</p>}
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                {supplier.primary_phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{supplier.primary_phone}</span>}
                {supplier.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{supplier.city}</span>}
                {supplier.channel && <span>Channel: {supplier.channel}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="outline" onClick={() => setShowDeactivate(true)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> Deactivate</Button>
            <Button variant="outline" onClick={() => setShowPay(true)}><Wallet className="h-4 w-4" /> Pay Supplier</Button>
            <Link to={`/assistant?supplierId=${supplier.id}&supplierName=${encodeURIComponent(supplier.supplier_name)}`}>
              <Button variant="outline"><Sparkles className="h-4 w-4" /> AI Chat</Button>
            </Link>
            <Link to={`/purchases/new?supplier=${supplier.id}`}><Button><ShoppingBag className="h-4 w-4" /> New Purchase</Button></Link>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <span className="text-sm text-slate-600 dark:text-slate-300">Current Payable</span>
          <span className={`text-lg font-bold ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatMoney(balance, cur)}</span>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-slate-100">Ledger History</h3></div>
          {ledger.length === 0 ? (
            <EmptyState icon={<Receipt className="h-7 w-7" />} title="No ledger entries" description="Purchase and payment transactions will appear here." />
          ) : (
            <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {ledger.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2">
                    {e.credit_amount > 0 ? <ArrowUpRight className="h-4 w-4 text-amber-500" /> : <ArrowDownLeft className="h-4 w-4 text-emerald-500" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{e.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(e.transaction_date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${e.credit_amount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {e.credit_amount > 0 ? '+' : '-'}{formatMoney(e.credit_amount > 0 ? e.credit_amount : e.debit_amount, cur)}
                    </p>
                    <p className="text-xs text-slate-400">Bal: {formatMoney(Number(e.running_balance), cur)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-slate-100">Recent Purchases</h3></div>
          {purchases.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="No purchases yet" description="Record a purchase from this supplier." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchases.map((p) => (
                <Link key={p.id} to={`/purchases/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.purchase_number}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(p.purchase_date)}</p></div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMoney(Number(p.grand_total), cur)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <PaymentModal open={showPay} onClose={() => setShowPay(false)} supplier={supplier} onDone={load} />
      {showEdit && <EditSupplierModal supplier={supplier} onClose={() => setShowEdit(false)} onSaved={load} />}
      {showDeactivate && <DeactivateSupplierModal supplier={supplier} balance={balance} onClose={() => setShowDeactivate(false)} onDone={() => navigate('/suppliers')} />}
    </div>
  );
}

function EditSupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier; onClose: () => void; onSaved: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_name: supplier.supplier_name ?? '',
    company_name: supplier.company_name ?? '',
    contact_person: supplier.contact_person ?? '',
    primary_phone: supplier.primary_phone ?? '',
    whatsapp_number: supplier.whatsapp_number ?? '',
    email: supplier.email ?? '',
    channel: supplier.channel ?? '',
    route: supplier.route ?? '',
    city: supplier.city ?? '',
    notes: supplier.notes ?? '',
  });
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    if (form.primary_phone.trim()) {
      const used = await phoneAlreadyUsed('suppliers', shop.id, form.primary_phone, supplier.id);
      if (used) { toast('error', DUPLICATE_PHONE_MESSAGE_SUPPLIER); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('suppliers').update({
      supplier_name: form.supplier_name, company_name: form.company_name || null,
      contact_person: form.contact_person || null, primary_phone: form.primary_phone || null,
      whatsapp_number: form.whatsapp_number || null, email: form.email || null,
      channel: form.channel || null, route: form.route || null, city: form.city || null,
      notes: form.notes || null, updated_at: new Date().toISOString(),
    }).eq('id', supplier.id);
    if (error) {
      setSaving(false);
      if (isDuplicatePhoneError(error)) { toast('error', DUPLICATE_PHONE_MESSAGE_SUPPLIER); return; }
      toast('error', error.message);
      return;
    }
    await supabase.from('audit_logs').insert({ shop_id: shop.id, user_id: user.id, action: 'supplier.update', entity_type: 'supplier', entity_id: supplier.id, metadata: { name: form.supplier_name } });
    setSaving(false); toast('success', 'Supplier updated.'); onClose(); onSaved();
  };
  return (
    <Modal open={true} onClose={onClose} title="Edit Supplier" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Supplier name"><Input required value={form.supplier_name} onChange={(e) => update('supplier_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company (optional)"><Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} /></Field>
          <Field label="Contact person"><Input value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><Input value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp_number} onChange={(e) => update('whatsapp_number', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Channel (optional)"><Input value={form.channel} onChange={(e) => update('channel', e.target.value)} /></Field>
          <Field label="Route (optional)"><Input value={form.route} onChange={(e) => update('route', e.target.value)} /></Field>
        </div>
        <Field label="Email (optional)"><Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field>
        <Field label="City (optional)"><Input value={form.city} onChange={(e) => update('city', e.target.value)} /></Field>
        <Field label="Notes (optional)"><Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeactivateSupplierModal({ supplier, balance, onClose, onDone }: { supplier: Supplier; balance: number; onClose: () => void; onDone: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const hasBalance = Math.abs(balance) > 0.01;
  const confirm = async () => {
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), status: 'inactive', updated_at: new Date().toISOString() }).eq('id', supplier.id);
    if (error) { setSaving(false); toast('error', error.message); return; }
    await supabase.from('audit_logs').insert({ shop_id: shop.id, user_id: user.id, action: 'supplier.deactivate', entity_type: 'supplier', entity_id: supplier.id, metadata: { name: supplier.supplier_name, balance } });
    setSaving(false); toast('success', `${supplier.supplier_name} has been deactivated.`); onClose(); onDone();
  };
  return (
    <Modal open={true} onClose={onClose} title="Deactivate Supplier" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Are you sure you want to deactivate <span className="font-semibold">{supplier.supplier_name}</span>?</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">This is a soft delete — the supplier will be hidden from your active list, but all historical purchases and ledger entries will remain fully visible and intact.</p>
        {hasBalance && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">Warning: Outstanding payable</p>
            <p className="mt-1">This supplier has an outstanding payable of <span className="font-bold">{formatMoney(balance, shop?.currency)}</span>. Deactivating will not affect this payable — it will remain payable.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={confirm} loading={saving}><Trash2 className="h-4 w-4" /> Deactivate</Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ open, onClose, supplier, onDone }: { open: boolean; onClose: () => void; supplier: Supplier; onDone: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user || amount <= 0) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('pay_supplier', {
      p_shop_id: shop.id, p_supplier_id: supplier.id, p_amount: amount,
      p_method: method, p_reference: reference, p_notes: notes, p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', `Payment of ${formatMoney(amount, shop.currency)} recorded. New payable: ${formatMoney(Number(data), shop.currency)}`);
    setAmount(0); setReference(''); setNotes('');
    onClose(); onDone();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Pay ${supplier.supplier_name}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount"><Input type="number" min={0.01} step="0.01" required value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></Field>
        <Field label="Payment method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option><option value="mobile">Mobile / EasyPaisa</option>
          </Select>
        </Field>
        <Field label="Reference (optional)"><Input placeholder="Cheque no, transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}><ArrowUpRight className="h-4 w-4" /> Pay</Button>
        </div>
      </form>
    </Modal>
  );
}
