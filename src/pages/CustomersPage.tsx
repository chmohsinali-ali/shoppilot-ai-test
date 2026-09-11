import { useEffect, useState, useMemo, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Plus, User, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, FieldWarning } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, bilingualName } from '@/lib/format';
import { EmbeddedPartyPicker } from '@/components/EmbeddedPartyPicker';
import { NameAutocomplete } from '@/components/NameAutocomplete';
import { findExactNameMatches, phoneAlreadyUsed, isDuplicatePhoneError, DUPLICATE_PHONE_MESSAGE_CUSTOMER } from '@/lib/partyValidation';
import type { Customer } from '@/types/db';

type CustomerWithBalance = Customer & { balance: number };

export function CustomersPage() {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerWithBalance | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<CustomerWithBalance | null>(null);
  const [actionsTarget, setActionsTarget] = useState<CustomerWithBalance | null>(null);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shop.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      toast('error', 'Could not load customers.');
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Customer[];
    const withBalance = await Promise.all(
      rows.map(async (c) => {
        const { data: bal } = await supabase.rpc('get_customer_balance', { p_customer_id: c.id });
        return { ...c, balance: Number(bal ?? 0) };
      })
    );
    setCustomers(withBalance);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.primary_phone?.toLowerCase().includes(q) ||
        c.business_name?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers in your shop`}
        action={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search by name, phone, business..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={search ? 'No matching customers' : 'No customers yet'}
            description={search ? 'Try a different search term.' : 'Add your first customer to start recording sales and ledgers.'}
            action={!search && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Customer</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => (
                  <CustomerRow key={c.id} customer={c} currency={shop?.currency} onOpenActions={() => setActionsTarget(c)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-400 dark:border-slate-800">
            Tap a customer to open their ledger — press and hold for Edit/Delete.
          </p>
        </Card>
      )}
      {actionsTarget && (
        <CustomerRowActionsMenu
          customer={actionsTarget}
          onClose={() => setActionsTarget(null)}
          onEdit={() => { setEditTarget(actionsTarget); setActionsTarget(null); }}
          onPermanentDelete={() => { setPermanentDeleteTarget(actionsTarget); setActionsTarget(null); }}
        />
      )}

      <AddCustomerModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      {editTarget && (
        <EditCustomerModal
          customer={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
      {permanentDeleteTarget && (
        <PermanentDeleteCustomerModal
          customer={permanentDeleteTarget}
          onClose={() => setPermanentDeleteTarget(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

// Tap the row -> open the customer's ledger. Press and hold (mouse or
// touch, ~500ms) -> open Edit/Deactivate instead, without navigating.
const LONG_PRESS_MS = 500;

function CustomerRow({
  customer, currency, onOpenActions,
}: { customer: CustomerWithBalance; currency?: string; onOpenActions: () => void }) {
  const navigate = useNavigate();
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onOpenActions();
    }, LONG_PRESS_MS);
  };
  const clearPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const handleClick = () => {
    if (longPressed.current) { longPressed.current = false; return; }
    navigate(`/customers/${customer.id}`);
  };

  return (
    <tr
      className="cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/50"
      onPointerDown={startPress}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => { e.preventDefault(); onOpenActions(); }}
      onClick={handleClick}
    >
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-slate-100">
              {customer.full_name}
              {customer.full_name_ur && (
                <>
                  <span className="mx-1 font-normal text-slate-300 dark:text-slate-600">/</span>
                  <span dir="rtl" lang="ur" className="font-normal text-slate-500 dark:text-slate-400">{customer.full_name_ur}</span>
                </>
              )}
            </p>
            {customer.primary_phone && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{customer.primary_phone}</p>
            )}
          </div>
        </div>
      </td>
      <td className={`px-4 py-3 text-right font-semibold ${customer.balance > 0 ? 'text-amber-600 dark:text-amber-400' : customer.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {formatMoney(customer.balance, currency)}
      </td>
    </tr>
  );
}

