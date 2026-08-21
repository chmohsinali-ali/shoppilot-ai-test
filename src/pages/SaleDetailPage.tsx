import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Store, CheckCircle2, XCircle, Pencil, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageLoader, EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDateTime } from '@/lib/format';
import type { Sale, SaleItem } from '@/types/db';

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { shop, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);

  // Inline edit mode — stays on this same page instead of navigating away.
  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<Array<{ key: string; product_id: string | null; product_name: string; unit: string; quantity: number; price: number }>>([]);
  const [editAmountPaid, setEditAmountPaid] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    if (!shop || !id) return;
    setLoading(true);
    const [s, it] = await Promise.all([
      supabase.from('sales').select('*').eq('id', id).maybeSingle(),
      supabase.from('sale_items').select('*').eq('sale_id', id).order('created_at'),
    ]);
    setSale(s.data as Sale | null);
    setItems((it.data ?? []) as SaleItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, id]);

  if (loading) return <PageLoader />;
  if (!sale) return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Sale not found" />
    </div>
  );

  const cur = shop?.currency ?? 'PKR';
  const isCancelled = sale.status === 'cancelled';

  const startEdit = () => {
    setEditLines(items.map((it) => ({
      key: it.id, product_id: it.product_id ?? null, product_name: it.product_name,
      unit: it.unit, quantity: Number(it.quantity), price: Number(it.price),
    })));
    setEditAmountPaid(Number(sale.amount_paid));
    setEditMode(true);
  };

  const updateEditLine = (key: string, field: 'quantity' | 'price' | 'product_name' | 'unit', value: string) => {
    setEditLines((lines) => lines.map((l) => (l.key === key ? { ...l, [field]: (field === 'quantity' || field === 'price') ? Number(value) || 0 : value } : l)));
  };

  const removeEditLine = (key: string) => setEditLines((lines) => lines.filter((l) => l.key !== key));

  const addEditLine = () => setEditLines((lines) => [...lines, { key: Math.random().toString(36).slice(2), product_id: null, product_name: '', unit: 'piece', quantity: 1, price: 0 }]);

  const editGrandTotal = editLines.reduce((s, l) => s + l.quantity * l.price, 0) - Number(sale.discount_total);

  const saveEdit = async () => {
    if (!user || !sale) return;
    if (editLines.some((l) => !l.product_name.trim() || l.quantity <= 0)) {
      toast('error', 'Every item needs a name and a quantity greater than 0.');
      return;
    }
    setSavingEdit(true);
    // Reverse the original invoice (stock + customer ledger), then save the
    // corrected version — all without leaving this page.
    const { error: cancelErr } = await supabase.rpc('cancel_sale', {
      p_sale_id: sale.id, p_reason: 'Edited in place — replaced by corrected invoice', p_user_id: user.id,
    });
    if (cancelErr) { setSavingEdit(false); toast('error', cancelErr.message); return; }

    const itemsJson = editLines.map((l) => ({
      product_id: l.product_id ?? '', product_name: l.product_name, unit: l.unit,
      quantity: l.quantity, price: l.price, discount: 0, tax_rate: 0,
    }));
    const { data: newId, error: createErr } = await supabase.rpc('create_sale', {
      p_shop_id: sale.shop_id, p_customer_id: sale.customer_id, p_customer_name: sale.customer_name ?? 'Walk-in',
      p_sale_date: new Date().toISOString(), p_items: itemsJson, p_discount_total: Number(sale.discount_total),
      p_tax_total: Number(sale.tax_total), p_amount_paid: editAmountPaid, p_payment_method: sale.payment_method,
      p_notes: sale.notes ?? '', p_user_id: user.id,
    });
    if (createErr) { setSavingEdit(false); toast('error', createErr.message); return; }

    await supabase.from('sales').update({ superseded_by_sale_id: newId }).eq('id', sale.id);
    setSavingEdit(false);
    setEditMode(false);
    toast('success', 'Invoice updated.');
    // Same page component, just now showing the corrected invoice —
    // feels like an in-place edit rather than a jump to a new page.
    navigate(`/sales/${newId}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate('/sales')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex gap-2">
          {!isCancelled && !editMode && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setShowCancel(true)}>
                <XCircle className="h-4 w-4" /> Cancel Sale
              </Button>
            </>
          )}
          {!editMode && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
        </div>
      </div>

      {editMode && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <Pencil className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Editing this invoice right here. Change any quantity, price, or item below, then save — the original will be kept as cancelled history.</p>
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Receipt header */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5 text-center dark:border-slate-800 dark:bg-slate-800/50">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{shop?.name}</h1>
          {shop?.address && <p className="text-xs text-slate-500 dark:text-slate-400">{shop.address}</p>}
          {shop?.phone && <p className="text-xs text-slate-500 dark:text-slate-400">Tel: {shop.phone}</p>}
        </div>

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="border-b border-slate-200 bg-slate-100 px-6 py-3 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">This sale has been cancelled</p>
                {sale.cancellation_reason && <p className="text-xs text-slate-500 dark:text-slate-400">Reason: {sale.cancellation_reason}</p>}
              </div>
            </div>
            {sale.superseded_by_sale_id && (
              <Link to={`/sales/${sale.superseded_by_sale_id}`} className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                Replaced by invoice <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        {/* Invoice meta */}
        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Invoice</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{sale.invoice_number}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Date</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{formatDateTime(sale.sale_date)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Customer</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{sale.customer_name ?? 'Walk-in'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
            {isCancelled ? (
              <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Cancelled
              </span>
            ) : (
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                sale.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                : sale.payment_status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
              }`}>
                {sale.payment_status.charAt(0).toUpperCase() + sale.payment_status.slice(1)}
              </span>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="px-6 py-4">
          {!editMode ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2.5">
                      <div className="flex items-baseline gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{it.product_name}</p>
                        {it.product_name_ur && <p dir="rtl" className="text-sm text-slate-500 dark:text-slate-400">{it.product_name_ur}</p>}
                      </div>
                      <p className="text-xs text-slate-500">{it.unit}</p>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{it.quantity} {it.unit}</td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{formatMoney(Number(it.price), cur)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">{formatMoney(Number(it.line_total), cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="space-y-2">
              {editLines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={l.product_name} placeholder="Item name"
                    onChange={(e) => updateEditLine(l.key, 'product_name', e.target.value)}
                  />
                  <input
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                    type="number" min={0} step="any" value={l.quantity}
                    onChange={(e) => updateEditLine(l.key, 'quantity', e.target.value)}
                  />
                  <input
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={l.unit} placeholder="unit"
                    onChange={(e) => updateEditLine(l.key, 'unit', e.target.value)}
                  />
                  <input
                    className="w-24 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                    type="number" min={0} step="any" value={l.price}
                    onChange={(e) => updateEditLine(l.key, 'price', e.target.value)}
                  />
                  <span className="w-24 flex-shrink-0 text-right text-sm font-medium">{formatMoney(l.quantity * l.price, cur)}</span>
                  <button type="button" onClick={() => removeEditLine(l.key)} className="flex-shrink-0 text-slate-400 hover:text-red-600" title="Remove item">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addEditLine}>+ Add item</Button>
            </div>
          )}
        </div>

        {/* Totals */}
        {!editMode ? (
          <div className="space-y-1.5 border-t border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700 dark:text-slate-300">{formatMoney(Number(sale.subtotal), cur)}</span></div>
            {Number(sale.discount_total) > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-amber-600">- {formatMoney(Number(sale.discount_total), cur)}</span></div>}
            {Number(sale.tax_total) > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="text-slate-700 dark:text-slate-300">+ {formatMoney(Number(sale.tax_total), cur)}</span></div>}
            <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800"><span className="font-semibold">Grand Total</span><span className="text-lg font-bold">{formatMoney(Number(sale.grand_total), cur)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-emerald-600">{formatMoney(Number(sale.amount_paid), cur)}</span></div>
            {Number(sale.balance) > 0 && <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className="font-semibold text-amber-600">{formatMoney(Number(sale.balance), cur)}</span></div>}
          </div>
        ) : (
          <div className="space-y-2 border-t border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
            <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800"><span className="font-semibold">New Grand Total</span><span className="text-lg font-bold">{formatMoney(editGrandTotal, cur)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Paid</span>
              <input
                className="w-32 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                type="number" min={0} step="any" value={editAmountPaid}
                onChange={(e) => setEditAmountPaid(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex justify-between text-amber-600"><span>New Balance</span><span className="font-semibold">{formatMoney(Math.max(0, editGrandTotal - editAmountPaid), cur)}</span></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Discard changes</Button>
              <Button type="button" onClick={saveEdit} loading={savingEdit}>
                <Pencil className="h-4 w-4" /> Save corrected invoice
              </Button>
            </div>
          </div>
        )}

        {shop?.receipt_footer && (
          <div className="border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {shop.receipt_footer}
          </div>
        )}
      </Card>

      {sale.customer_id && (
        <div className="mt-4 text-center">
          <Link to={`/customers/${sale.customer_id}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            View customer ledger
          </Link>
        </div>
      )}

      {showCancel && (
        <CancelSaleModal sale={sale} onClose={() => setShowCancel(false)} onDone={load} />
      )}
    </div>
  );
}

function CancelSaleModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!reason.trim()) { toast('error', 'Please enter a cancellation reason.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('cancel_sale', {
      p_sale_id: sale.id, p_reason: reason.trim(), p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Sale cancelled. Stock and ledger have been reversed.');
    onClose();
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Cancel Sale" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>This will reverse the sale, restore stock, and reverse the customer ledger entry. This cannot be undone.</p>
        </div>
        <Field label="Cancellation reason (required)">
          <Textarea rows={3} required placeholder="e.g. Wrong entry, customer cancelled" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Go back</Button>
          <Button type="submit" variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" loading={saving}>
            <XCircle className="h-4 w-4" /> Confirm Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

