import { useEffect, useState, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Phone, MessageCircle, MapPin, Wallet,
  Plus, ShoppingBag, ArrowDownLeft, Receipt, Trash2, Sparkles, AlertTriangle,
  CheckCircle2, UserMinus, Undo2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner, PageLoader } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDate, formatDateCompact } from '@/lib/format';
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
  const [saleItemCounts, setSaleItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<LedgerEntry | null>(null);
  const [reverseTarget, setReverseTarget] = useState<LedgerEntry | null>(null);

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

    // Item count per sale, for the compact "Sale · N items" description —
    // the main ledger never shows individual products or the internal
    // invoice number; that detail lives on the dedicated Sale page.
    const saleIds = [...new Set(
      ledgerRows.filter((e) => e.reference_type === 'sale' || e.reference_type === 'sale_cancel').map((e) => e.reference_id).filter((v): v is string => !!v)
    )];
    if (saleIds.length > 0) {
      const { data: itemsData } = await supabase.from('sale_items').select('sale_id').in('sale_id', saleIds);
      const counts: Record<string, number> = {};
      for (const row of (itemsData ?? []) as { sale_id: string }[]) counts[row.sale_id] = (counts[row.sale_id] ?? 0) + 1;
      setSaleItemCounts(counts);
    } else {
      setSaleItemCounts({});
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

      {/* Ledger History — single source of truth for all customer activity.
          Accounting-style table: Date | Description | Amount | Balance.
          The running balance lives ONLY in the Balance column — it is
          never repeated underneath each transaction's amount. */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="flex flex-wrap items-baseline gap-x-2 font-semibold text-slate-900 dark:text-slate-100">
              Ledger History
              <span className="font-normal text-slate-400">/</span>
              <span dir="rtl" lang="ur" className="text-sm font-normal text-slate-500 dark:text-slate-400">کھاتے کی تفصیل</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">All transactions — sales, payments, returns, and adjustments</p>
          </div>
        </div>
        {ledger.length === 0 ? (
          <EmptyState icon={<Receipt className="h-7 w-7" />} title="No ledger entries" description="Transactions will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
                <tr>
                  <th className="px-3 py-2.5 font-medium sm:px-5">Date</th>
                  <th className="px-3 py-2.5 font-medium sm:px-5">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium sm:px-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ledger.map((e) => {
                  const info = ledgerRowInfo(e, saleItemCounts, setPaymentDetails);
                  const isDebit = Number(e.debit_amount) > 0;
                  const amount = isDebit ? Number(e.debit_amount) : Number(e.credit_amount);
                  const rowMuted = info.muted;
                  const descNode = (
                    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span aria-hidden="true">{info.icon}</span>
                      <span className="truncate">{info.label}</span>
                      {info.labelUr && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">/</span>
                          <span dir="rtl" lang="ur" className="text-xs font-normal text-slate-400 dark:text-slate-500">{info.labelUr}</span>
                        </>
                      )}
                      {e.reversed_at && (
                        <span className="flex-shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          Reversed
                        </span>
                      )}
                    </span>
                  );
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${rowMuted ? 'opacity-60' : ''}`}>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400 sm:px-5">
                        {formatDateCompact(e.transaction_date)}
                      </td>
                      <td className="max-w-[9rem] px-3 py-3 sm:max-w-none sm:px-5">
                        {info.link ? (
                          <Link to={info.link} className={`text-sm font-medium hover:underline ${rowMuted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {descNode}
                          </Link>
                        ) : info.onClick ? (
                          <button type="button" onClick={info.onClick} className={`text-sm font-medium hover:underline ${rowMuted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {descNode}
                          </button>
                        ) : (
                          <span className={`text-sm ${rowMuted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{descNode}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-5">
                        {rowMuted ? (
                          <span className="text-slate-400 dark:text-slate-500">{isDebit ? '+' : '−'}{formatMoney(amount, cur)}</span>
                        ) : isDebit ? (
                          <span className="text-amber-600 dark:text-amber-400">+{formatMoney(amount, cur)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">−{formatMoney(amount, cur)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td colSpan={2} className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:px-5">Total Balance</td>
                  <td className="whitespace-nowrap bg-emerald-50 px-3 py-3 text-right font-bold text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 sm:px-5">
                    {formatMoney(balance, cur)}
                  </td>
                </tr>
              </tfoot>
            </table>
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
      {paymentDetails && (
        <PaymentDetailsModal
          entry={paymentDetails}
          previousBalance={previousBalanceFor(ledger, paymentDetails)}
          cur={cur}
          onClose={() => setPaymentDetails(null)}
          onReverse={() => { setReverseTarget(paymentDetails); setPaymentDetails(null); }}
        />
      )}
      {reverseTarget && (
        <ReversePaymentModal
          entry={reverseTarget}
          balance={balance}
          cur={cur}
          onClose={() => setReverseTarget(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

// Previous running balance for a payment — read directly from the ledger
// entry immediately before it (0 if it's the very first entry), never
// recomputed independently: this is still just the backend's own
// running_balance values, only picking out the one from one row earlier.
function previousBalanceFor(ledger: LedgerEntry[], entry: LedgerEntry): number {
  const idx = ledger.findIndex((e) => e.id === entry.id);
  if (idx <= 0) return 0;
  return Number(ledger[idx - 1].running_balance);
}

type LedgerRowInfo = {
  icon: string;
  label: string;
  labelUr?: string;
  link: string | null;
  onClick: (() => void) | null;
  muted: boolean;
};

function ledgerRowInfo(
  e: LedgerEntry,
  saleItemCounts: Record<string, number>,
  onPaymentClick?: (entry: LedgerEntry) => void
): LedgerRowInfo {
  switch (e.entry_type) {
    case 'CREDIT_SALE': {
      const n = e.reference_id ? saleItemCounts[e.reference_id] : undefined;
      return { icon: '🛒', label: n ? `Sale · ${n} item${n === 1 ? '' : 's'}` : 'Sale', link: e.reference_id ? `/sales/${e.reference_id}` : null, onClick: null, muted: false };
    }
    case 'SALE_CANCEL':
      return { icon: '🛒', label: 'Sale Cancelled', link: e.reference_id ? `/sales/${e.reference_id}` : null, onClick: null, muted: true };
    case 'SALE_RETURN':
      return { icon: '↩️', label: 'Return', link: e.reference_id ? `/returns?type=sale&id=${e.reference_id}` : null, onClick: null, muted: false };
    case 'CUSTOMER_PAYMENT':
      return { icon: '💵', label: 'Payment Received', labelUr: 'رقم آ گئی', link: null, onClick: onPaymentClick ? () => onPaymentClick(e) : null, muted: !!e.reversed_at };
    case 'CUSTOMER_PAYMENT_REVERSAL':
      return { icon: '↩️', label: 'Payment Reversal', link: null, onClick: null, muted: true };
    case 'OPENING_BALANCE':
      return { icon: '📖', label: 'Opening Balance', link: null, onClick: null, muted: false };
    case 'ADJUSTMENT':
      return { icon: '✏️', label: 'Adjustment', link: null, onClick: null, muted: false };
    default:
      return { icon: '•', label: e.entry_type.replace(/_/g, ' ').toLowerCase(), link: null, onClick: null, muted: false };
  }
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

function BilingualLabel({ en, ur }: { en: string; ur: string }) {
  return (
    <span className="inline-flex flex-shrink-0 items-baseline gap-x-1.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
      {en}
      <span className="text-slate-300 dark:text-slate-600">/</span>
      <span dir="rtl" lang="ur">{ur}</span>
    </span>
  );
}

function PaymentDetailsModal({
  entry, previousBalance, cur, onClose, onReverse,
}: { entry: LedgerEntry; previousBalance: number; cur: string; onClose: () => void; onReverse: () => void }) {
  return (
    <Modal open={true} onClose={onClose} title="Payment Details" size="sm">
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-xs text-slate-400">{formatDate(entry.transaction_date)}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">💵 Payment</p>
          {entry.reversed_at && (
            <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Reversed
            </span>
          )}
        </div>
        <div className="space-y-2 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="flex justify-between text-sm">
            <BilingualLabel en="Payment Received" ur="رقم آ گئی" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(Number(entry.credit_amount), cur)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <BilingualLabel en="Previous Balance" ur="پچھلا بیلنس" />
            <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(previousBalance, cur)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
            <BilingualLabel en="Remaining Balance" ur="باقی بیلنس" />
            <span className="font-semibold text-emerald-800 dark:text-emerald-400">{formatMoney(Number(entry.running_balance), cur)}</span>
          </div>
        </div>
        {entry.description && <p className="text-xs text-slate-400">{entry.description}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {!entry.reversed_at && (
            <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onReverse}>
              <Undo2 className="h-4 w-4" /> Reverse Payment
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReversePaymentModal({
  entry, balance, cur, onClose, onDone,
}: { entry: LedgerEntry; balance: number; cur: string; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const afterReversal = balance + Number(entry.credit_amount);

  const confirm = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.rpc('reverse_customer_payment', {
      p_ledger_entry_id: entry.id,
      p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Payment reversed.');
    onClose();
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Reverse Payment?" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This will undo the payment below without deleting it — it stays on the ledger, marked as reversed.
        </p>
        <div className="space-y-2 rounded-lg bg-amber-50 p-4 text-sm dark:bg-amber-950/20">
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Payment</span><span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(Number(entry.credit_amount), cur)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Current Balance</span><span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(balance, cur)}</span></div>
          <div className="flex justify-between border-t border-amber-200 pt-2 dark:border-amber-900"><span className="text-slate-500 dark:text-slate-400">After Reversal</span><span className="font-semibold text-amber-700 dark:text-amber-400">{formatMoney(afterReversal, cur)}</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={confirm} loading={saving}>
            <Undo2 className="h-4 w-4" /> Reverse Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