function CustomerRowActionsMenu({
  customer, onClose, onEdit, onPermanentDelete,
}: { customer: CustomerWithBalance; onClose: () => void; onEdit: () => void; onPermanentDelete: () => void }) {
  return (
    <Modal open={true} onClose={onClose} title={bilingualName(customer.full_name, customer.full_name_ur)} size="sm">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/50"
        >
          <Pencil className="h-4 w-4 text-slate-500 dark:text-slate-400" /> Edit
        </button>
        <button
          type="button"
          onClick={onPermanentDelete}
          className="flex w-full items-center gap-3 rounded-lg border border-red-200 p-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-4 w-4" /> Permanent Delete
        </button>
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddCustomerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dupNames, setDupNames] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    full_name_ur: '',
    primary_phone: '',
    customer_type: 'retail',
    address_line1: '',
    opening_balance: 0,
    opening_balance_type: 'customer_owes',
  });

  const update = (k: string, v: string | number) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'full_name' && typeof v === 'string' && v.trim()) setNameError(false);
    if (k === 'primary_phone' && typeof v === 'string' && v.trim()) setPhoneError(false);
  };

  const reset = () => {
    setForm({
      full_name: '', full_name_ur: '', primary_phone: '',
      customer_type: 'retail', address_line1: '',
      opening_balance: 0, opening_balance_type: 'customer_owes',
    });
    setDupNames(false);
  };

  const doInsert = async () => {
    if (!shop) return;
    if (!form.primary_phone.trim()) { toast('error', 'Customer ka phone number likhein.'); return; }
    const used = await phoneAlreadyUsed('customers', shop.id, form.primary_phone);
    if (used) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }

    setSaving(true);
    const { data, error } = await supabase.from('customers').insert({
      shop_id: shop.id,
      full_name: form.full_name,
      full_name_ur: form.full_name_ur || null,
      primary_phone: form.primary_phone,
      customer_type: form.customer_type,
      address_line1: form.address_line1 || null,
      opening_balance: form.opening_balance,
      opening_balance_type: form.opening_balance_type,
    }).select('id').maybeSingle();
    setSaving(false);
    if (error) {
      if (isDuplicatePhoneError(error)) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }
      toast('error', error.message);
      return;
    }

    if (form.opening_balance > 0 && form.opening_balance_type === 'customer_owes' && data) {
      await supabase.from('customer_ledger').insert({
        shop_id: shop.id,
        customer_id: data.id,
        entry_type: 'OPENING_BALANCE',
        description: 'Opening balance',
        debit_amount: form.opening_balance,
        running_balance: form.opening_balance,
      });
    }

    toast('success', 'Customer added.');
    reset();
    onClose();
    onCreated();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    const missingName = !form.full_name.trim();
    const missingPhone = !form.primary_phone.trim();
    setNameError(missingName);
    setPhoneError(missingPhone);
    if (missingName || missingPhone) return;
    setChecking(true);
    const matches = await findExactNameMatches('customers', 'full_name', shop.id, form.full_name);
    setChecking(false);
    if (matches > 0) { setDupNames(true); return; }
    await doInsert();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Add Customer" size="md">
      {dupNames ? (
        <div className="space-y-3">
          <p dir="rtl" className="rounded-lg bg-amber-50 px-3 py-2.5 text-right text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            "{bilingualName(form.full_name, form.full_name_ur)}" نام کے کسٹمر پہلے سے موجود ہیں۔ نیچے نام، نمبر اور بیلنس دیکھ کر تصدیق کریں کہ کون سا کسٹمر ہے، یا نیچے "نیا کسٹمر شامل کریں" سے نیا کسٹمر بنائیں۔
          </p>
          <EmbeddedPartyPicker
            kind="customer"
            shopId={shop!.id}
            currency={shop?.currency}
            initialSearch={form.full_name}
            onSelect={(chosen) => { onClose(); navigate(`/customers/${chosen.id}`); }}
            onAddNew={() => { setDupNames(false); doInsert(); }}
          />
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setDupNames(false)}>Back</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <NameAutocomplete
            required
            error={nameError}
            placeholder="Mohsin Ali"
            value={form.full_name}
            onChange={(v) => update('full_name', v)}
            urValue={form.full_name_ur}
            onUrChange={(v) => update('full_name_ur', v)}
          />
          <Field label="Phone Number *">
            <div className="relative">
              <FieldWarning show={phoneError} message="فون نمبر لکھنا ضروری ہے" />
              <Input placeholder="0300 1234567" value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer Type">
              <Select value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="walk_in">Walk-in</option>
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
              </Select>
            </Field>
            <Field label="Opening Balance">
              <Input type="number" min={0} step="0.01" value={form.opening_balance || ''} placeholder="0" onChange={(e) => update('opening_balance', parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
          {form.opening_balance > 0 && (
            <Field label="Opening balance type">
              <Select value={form.opening_balance_type} onChange={(e) => update('opening_balance_type', e.target.value)}>
                <option value="customer_owes">Customer owes shop</option>
                <option value="shop_owes">Shop owes customer</option>
              </Select>
            </Field>
          )}
          <Field label="Address">
            <Input placeholder="Model Town, Bahawalpur" value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saving || checking}>Save Customer</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [form, setForm] = useState({
    full_name: customer.full_name ?? '',
    full_name_ur: customer.full_name_ur ?? '',
    primary_phone: customer.primary_phone ?? '',
    customer_type: customer.customer_type ?? 'retail',
    address_line1: customer.address_line1 ?? '',
  });

  const update = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'full_name' && v.trim()) setNameError(false);
    if (k === 'primary_phone' && v.trim()) setPhoneError(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    const missingName = !form.full_name.trim();
    const missingPhone = !form.primary_phone.trim();
    setNameError(missingName);
    setPhoneError(missingPhone);
    if (missingName || missingPhone) return;
    const used = await phoneAlreadyUsed('customers', shop.id, form.primary_phone, customer.id);
    if (used) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }

    setSaving(true);
    const { error } = await supabase.from('customers').update({
      full_name: form.full_name,
      full_name_ur: form.full_name_ur || null,
      primary_phone: form.primary_phone,
      customer_type: form.customer_type,
      address_line1: form.address_line1 || null,
      updated_at: new Date().toISOString(),
    }).eq('id', customer.id);
    if (error) {
      setSaving(false);
      if (isDuplicatePhoneError(error)) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }
      toast('error', error.message);
      return;
    }
    await supabase.from('audit_logs').insert({
      shop_id: shop.id, user_id: user.id, action: 'customer.update',
      entity_type: 'customer', entity_id: customer.id,
      metadata: { name: form.full_name },
    });
    setSaving(false);
    toast('success', 'Customer updated.');
    onClose();
    onSaved();
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Customer" size="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <NameAutocomplete
          required
          error={nameError}
          value={form.full_name}
          onChange={(v) => update('full_name', v)}
          urValue={form.full_name_ur}
          onUrChange={(v) => update('full_name_ur', v)}
        />
        <Field label="Phone Number *">
          <div className="relative">
            <FieldWarning show={phoneError} message="فون نمبر لکھنا ضروری ہے" />
            <Input value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} />
          </div>
        </Field>
        <Field label="Customer Type">
          <Select value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="walk_in">Walk-in</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
          </Select>
        </Field>
        <Field label="Address">
          <Input value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

