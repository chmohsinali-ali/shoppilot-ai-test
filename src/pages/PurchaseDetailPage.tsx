import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Store, CheckCircle2, XCircle, Pencil, AlertTriangle, ArrowRight, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageLoader, EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDateTime, formatNumber } from '@/lib/format';
import type { Purchase, PurchaseItem } from '@/types/db';

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { shop, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showCancel, setShowCancel] = useState(false);

  // Inline edit mode — stays on this same page instead of navigating away.
  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<Array<{ key: string; product_id: string | null; product_name: string; unit: string; ordered_quantity: number; free_units: number; price_per_unit: number }>>([]);
  const [editAmountPaid, setEditAmountPaid] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    if (!shop || !id) return;
    setLoading(true);
    const [p, it] = await Promise.all([
      supabase.from('purchases').select('*').eq('id', id).maybeSingle(),
      supabase.from('purchase_items').select('*').eq('purchase_id', id).order('created_at'),
    ]);
    setPurchase(p.data as Purchase | null);
    setItems((it.data ?? []) as PurchaseItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, id]);

  if (loading) return <PageLoader />;
  if (!purchase) return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Purchase not found" />
    </div>
  );

  const cur = shop?.currency ?? 'PKR';
  const isCancelled = purchase.status === 'cancelled';
  const totalFreeUnits = items.reduce((s, i) => s + Number(i.free_units), 0);
  const totalReceived = items.reduce((s, i) => s + Number(i.total_received_quantity), 0);
  const totalFurtherTax = items.reduce((s, i) => s + Number(i.further_tax), 0);
  const totalAdvanceTax = items.reduce((s, i) => s + Number(i.advance_tax), 0);
  const totalTradeOffer = items.reduce((s, i) => s + Number(i.trade_offer_amount), 0);

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const hasFmfgFields = (it: PurchaseItem) =>
    it.hs_code || it.supplier_product_code || it.ctn_size || Number(it.retail_price) > 0 ||
    Number(it.trade_offer_amount) > 0 || it.trade_activity || Number(it.sales_tax_rate) > 0 ||
    Number(it.further_tax) > 0 || Number(it.advance_tax) > 0 || it.tax_type;

  const startEdit = () => {
    setEditLines(items.map((it) => ({
      key: it.id, product_id: it.product_id ?? null, product_name: it.product_name, unit: it.unit,
      ordered_quantity: Number(it.ordered_quantity), free_units: Number(it.free_units), price_per_unit: Number(it.price_per_unit),
    })));
    setEditAmountPaid(Number(purchase.amount_paid));
    setEditMode(true);
  };

  const updateEditLine = (key: string, field: 'ordered_quantity' | 'free_units' | 'price_per_unit' | 'product_name' | 'unit', value: string) => {
    setEditLines((lines) => lines.map((l) => (l.key === key ? { ...l, [field]: (field === 'product_name' || field === 'unit') ? value : (Number(value) || 0) } : l)));
  };

  const removeEditLine = (key: string) => setEditLines((lines) => lines.filter((l) => l.key !== key));
  const addEditLine = () => setEditLines((lines) => [...lines, { key: Math.random().toString(36).slice(2), product_id: null, product_name: '', unit: 'piece', ordered_quantity: 1, free_units: 0, price_per_unit: 0 }]);

  const editGrandTotal = editLines.reduce((s, l) => s + l.ordered_quantity * l.price_per_unit, 0) - Number(purchase.discount_total) + Number(purchase.tax_total);

  const saveEdit = async () => {
    if (!user || !purchase) return;
    if (editLines.some((l) => !l.product_name.trim() || l.ordered_quantity <= 0)) {
      toast('error', 'Every item needs a name and an ordered quantity greater than 0.');
      return;
    }
    setSavingEdit(true);
    const { error: cancelErr } = await supabase.rpc('cancel_purchase', {
      p_purchase_id: purchase.id, p_reason: 'Edited in place — replaced by corrected invoice', p_user_id: user.id,
    });
    if (cancelErr) { setSavingEdit(false); toast('error', cancelErr.message); return; }

    const itemsJson = editLines.map((l) => ({
      product_id: l.product_id ?? '', product_name: l.product_name, unit: l.unit,
      ordered_quantity: l.ordered_quantity, free_units: l.free_units, price_per_unit: l.price_per_unit,
    }));
    const { data: newId, error: createErr } = await supabase.rpc('create_purchase', {
      p_shop_id: purchase.shop_id, p_supplier_id: purchase.supplier_id, p_supplier_name: purchase.supplier_name ?? '',
      p_supplier_invoice_number: purchase.supplier_invoice_number ?? '', p_purchase_date: new Date().toISOString(),
      p_items: itemsJson, p_discount_total: Number(purchase.discount_total), p_tax_total: Number(purchase.tax_total),
      p_delivery_charges: Number(purchase.delivery_charges), p_freight: Number(purchase.freight), p_other_charges: Number(purchase.other_charges),
      p_amount_paid: editAmountPaid, p_payment_method: purchase.payment_method, p_notes: purchase.notes ?? '', p_user_id: user.id,
      p_supplier_invoice_status: purchase.supplier_invoice_status, p_shop_customer_number: purchase.shop_customer_number ?? null,
    });
    if (createErr) { setSavingEdit(false); toast('error', createErr.message); return; }

    await supabase.from('purchases').update({ superseded_by_purchase_id: newId }).eq('id', purchase.id);
    setSavingEdit(false);
    setEditMode(false);
    toast('success', 'Invoice updated.');
    navigate(`/purchases/${newId}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate('/purchases')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex gap-2">
          {!isCancelled && !editMode && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setShowCancel(true)}>
                <XCircle className="h-4 w-4" /> Cancel Purchase
              </Button>
            </>
          )}
          {!editMode && (
            <>
              <Link to={`/returns?purchase=${purchase.id}`}>
                <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4" /> Return</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </>
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
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5 text-center dark:border-slate-800 dark:bg-slate-800/50">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{shop?.name}</h1>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Purchase Invoice</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{purchase.purchase_number}</p>
        </div>

        {isCancelled && (
          <div className="border-b border-slate-200 bg-slate-100 px-6 py-3 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">This purchase has been cancelled</p>
                {purchase.cancellation_reason && <p className="text-xs text-slate-500 dark:text-slate-400">Reason: {purchase.cancellation_reason}</p>}
              </div>
            </div>
            {purchase.superseded_by_purchase_id && (
              <Link to={`/purchases/${purchase.superseded_by_purchase_id}`} className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                Replaced by invoice <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Supplier</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{purchase.supplier_name ?? '—'}</p>
            {purchase.supplier_invoice_number && <p className="text-xs text-slate-500">Inv: {purchase.supplier_invoice_number}</p>}
            {purchase.shop_customer_number && <p className="text-xs text-slate-500">Customer No: {purchase.shop_customer_number}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Date</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{formatDateTime(purchase.purchase_date)}</p>
            <p className="mt-1 text-xs">
              {isCancelled ? (
                <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">Cancelled</span>
              ) : (
                <span className={`inline-block rounded-full px-2 py-0.5 font-medium capitalize ${purchase.supplier_invoice_status === 'open' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'}`}>
                  {purchase.supplier_invoice_status}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="px-6 py-4">
          {!editMode ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Ordered</th>
                <th className="pb-2 text-right font-medium">Free</th>
                <th className="pb-2 text-right font-medium">Price</th>
                <th className="pb-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it) => (
                <>
                  <tr key={it.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => hasFmfgFields(it) && toggleItem(it.id)}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        {hasFmfgFields(it) && (
                          <button className="text-slate-300">
                            {expandedItems.has(it.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{it.product_name}</p>
                          <p className="text-xs text-slate-500">
                            {it.unit}
                            {it.batch_number && ` · Batch: ${it.batch_number}`}
                            {it.expiry_date && ` · Exp: ${it.expiry_date}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{formatNumber(Number(it.ordered_quantity))}</td>
                    <td className="py-2.5 text-right text-emerald-600">{Number(it.free_units) > 0 ? formatNumber(Number(it.free_units)) : '—'}</td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{formatMoney(Number(it.price_per_unit), cur)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">{formatMoney(Number(it.net_amount), cur)}</td>
                  </tr>
                  {expandedItems.has(it.id) && hasFmfgFields(it) && (
                    <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                      <td colSpan={5} className="px-4 pb-3 pt-1">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                          {it.hs_code && <FmfgField label="HS Code" value={it.hs_code} />}
                          {it.supplier_product_code && <FmfgField label="Supplier Code" value={it.supplier_product_code} />}
                          {it.ctn_size && <FmfgField label="CTN Size" value={it.ctn_size} />}
                          {Number(it.retail_price) > 0 && <FmfgField label="Retail Price" value={formatMoney(Number(it.retail_price), cur)} />}
                          {Number(it.trade_offer_amount) > 0 && <FmfgField label="Trade Offer Amt" value={formatMoney(Number(it.trade_offer_amount), cur)} />}
                          {it.trade_activity && <FmfgField label="Trade Activity" value={it.trade_activity} />}
                          {Number(it.sales_tax_rate) > 0 && <FmfgField label="Sales Tax %" value={`${it.sales_tax_rate}%`} />}
                          {it.tax_type && <FmfgField label="Tax Type" value={it.tax_type} />}
                          {Number(it.further_tax) > 0 && <FmfgField label="Further Tax" value={formatMoney(Number(it.further_tax), cur)} />}
                          {Number(it.advance_tax) > 0 && <FmfgField label="Advance Tax" value={formatMoney(Number(it.advance_tax), cur)} />}
                          {Number(it.effective_cost_per_unit) > 0 && <FmfgField label="Eff. Cost/Unit" value={formatMoney(Number(it.effective_cost_per_unit), cur)} />}
                          {Number(it.gross_value) > 0 && <FmfgField label="Gross Value" value={formatMoney(Number(it.gross_value), cur)} />}
                          {Number(it.total_discount) > 0 && <FmfgField label="Total Discount" value={formatMoney(Number(it.total_discount), cur)} />}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Advanced FMCG fields (HS code, tax, etc.) are kept as-is from the original; edit quantity, free units, and price below.</p>
              {editLines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={l.product_name} placeholder="Item name"
                    onChange={(e) => updateEditLine(l.key, 'product_name', e.target.value)}
                  />
                  <input
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                    type="number" min={0} step="any" value={l.ordered_quantity} title="Ordered qty"
                    onChange={(e) => updateEditLine(l.key, 'ordered_quantity', e.target.value)}
                  />
                  <input
                    className="w-14 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                    type="number" min={0} step="any" value={l.free_units} title="Free units"
                    onChange={(e) => updateEditLine(l.key, 'free_units', e.target.value)}
                  />
                  <input
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={l.unit} placeholder="unit"
                    onChange={(e) => updateEditLine(l.key, 'unit', e.target.value)}
                  />
                  <input
                    className="w-24 rounded border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                    type="number" min={0} step="any" value={l.price_per_unit} title="Price per unit"
                    onChange={(e) => updateEditLine(l.key, 'price_per_unit', e.target.value)}
                  />
                  <span className="w-24 flex-shrink-0 text-right text-sm font-medium">{formatMoney(l.ordered_quantity * l.price_per_unit, cur)}</span>
                  <button type="button" onClick={() => removeEditLine(l.key)} className="flex-shrink-0 text-slate-400 hover:text-red-600" title="Remove item">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addEditLine}>+ Add item</Button>
            </div>
          )}
        </div>

        {!editMode ? (
        <div className="space-y-1.5 border-t border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700 dark:text-slate-300">{formatMoney(Number(purchase.subtotal), cur)}</span></div>
          {Number(purchase.discount_total) > 0 && <div className="flex justify-between text-amber-600"><span>Discount</span><span>- {formatMoney(Number(purchase.discount_total), cur)}</span></div>}
          {totalTradeOffer > 0 && <div className="flex justify-between text-amber-600"><span>Trade Offer</span><span>- {formatMoney(totalTradeOffer, cur)}</span></div>}
          {Number(purchase.tax_total) > 0 && <div className="flex justify-between"><span className="text-slate-500">Sales Tax</span><span>+ {formatMoney(Number(purchase.tax_total), cur)}</span></div>}
          {totalFurtherTax > 0 && <div className="flex justify-between"><span className="text-slate-500">Further Tax</span><span>+ {formatMoney(totalFurtherTax, cur)}</span></div>}
          {totalAdvanceTax > 0 && <div className="flex justify-between"><span className="text-slate-500">Advance Tax</span><span>+ {formatMoney(totalAdvanceTax, cur)}</span></div>}
          {Number(purchase.delivery_charges) > 0 && <div className="flex justify-between"><span className="text-slate-500">Delivery</span><span>+ {formatMoney(Number(purchase.delivery_charges), cur)}</span></div>}
          {Number(purchase.freight) > 0 && <div className="flex justify-between"><span className="text-slate-500">Freight</span><span>+ {formatMoney(Number(purchase.freight), cur)}</span></div>}
          {Number(purchase.other_charges) > 0 && <div className="flex justify-between"><span className="text-slate-500">Other</span><span>+ {formatMoney(Number(purchase.other_charges), cur)}</span></div>}
          <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800"><span className="font-semibold">Grand Total</span><span className="text-lg font-bold">{formatMoney(Number(purchase.grand_total), cur)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-emerald-600">{formatMoney(Number(purchase.amount_paid), cur)}</span></div>
          {Number(purchase.balance) > 0 && <div className="flex justify-between"><span className="text-slate-500">Balance Payable</span><span className="font-semibold text-amber-600">{formatMoney(Number(purchase.balance), cur)}</span></div>}
          <div className="flex justify-between text-xs text-slate-400"><span>Total free units: {formatNumber(totalFreeUnits)}</span><span>Total received: {formatNumber(totalReceived)}</span></div>
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
            <div className="flex justify-between text-amber-600"><span>New Balance Payable</span><span className="font-semibold">{formatMoney(Math.max(0, editGrandTotal - editAmountPaid), cur)}</span></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Discard changes</Button>
              <Button type="button" onClick={saveEdit} loading={savingEdit}>
                <Pencil className="h-4 w-4" /> Save corrected invoice
              </Button>
            </div>
          </div>
        )}
      </Card>

      {purchase.supplier_id && <div className="mt-4 text-center"><Link to={`/suppliers/${purchase.supplier_id}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">View supplier ledger</Link></div>}

      {showCancel && <CancelPurchaseModal purchase={purchase} onClose={() => setShowCancel(false)} onDone={load} />}
    </div>
  );
}

function CancelPurchaseModal({ purchase, onClose, onDone }: { purchase: Purchase; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!reason.trim()) { toast('error', 'Please enter a cancellation reason.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('cancel_purchase', {
      p_purchase_id: purchase.id, p_reason: reason.trim(), p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Purchase cancelled. Stock and ledger have been reversed.');
    onClose();
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Cancel Purchase" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>This will reverse the purchase, decrease stock, and reverse the supplier ledger entry. This cannot be undone.</p>
        </div>
        <Field label="Cancellation reason (required)">
          <Textarea rows={3} required placeholder="e.g. Wrong entry, order cancelled" value={reason} onChange={(e) => setReason(e.target.value)} />
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

function FmfgField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="font-medium text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}
