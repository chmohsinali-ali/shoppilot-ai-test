import { useEffect, useState, useMemo, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, Plus, Phone, Wallet, ArrowRight, User, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/format';
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
  const [deactivateTarget, setDeactivateTarget] = useState<CustomerWithBalance | null>(null);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
            >
              <Link to={`/customers/${c.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{c.full_name}</p>
                      {c.business_name && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.business_name}</p>}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-500" />
                </div>
                <div className="mt-3 space-y-1.5">
                  {c.primary_phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Phone className="h-3.5 w-3.5" /> {c.primary_phone}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Balance</span>
                    <span className={`text-sm font-semibold ${c.balance > 0 ? 'text-amber-600 dark:text-amber-400' : c.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {formatMoney(c.balance, shop?.currency)}
                    </span>
                  </div>
                </div>
              </Link>
              {/* Edit / Deactivate buttons */}
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button size="sm" variant="outline" onClick={() => setEditTarget(c)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeactivateTarget(c)}>
                  <Trash2 className="h-3.5 w-3.5" /> Deactivate
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddCustomerModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      {editTarget && (
        <EditCustomerModal
          customer={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
      {deactivateTarget && (
        <DeactivateCustomerModal
          customer={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

function AddCustomerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    business_name: '',
    primary_phone: '',
    whatsapp_number: '',
    customer_type: 'retail',
    address_line1: '',
    city: '',
    notes: '',
    opening_balance: 0,
    opening_balance_type: 'customer_owes',
  });

  const update = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => setForm({
    full_name: '', business_name: '', primary_phone: '', whatsapp_number: '',
    customer_type: 'retail', address_line1: '', city: '', notes: '',
    opening_balance: 0, opening_balance_type: 'customer_owes',
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const { error } = await supabase.from('customers').insert({
      shop_id: shop.id,
      full_name: form.full_name,
      business_name: form.business_name || null,
      primary_phone: form.primary_phone || null,
      whatsapp_number: form.whatsapp_number || null,
      customer_type: form.customer_type,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      notes: form.notes || null,
      opening_balance: form.opening_balance,
      opening_balance_type: form.opening_balance_type,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }

    if (form.opening_balance > 0 && form.opening_balance_type === 'customer_owes') {
      await supabase.from('customer_ledger').insert({
        shop_id: shop.id,
        customer_id: (await supabase.from('customers').select('id').eq('shop_id', shop.id).eq('full_name', form.full_name).order('created_at', { ascending: false }).limit(1).maybeSingle()).data?.id,
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

  return (
    <Modal open={open} onClose={onClose} title="Add Customer" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <Input required placeholder="Mohsin Khan" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
        </Field>
        <Field label="Business name (optional)">
          <Input placeholder="Khan Trading Co." value={form.business_name} onChange={(e) => update('business_name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <Input placeholder="0300 1234567" value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input placeholder="0300 1234567" value={form.whatsapp_number} onChange={(e) => update('whatsapp_number', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer type">
            <Select value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="walk_in">Walk-in</option>
              <option value="regular">Regular</option>
              <option value="vip">VIP</option>
            </Select>
          </Field>
          <Field label="Opening balance">
            <Input type="number" min={0} step="0.01" value={form.opening_balance} onChange={(e) => update('opening_balance', parseFloat(e.target.value) || 0)} />
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
        <Field label="Address (optional)">
          <Input placeholder="House, street, area" value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} />
        </Field>
        <Field label="City (optional)">
          <Input placeholder="Karachi" value={form.city} onChange={(e) => update('city', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Customer</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: customer.full_name ?? '',
    business_name: customer.business_name ?? '',
    primary_phone: customer.primary_phone ?? '',
    whatsapp_number: customer.whatsapp_number ?? '',
    customer_type: customer.customer_type ?? 'retail',
    address_line1: customer.address_line1 ?? '',
    city: customer.city ?? '',
    notes: customer.notes ?? '',
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('customers').update({
      full_name: form.full_name,
      business_name: form.business_name || null,
      primary_phone: form.primary_phone || null,
      whatsapp_number: form.whatsapp_number || null,
      customer_type: form.customer_type,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', customer.id);
    if (error) { setSaving(false); toast('error', error.message); return; }
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
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <Input required value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
        </Field>
        <Field label="Business name (optional)">
          <Input value={form.business_name} onChange={(e) => update('business_name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <Input value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp_number} onChange={(e) => update('whatsapp_number', e.target.value)} />
          </Field>
        </div>
        <Field label="Customer type">
          <Select value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="walk_in">Walk-in</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
          </Select>
        </Field>
        <Field label="Address (optional)">
          <Input value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} />
        </Field>
        <Field label="City (optional)">
          <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeactivateCustomerModal({ customer, onClose, onDone }: { customer: CustomerWithBalance; onClose: () => void; onDone: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const hasBalance = Math.abs(customer.balance) > 0.01;

  const confirm = async () => {
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('customers').update({
      deleted_at: new Date().toISOString(),
      status: 'inactive',
      updated_at: new Date().toISOString(),
    }).eq('id', customer.id);
    if (error) { setSaving(false); toast('error', error.message); return; }
    await supabase.from('audit_logs').insert({
      shop_id: shop.id, user_id: user.id, action: 'customer.deactivate',
      entity_type: 'customer', entity_id: customer.id,
      metadata: { name: customer.full_name, balance: customer.balance },
    });
    setSaving(false);
    toast('success', `${customer.full_name} has been deactivated. Historical invoices and ledger entries remain intact.`);
    onClose();
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Deactivate Customer" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to deactivate <span className="font-semibold">{customer.full_name}</span>?
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This is a soft delete — the customer will be hidden from your active list, but all historical invoices and ledger entries will remain fully visible and intact.
        </p>
        {hasBalance && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">Warning: Outstanding balance</p>
            <p className="mt-1">This customer has an outstanding balance of <span className="font-bold">{formatMoney(customer.balance, shop?.currency)}</span>. Deactivating will not affect this balance — it will remain recoverable.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={confirm} loading={saving}>
            <Trash2 className="h-4 w-4" /> Deactivate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