function PermanentDeleteCustomerModal({ customer, onClose, onDone }: { customer: CustomerWithBalance; onClose: () => void; onDone: () => void }) {
  const { shop } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const hasBalance = Math.abs(customer.balance) > 0.01;
  const matches = confirmText.trim().toLowerCase() === customer.full_name.trim().toLowerCase();

  const confirm = async () => {
    if (!matches) return;
    setSaving(true);
    const { error } = await supabase.rpc('permanently_delete_customer', { p_customer_id: customer.id });
    if (error) { setSaving(false); toast('error', error.message); return; }
    setSaving(false);
    toast('success', `${bilingualName(customer.full_name, customer.full_name_ur)} and all their history have been permanently deleted.`);
    onClose();
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Permanently Delete Customer" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">This cannot be undone.</p>
          <p className="mt-1">
            <span className="font-semibold">{bilingualName(customer.full_name, customer.full_name_ur)}</span> and every sale, return, warranty, and
            ledger entry linked to them will be deleted forever.
          </p>
        </div>
        {hasBalance && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">Outstanding balance: {formatMoney(customer.balance, shop?.currency)}</p>
            <p className="mt-1">This balance will be deleted along with everything else, not settled.</p>
          </div>
        )}
        <Field label={`Type "${customer.full_name}" to confirm`}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={customer.full_name} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
            onClick={confirm}
            loading={saving}
            disabled={!matches}
          >
            <Trash2 className="h-4 w-4" /> Permanently Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
