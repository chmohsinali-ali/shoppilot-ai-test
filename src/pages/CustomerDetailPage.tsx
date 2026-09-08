import { useEffect, useState, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Phone, MessageCircle, MapPin, Wallet,
  Plus, ShoppingBag, ArrowDownLeft, Receipt, Trash2, Link as LinkIcon, Sparkles, AlertTriangle,
  CheckCircle2, UserMinus,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner, PageLoader } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDateCompact, formatSaleRef } from '@/lib/format';
import { phoneAlreadyUsed, isDuplicatePhoneError, DUPLICATE_PHONE_MESSAGE_CUSTOMER } from '@/lib/partyValidation';
import type { Customer, LedgerEntry } from '@/types/db';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { shop } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [saleRefs, setSaleRefs] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);

  const load = async () => {
    if (!shop || !id) return;
    setLoading(true);
    const [cust, ledg, bal] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('customer_ledger').select('*').eq('customer_id', id)
        .order('transaction_date', { ascending: true }).order('created_at', { ascending: true }),
      supabase.rpc('get_customer_balance', { p_customer_id: id }),
    ]);
    setCustomer(cust.data as Customer | null);
    const ledgerRows = (ledg.data ?? []) as LedgerEntry[];
    setLedger(ledgerRows);
    setBalance(Number(bal.data ?? 0));
    setLoading(false);

    // Look up the short S1/S2/... reference for any ledger row that points
    // at a sale — the ledger itself only stores the long invoice_number.
    const saleIds = [...new Set(
      ledgerRows.filter((e) => e.reference_type === 'sale' || e.reference_type === 'sale_cancel').map((e) => e.reference_id).filter((v): v is string => !!v)
    )];
    if (saleIds.length > 0) {
      const { data: salesData } = await supabase.from('sales').select('id, display_seq').in('id', saleIds);
      const map: Record<string, number | null> = {};
      for (const s of (salesData ?? []) as { id: string; display_seq: number | null }[]) map[s.id] = s.display_seq;
      setSaleRefs(map);
    } else {
      setSaleRefs({});
    }
  };

  useEffect(() => { load(); }, [shop, id]);

  if (loading) return <PageLoader />;
  if (!customer) return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <EmptyState icon={<User className="h-8 w-8" />} title="Customer not found" />
    </div>
  );

  const cur = shop?.currency ?? 'PKR';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={() => navigate('/customers')} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </button>

      <Card className="mb-6 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <User className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">{customer.full_name}</h1>
              {customer.business_name && <p className="text-sm text-slate-500 dark:text-slate-400">{customer.business_name}</p>}
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                {customer.primary_phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{customer.primary_phone}</span>}
                {customer.whatsapp_number && <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{customer.whatsapp_number}</span>}
                {customer.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{customer.city}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowEdit(true)}><CheckCircle2 className="h-4 w-4" /> Added</Button>
            <Button
              variant="outline"
              onClick={() => setShowActionsMenu(true)}
              className="px-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              aria-label="Deactivate or permanently delete customer"
              title="Deactivate or permanently delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setShowPay(true)}>
              <Wallet className="h-4 w-4" /> Receive Payment
            </Button>
            <Link to={`/assistant?customerId=${customer.id}&customerName=${encodeURIComponent(customer.full_name)}`}>
              <Button variant="outline"><Sparkles className="h-4 w-4" /> AI Chat</Button>
            </Link>
            <Link to={`/sales/new?customer=${customer.id}`}>
              <Button><ShoppingBag className="h-4 w-4" /> New Sale</Button>
            </Link>
          </div>
        </div>
        <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <span className="flex-shrink-0 text-sm text-slate-600 dark:text-slate-300">Current Balance</span>
          <span className={`flex-shrink-0 text-lg font-bold ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {formatMoney(balance, cur)}
          </span>
        </div>
      </Card>

      {/* Ledger History — single source of truth for all customer activity */}
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Ledger History</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">All transactions — sales, payments, returns, and adjustments</p>
          </div>
        </div>
        {ledger.length === 0 ? (
          <EmptyState icon={<Receipt className="h-7 w-7" />} title="No ledger entries" description="Transactions will appear here." />
        ) : (
          // Stacked rows, not a wide table — every phone width shows the full
          // date, reference, entry type, amount, AND the resulting balance
          // for that transaction without any horizontal scrolling needed.
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {ledger.map((e) => {
              const isDebit = Number(e.debit_amount) > 0;
              const refLink = ledgerRefLink(e);
              const isSaleRef = (e.reference_type === 'sale' || e.reference_type === 'sale_cancel') && e.reference_id;
              const refLabel = isSaleRef
                ? formatSaleRef(saleRefs[e.reference_id as string], e.reference_number ?? e.reference_type ?? '—')
                : (e.reference_number ?? e.reference_type ?? '—');
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <EntryBadge type={e.entry_type} />
                      {refLink ? (
                        <Link to={refLink} className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                          <LinkIcon className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{refLabel}</span>
                        </Link>
                      ) : (
                        <span className="truncate text-sm text-slate-600 dark:text-slate-300">{refLabel}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateCompact(e.transaction_date)}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {isDebit ? (
                      <p className="font-medium text-amber-600 dark:text-amber-400">+{formatMoney(Number(e.debit_amount), cur)}</p>
                    ) : (
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">−{formatMoney(Number(e.credit_amount), cur)}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Bal: {formatMoney(Number(e.running_balance), cur)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <PaymentModal open={showPay} onClose={() => setShowPay(false)} customer={customer} onDone={load} />
      {showEdit && <EditCustomerModal customer={customer} onClose={() => setShowEdit(false)} onSaved={load} />}
      {showActionsMenu && (
        <AccountActionsMenu
          onClose={() => setShowActionsMenu(false)}
          onDeactivate={() => { setShowActionsMenu(false); setShowDeactivate(true); }}
          onPermanentDelete={() => { setShowActionsMenu(false); setShowPermanentDelete(true); }}
        />
      )}
      {showDeactivate && <DeactivateCustomerModal customer={customer} balance={balance} onClose={() => setShowDeactivate(false)} onDone={() => navigate('/customers')} />}
      {showPermanentDelete && <PermanentDeleteCustomerModal customer={customer} balance={balance} onClose={() => setShowPermanentDelete(false)} onDone={() => navigate('/customers')} />}
    </div>
  );
}

function AccountActionsMenu({ onClose, onDeactivate, onPermanentDelete }: { onClose: () => void; onDeactivate: () => void; onPermanentDelete: () => void }) {
  return (
    <Modal open={true} onClose={onClose} title="Manage Customer" size="sm">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onDeactivate}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/50"
        >
          <UserMinus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span>
            Deactivate
            <span className="block text-xs font-normal text-slate-400">Hide from active list — history stays intact and recoverable.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onPermanentDelete}
          className="flex w-full items-center gap-3 rounded-lg border border-red-200 p-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <AlertTriangle className="h-4 w-4" />
          <span>
            Permanently Delete
            <span className="block text-xs font-normal text-red-400">Erases this customer and all their history forever. Cannot be undone.</span>
          </span>
        </button>
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
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
    if (form.primary_phone.trim()) {
      const used = await phoneAlreadyUsed('customers', shop.id, form.primary_phone, customer.id);
      if (used) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('customers').update({
      full_name: form.full_name, business_name: form.business_name || null,
      primary_phone: form.primary_phone || null, whatsapp_number: form.whatsapp_number || null,
      customer_type: form.customer_type, address_line1: form.address_line1 || null,
      city: form.city || null, notes: form.notes || null, updated_at: new Date().toISOString(),
    }).eq('id', customer.id);
    if (error) {
      setSaving(false);
      if (isDuplicatePhoneError(error)) { toast('error', DUPLICATE_PHONE_MESSAGE_CUSTOMER); return; }
      toast('error', error.message);
      return;
    }
    await supabase.from('audit_logs').insert({ shop_id: shop.id, user_id: user.id, action: 'customer.update', entity_type: 'customer', entity_id: customer.id, metadata: { name: form.full_name } });
    setSaving(false); toast('success', 'Customer updated.'); onClose(); onSaved();
  };
  return (
    <Modal open={true} onClose={onClose} title="Edit Customer" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input required value={form.full_name} onChange={(e) => update('full_name', e.target.value)} /></Field>
        <Field label="Business name (optional)"><Input value={form.business_name} onChange={(e) => update('business_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><Input value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp_number} onChange={(e) => update('whatsapp_number', e.target.value)} /></Field>
        </div>
        <Field label="Customer type">
          <Select value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}>
            <option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="walk_in">Walk-in</option><option value="regular">Regular</option><option value="vip">VIP</option>
          </Select>
        </Field>
        <Field label="Address (optional)"><Input value={form.address_line1} onChange={(e) => update('address_line1', e.target.value)} /></Field>
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

function DeactivateCustomerModal({ customer, balance, onClose, onDone }: { customer: Customer; balance: number; onClose: () => void; onDone: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const hasBalance = Math.abs(balance) > 0.01;
  const confirm = async () => {
    if (!shop || !user) return;
    setSaving(true);
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), status: 'inactive', updated_at: new Date().toISOString() }).eq('id', customer.id);
    if (error) { setSaving(false); toast('error', error.message); return; }
    await supabase.from('audit_logs').insert({ shop_id: shop.id, user_id: user.id, action: 'customer.deactivate', entity_type: 'customer', entity_id: customer.id, metadata: { name: customer.full_name, balance } });
    setSaving(false); toast('success', `${customer.full_name} has been deactivated.`); onClose(); onDone();
  };
  return (
    <Modal open={true} onClose={onClose} title="Deactivate Customer" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Are you sure you want to deactivate <span className="font-semibold">{customer.full_name}</span>?</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">This is a soft delete — the customer will be hidden from your active list, but all historical invoices and ledger entries will remain fully visible and intact.</p>
        {hasBalance && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">Warning: Outstanding balance</p>
            <p className="mt-1">This customer has an outstanding balance of <span className="font-bold">{formatMoney(balance, shop?.currency)}</span>. Deactivating will not affect this balance — it will remain recoverable.</p>
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

function PermanentDeleteCustomerModal({ customer, balance, onClose, onDone }: { customer: Customer; balance: number; onClose: () => void; onDone: () => void }) {
  const { shop } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const hasBalance = Math.abs(balance) > 0.01;
  const matches = confirmText.trim().toLowerCase() === customer.full_name.trim().toLowerCase();

  const confirm = async () => {
    if (!matches) return;
    setSaving(true);
    const { error } = await supabase.rpc('permanently_delete_customer', { p_customer_id: customer.id });
    if (error) { setSaving(false); toast('error', error.message); return; }
    setSaving(false); toast('success', `${customer.full_name} and all their history have been permanently deleted.`); onClose(); onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Permanently Delete Customer" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">This cannot be undone.</p>
          <p className="mt-1">
            <span className="font-semibold">{customer.full_name}</span> and every sale, return, warranty, and
            ledger entry linked to them will be deleted forever — nothing will remain, and the AI Assistant will
            never be able to bring up their data again, even if a new customer is added later.
          </p>
        </div>
        {hasBalance && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">Outstanding balance: {formatMoney(balance, shop?.currency)}</p>
            <p className="mt-1">This balance will be deleted along with everything else, not settled.</p>
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          If you just want to hide this customer while keeping their history, use <span className="font-medium">Deactivate</span> instead.
        </p>
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
            <AlertTriangle className="h-4 w-4" /> Permanently Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ open, onClose, customer, onDone }: { open: boolean; onClose: () => void; customer: Customer; onDone: () => void }) {
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
    const { data, error } = await supabase.rpc('receive_customer_payment', {
      p_shop_id: shop.id,
      p_customer_id: customer.id,
      p_amount: amount,
      p_method: method,
      p_reference: reference,
      p_notes: notes,
      p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', `Payment of ${formatMoney(amount, shop.currency)} received. New balance: ${formatMoney(Number(data), shop.currency)}`);
    setAmount(0); setReference(''); setNotes('');
    onClose();
    onDone();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Receive payment from ${customer.full_name}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount">
          <Input type="number" min={0.01} step="0.01" required value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Payment method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="mobile">Mobile / EasyPaisa</option>
          </Select>
        </Field>
        <Field label="Reference (optional)">
          <Input placeholder="Cheque no, transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}><ArrowDownLeft className="h-4 w-4" /> Receive</Button>
        </div>
      </form>
    </Modal>
  );
}

function ledgerRefLink(e: LedgerEntry): string | null {
  if (!e.reference_id) return null;
  switch (e.reference_type) {
    case 'sale':
    case 'sale_cancel':
      return `/sales/${e.reference_id}`;
    case 'sale_return':
      return `/returns?type=sale&id=${e.reference_id}`;
    default:
      return null;
  }
}

function EntryBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    CREDIT_SALE: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
    SALE_CANCEL: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    SALE_RETURN: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
    CUSTOMER_PAYMENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    OPENING_BALANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    ADJUSTMENT: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400',
  };
  const labels: Record<string, string> = {
    CREDIT_SALE: 'Sale',
    SALE_CANCEL: 'Cancel',
    SALE_RETURN: 'Return',
    CUSTOMER_PAYMENT: 'Payment',
    OPENING_BALANCE: 'Opening',
    ADJUSTMENT: 'Adjustment',
  };
  const cls = styles[type] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  const label = labels[type] ?? type.replace(/_/g, ' ').toLowerCase();
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>{label}</span>;
}
