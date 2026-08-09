import { useEffect, useState, useMemo, FormEvent } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { RotateCcw, Plus, Trash2, ArrowLeft, Check, ShoppingBag, Truck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner, PageLoader } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import type { SaleReturn, PurchaseReturn, Sale, Purchase, SaleItem, PurchaseItem } from '@/types/db';

export function ReturnsPage() {
  const { shop } = useAuth();
  const [tab, setTab] = useState<'sale' | 'purchase'>('sale');
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const [sr, pr] = await Promise.all([
      supabase.from('sale_returns').select('*').eq('shop_id', shop.id).order('return_date', { ascending: false }).limit(30),
      supabase.from('purchase_returns').select('*').eq('shop_id', shop.id).order('return_date', { ascending: false }).limit(30),
    ]);
    setSaleReturns((sr.data ?? []) as SaleReturn[]);
    setPurchaseReturns((pr.data ?? []) as PurchaseReturn[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Returns" subtitle="Manage sale and purchase returns" action={<Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New Return</Button>} />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('sale')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'sale' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><ShoppingBag className="h-4 w-4" /> Sale Returns ({saleReturns.length})</button>
        <button onClick={() => setTab('purchase')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Truck className="h-4 w-4" /> Purchase Returns ({purchaseReturns.length})</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : tab === 'sale' ? (
        saleReturns.length === 0 ? (
          <Card><EmptyState icon={<RotateCcw className="h-8 w-8" />} title="No sale returns" description="Process a customer return from a sale's detail page." /></Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"><tr><th className="px-4 py-3 font-medium">Return #</th><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Refund</th><th className="px-4 py-3 font-medium">Reason</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {saleReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">{r.return_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.customer_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(r.return_date)}</td>
                    <td className="px-4 py-3 font-semibold text-rose-600">{formatMoney(Number(r.refund_amount), shop?.currency)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        purchaseReturns.length === 0 ? (
          <Card><EmptyState icon={<RotateCcw className="h-8 w-8" />} title="No purchase returns" description="Process a return to supplier from a purchase's detail page." /></Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"><tr><th className="px-4 py-3 font-medium">Return #</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Refund</th><th className="px-4 py-3 font-medium">Reason</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {purchaseReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">{r.return_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(r.return_date)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{formatMoney(Number(r.refund_amount), shop?.currency)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      <NewReturnModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}

function NewReturnModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop, user } = useAuth();
  const toast = useToast();
  const [type, setType] = useState<'sale' | 'purchase'>('sale');
  const [refId, setRefId] = useState('');
  const [reason, setReason] = useState('Damaged');
  const [refund, setRefund] = useState(0);
  const [restock, setRestock] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; product_name: string; quantity: number; price: number }>>([]);
  const [refDoc, setRefDoc] = useState<Sale | Purchase | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRef = async (id: string) => {
    if (!shop || !id) { setRefDoc(null); setItems([]); return; }
    if (type === 'sale') {
      const [s, its] = await Promise.all([
        supabase.from('sales').select('*').eq('id', id).maybeSingle(),
        supabase.from('sale_items').select('*').eq('sale_id', id),
      ]);
      setRefDoc(s.data as Sale | null);
      setItems(((its.data ?? []) as SaleItem[]).map((i) => ({ product_id: i.product_id ?? '', product_name: i.product_name, quantity: Number(i.quantity), price: Number(i.price) })));
    } else {
      const [p, its] = await Promise.all([
        supabase.from('purchases').select('*').eq('id', id).maybeSingle(),
        supabase.from('purchase_items').select('*').eq('purchase_id', id),
      ]);
      setRefDoc(p.data as Purchase | null);
      setItems(((its.data ?? []) as PurchaseItem[]).map((i) => ({ product_id: i.product_id ?? '', product_name: i.product_name, quantity: Number(i.ordered_quantity), price: Number(i.price_per_unit) })));
    }
  };

  useEffect(() => { if (open) { setRefId(''); setRefDoc(null); setItems([]); setRefund(0); setReason('Damaged'); } }, [open, type]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !user || !refId) return;
    setSaving(true);
    const itemsJson = items.filter((i) => i.quantity > 0).map((i) => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, price: i.price }));
    let res;
    if (type === 'sale') {
      res = await supabase.rpc('record_sale_return', {
        p_shop_id: shop.id, p_sale_id: refId, p_reason: reason, p_refund_amount: refund,
        p_restock: restock, p_items: itemsJson, p_notes: notes, p_user_id: user.id,
      });
    } else {
      const doc = refDoc as Purchase;
      res = await supabase.rpc('record_purchase_return', {
        p_shop_id: shop.id, p_purchase_id: refId, p_supplier_id: doc.supplier_id,
        p_reason: reason, p_refund_amount: refund, p_items: itemsJson, p_notes: notes, p_user_id: user.id,
      });
    }
    setSaving(false);
    if (res.error) { toast('error', res.error.message); return; }
    toast('success', 'Return recorded.');
    onClose(); onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="New Return" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setType('sale')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${type === 'sale' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Sale Return</button>
          <button type="button" onClick={() => setType('purchase')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${type === 'purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Purchase Return</button>
        </div>
        <Field label={`${type === 'sale' ? 'Sale' : 'Purchase'} ID / Invoice #`}>
          <Input placeholder="Paste the invoice number or ID" value={refId} onChange={(e) => { setRefId(e.target.value); loadRef(e.target.value); }} />
        </Field>
        {refDoc && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <p className="font-medium text-slate-900 dark:text-slate-100">{type === 'sale' ? (refDoc as Sale).invoice_number : (refDoc as Purchase).purchase_number}</p>
            <p className="text-xs text-slate-500">{type === 'sale' ? (refDoc as Sale).customer_name : (refDoc as Purchase).supplier_name} · {formatDateTime(type === 'sale' ? (refDoc as Sale).sale_date : (refDoc as Purchase).purchase_date)}</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Items to return (adjust quantity):</p>
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{it.product_name}</span>
                <Input type="number" min={0} step="0.001" className="h-8 w-20 text-right" value={it.quantity || ''} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))} />
                <span className="w-20 text-right text-slate-500">{formatMoney(it.price, shop?.currency)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option>Damaged</option><option>Wrong Product</option><option>Customer Changed Mind</option><option>Warranty Replacement</option><option>Billing Error</option><option>Other</option>
            </Select>
          </Field>
          <Field label="Refund amount"><Input type="number" min={0} step="0.01" value={refund || ''} onChange={(e) => setRefund(parseFloat(e.target.value) || 0)} /></Field>
        </div>
        {type === 'sale' && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" /> Restock returned items
          </label>
        )}
        <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!refId}><Check className="h-4 w-4" /> Record Return</Button>
        </div>
      </form>
    </Modal>
  );
}
