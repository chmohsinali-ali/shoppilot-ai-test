import { useEffect, useState, useMemo, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck, Search, Plus, Phone, Wallet, ArrowRight, Building2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/format';
import { EmbeddedPartyPicker } from '@/components/EmbeddedPartyPicker';
import { findExactNameMatches, phoneAlreadyUsed, isDuplicatePhoneError, DUPLICATE_PHONE_MESSAGE_SUPPLIER } from '@/lib/partyValidation';
import type { Supplier } from '@/types/db';

type SupplierWithBalance = Supplier & { balance: number };

export function SuppliersPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierWithBalance | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SupplierWithBalance | null>(null);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('shop_id', shop.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) { toast('error', 'Could not load suppliers.'); setLoading(false); return; }
    const rows = (data ?? []) as Supplier[];
    const withBalance = await Promise.all(
      rows.map(async (s) => {
        const { data: bal } = await supabase.rpc('get_supplier_balance', { p_supplier_id: s.id });
        return { ...s, balance: Number(bal ?? 0) };
      })
    );
    setSuppliers(withBalance);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.supplier_name.toLowerCase().includes(q) || s.primary_phone?.toLowerCase().includes(q) || s.company_name?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers.length} suppliers in your shop`}
        action={<Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Supplier</Button>}
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search by name, phone, company..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="h-8 w-8" />}
            title={search ? 'No matching suppliers' : 'No suppliers yet'}
            description={search ? 'Try a different search.' : 'Add suppliers to record purchases and track payables.'}
            action={!search && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Supplier</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800">
              <Link to={`/suppliers/${s.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{s.supplier_name}</p>
                      {s.company_name && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{s.company_name}</p>}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-500" />
                </div>
                <div className="mt-3 space-y-1.5">
                  {s.primary_phone && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Phone className="h-3.5 w-3.5" /> {s.primary_phone}</div>}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Payable</span>
                    <span className={`text-sm font-semibold ${s.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {formatMoney(s.balance, shop?.currency)}
                    </span>
                  </div>
                </div>
              </Link>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button size="sm" variant="outline" onClick={() => setEditTarget(s)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeactivateTarget(s)}><Trash2 className="h-3.5 w-3.5" /> Deactivate</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddSupplierModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      {editTarget && <EditSupplierModal supplier={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />}
      {deactivateTarget && <DeactivateSupplierModal supplier={deactivateTarget} onClose={() => setDeactivateTarget(null)} onDone={load} />}
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

function DeactivateSupplierModal({ supplier, onClose, onDone }: { supplier: SupplierWithBalance; onClose: () => void; onDone: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const hasBalance = Math.abs(supplier.balance) > 0.01;
  const confirm = async () => {
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), status: 'inactive', updated_at: new Date().toISOString() }).eq('id', supplier.id);
    if (error) { setSaving(false); toast('error', error.message); return; }
    await supabase.from('audit_logs').insert({ shop_id: shop.id, user_id: user.id, action: 'supplier.deactivate', entity_type: 'supplier', entity_id: supplier.id, metadata: { name: supplier.supplier_name, balance: supplier.balance } });
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
            <p className="mt-1">This supplier has an outstanding payable of <span className="font-bold">{formatMoney(supplier.balance, shop?.currency)}</span>. Deactivating will not affect this payable — it will remain payable.</p>
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

function AddSupplierModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dupNames, setDupNames] = useState(false);
  const [form, setForm] = useState({
    supplier_name: '', company_name: '', contact_person: '', primary_phone: '', whatsapp_number: '',
    email: '', channel: '', route: '', city: '', notes: '',
    opening_balance: 0, opening_balance_type: 'shop_owes',
  });

  const update = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({ supplier_name: '', company_name: '', contact_person: '', primary_phone: '', whatsapp_number: '', email: '', channel: '', route: '', city: '', notes: '', opening_balance: 0, opening_balance_type: 'shop_owes' });
    setDupNames(false);
  };

  const doInsert = async () => {
    if (!shop) return;
    if (form.primary_phone.trim()) {
      const used = await phoneAlreadyUsed('suppliers', shop.id, form.primary_phone);
      if (used) { toast('error', DUPLICATE_PHONE_MESSAGE_SUPPLIER); return; }
    }
    setSaving(true);
    const { data, error } = await supabase.from('suppliers').insert({
      shop_id: shop.id,
      supplier_name: form.supplier_name,
      company_name: form.company_name || null,
      contact_person: form.contact_person || null,
      primary_phone: form.primary_phone || null,
      whatsapp_number: form.whatsapp_number || null,
      email: form.email || null,
      channel: form.channel || null,
      route: form.route || null,
      city: form.city || null,
      notes: form.notes || null,
      opening_balance: form.opening_balance,
      opening_balance_type: form.opening_balance_type,
    }).select('id').maybeSingle();
    setSaving(false);
    if (error) {
      if (isDuplicatePhoneError(error)) { toast('error', DUPLICATE_PHONE_MESSAGE_SUPPLIER); return; }
      toast('error', error.message);
      return;
    }

    if (form.opening_balance > 0 && form.opening_balance_type === 'shop_owes' && data) {
      await supabase.from('supplier_ledger').insert({
        shop_id: shop.id,
        supplier_id: data.id,
        entry_type: 'OPENING_PAYABLE',
        description: 'Opening balance',
        credit_amount: form.opening_balance,
        running_balance: form.opening_balance,
      });
    }

    toast('success', 'Supplier added.');
    resetForm();
    onClose();
    onCreated();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setChecking(true);
    const matches = await findExactNameMatches('suppliers', 'supplier_name', shop.id, form.supplier_name);
    setChecking(false);
    if (matches > 0) { setDupNames(true); return; }
    await doInsert();
  };

  const handleClose = () => { resetForm(); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Add Supplier" size="md">
      {dupNames ? (
        <div className="space-y-3">
          <p dir="rtl" className="rounded-lg bg-amber-50 px-3 py-2.5 text-right text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            "{form.supplier_name}" نام کے سپلائر پہلے سے موجود ہیں۔ نیچے نام، نمبر اور بیلنس دیکھ کر تصدیق کریں کہ کون سا سپلائر ہے۔
          </p>
          <EmbeddedPartyPicker
            kind="supplier"
            shopId={shop!.id}
            currency={shop?.currency}
            initialSearch={form.supplier_name}
            onSelect={(chosen) => { onClose(); navigate(`/suppliers/${chosen.id}`); }}
            onAddNew={() => { setDupNames(false); doInsert(); }}
          />
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setDupNames(false)}>Back</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Supplier name"><Input required placeholder="Abu Bakar Traders" value={form.supplier_name} onChange={(e) => update('supplier_name', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company (optional)"><Input placeholder="Company" value={form.company_name} onChange={(e) => update('company_name', e.target.value)} /></Field>
            <Field label="Contact person"><Input placeholder="Person" value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><Input placeholder="0300 1234567" value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} /></Field>
            <Field label="WhatsApp"><Input placeholder="0300 1234567" value={form.whatsapp_number} onChange={(e) => update('whatsapp_number', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Channel (optional)"><Input placeholder="Channel" value={form.channel} onChange={(e) => update('channel', e.target.value)} /></Field>
            <Field label="Route (optional)"><Input placeholder="Route" value={form.route} onChange={(e) => update('route', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Opening balance"><Input type="number" min={0} step="0.01" value={form.opening_balance || ''} onChange={(e) => update('opening_balance', parseFloat(e.target.value) || 0)} /></Field>
            <Field label="Balance type">
              <select className="w-full rounded-lg border border-slate-300 bg-white h-10 px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={form.opening_balance_type} onChange={(e) => update('opening_balance_type', e.target.value)}>
                <option value="shop_owes">Shop owes supplier</option>
                <option value="supplier_owes">Supplier owes shop</option>
              </select>
            </Field>
          </div>
          <Field label="City (optional)"><Input placeholder="Karachi" value={form.city} onChange={(e) => update('city', e.target.value)} /></Field>
          <Field label="Notes (optional)"><Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saving || checking}>Save Supplier</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
