import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Plus, Trash2, ShoppingCart, Check, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { ProductNameAutocomplete } from '@/components/ProductNameAutocomplete';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, bilingualName } from '@/lib/format';
import type { Customer, Product, SaleItemInput } from '@/types/db';

type Line = SaleItemInput & { key: string };

export function NewSalePage() {
  const { shop, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const location = useLocation();
  const presetCustomer = params.get('customer');

  // Pre-fill support: when arriving from the "Edit Sale" flow on SaleDetailPage,
  // navigation state carries the original invoice's data so the shopkeeper can
  // adjust it (e.g. change quantity) before saving as a corrected replacement.
  const prefill = (location.state as { prefill?: {
    customerId: string;
    customerName: string;
    lines: Line[];
    discountTotal: number;
    amountPaid: number;
    paymentMethod: string;
    notes: string;
    originalSaleId: string;
  } } | null)?.prefill;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string>(prefill?.customerId ?? '');
  const [customerName, setCustomerName] = useState(prefill?.customerName ?? 'Walk-in');
  const [lines, setLines] = useState<Line[]>(prefill?.lines?.length ? prefill.lines : [emptyLine()]);
  const [discountTotal, setDiscountTotal] = useState(prefill?.discountTotal ?? 0);
  const [amountPaid, setAmountPaid] = useState(prefill?.amountPaid ?? 0);
  const [paymentMethod, setPaymentMethod] = useState(prefill?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shop) return;
    (async () => {
      setLoading(true);
      const [c, p] = await Promise.all([
        supabase.from('customers').select('*').eq('shop_id', shop.id).is('deleted_at', null).order('full_name'),
        supabase.from('products').select('*').eq('shop_id', shop.id).is('deleted_at', null).order('name'),
      ]);
      setCustomers((c.data ?? []) as Customer[]);
      setProducts((p.data ?? []) as Product[]);
      if (presetCustomer) setCustomerId(presetCustomer);
      setLoading(false);
    })();
  }, [shop, presetCustomer]);

  useEffect(() => {
    if (customerId) {
      const c = customers.find((x) => x.id === customerId);
      setCustomerName(c?.full_name ?? 'Walk-in');
    } else {
      setCustomerName('Walk-in');
    }
  }, [customerId, customers]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity * l.price - (l.discount ?? 0)), 0),
    [lines]
  );
  const grandTotal = Math.max(0, subtotal - discountTotal);
  const balance = grandTotal - amountPaid;

  function emptyLine(): Line {
    return { key: Math.random().toString(36).slice(2), product_name: '', product_name_ur: '', unit: 'piece', quantity: 1, price: 0, discount: 0, product_id: null };
  }

  const updateLine = (key: string, field: keyof Line, value: string | number) => {
    setLines((ls) => ls.map((l) => (l.key === key
      // Free typing means the English text is no longer necessarily what
      // product_name_ur (set by a previous pick) was translated from —
      // clearing it here is the same "never guess" rule the customer name
      // field follows: only an actual pick fills in an Urdu name.
      ? { ...l, [field]: value, ...(field === 'product_name' ? { product_name_ur: '' } : {}) }
      : l)));
  };

  const pickProductForLine = (key: string, p: Product, label: string) => {
    // A reference pick that just created a brand-new product (id not yet
    // in `products`) needs to be added to local state too, so the next
    // keystroke's own catalog matching (and the top search grid) sees it
    // immediately instead of only after a full reload.
    setProducts((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]));
    setLines((ls) => ls.map((l) => (l.key === key
      ? { ...l, product_id: p.id, product_name: label, product_name_ur: p.urdu_name ?? '', unit: p.unit, price: Number(p.sale_price) }
      : l)));
  };

  const removeLine = (key: string) => {
    setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((l) => l.key !== key)));
  };

  const validLines = lines.filter((l) => l.product_name.trim() && l.quantity > 0);

  const submit = async () => {
    if (!shop || !user) return;
    if (validLines.length === 0) {
      toast('error', 'Add at least one product to the sale.');
      return;
    }
    setSaving(true);
    const itemsJson = validLines.map((l) => ({
      product_id: l.product_id ?? '',
      product_name: l.product_name,
      product_name_ur: l.product_name_ur ?? '',
      unit: l.unit,
      quantity: l.quantity,
      price: l.price,
      discount: l.discount ?? 0,
      tax_rate: 0,
    }));
    const { data, error } = await supabase.rpc('create_sale', {
      p_shop_id: shop.id,
      p_customer_id: customerId || null,
      p_customer_name: customerName,
      p_sale_date: new Date().toISOString(),
      p_items: itemsJson,
      p_discount_total: discountTotal,
      p_tax_total: 0,
      p_amount_paid: amountPaid,
      p_payment_method: paymentMethod,
      p_notes: notes,
      p_user_id: user.id,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }

    if (prefill?.originalSaleId) {
      await supabase.from('sales').update({ superseded_by_sale_id: data }).eq('id', prefill.originalSaleId);
      toast('success', `Corrected invoice saved. Original invoice marked as replaced.`);
    } else {
      toast('success', `Sale created. Invoice saved.`);
    }
    navigate(`/sales/${data}`);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={() => navigate('/sales')} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to sales
      </button>
      <PageHeader
        title={prefill ? 'Edit Sale — Corrected Invoice' : 'New Sale'}
        subtitle={prefill ? 'The original invoice was cancelled. Adjust anything below, then save to create the corrected invoice.' : 'Build the invoice, then confirm to save.'}
      />
      {prefill && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          You're editing a previous invoice. Change any quantity, price, or item below, then save — this will become the new corrected invoice.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Customer */}
          <Card className="p-5">
            <Field label="Customer">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{bilingualName(c.full_name, c.full_name_ur)}{c.primary_phone ? ` · ${c.primary_phone}` : ''}</option>)}
              </Select>
            </Field>
          </Card>

          {/* Products — each line's own Product Name field already has full
              autocomplete (own catalog + common items), so there's no need
              for a second, separate "search to add" box above it. */}
          <Card className="p-5">
            {/* Line items */}
            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Item {idx + 1}</span>
                    <button onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-5">
                      <ProductNameAutocomplete
                        value={l.product_name}
                        onChange={(v) => updateLine(l.key, 'product_name', v)}
                        products={products}
                        shopId={shop?.id ?? ''}
                        currency={shop?.currency}
                        onPickCatalog={(p, label) => pickProductForLine(l.key, p, label)}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input type="number" min={0} step="0.001" placeholder="Qty" value={l.quantity || ''} onChange={(e) => updateLine(l.key, 'quantity', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input placeholder="Unit" value={l.unit} onChange={(e) => updateLine(l.key, 'unit', e.target.value)} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input type="number" min={0} step="0.01" placeholder="Price" value={l.price || ''} onChange={(e) => updateLine(l.key, 'price', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-12 sm:col-span-1">
                      <Input type="number" min={0} step="0.01" placeholder="Disc" value={l.discount || ''} onChange={(e) => updateLine(l.key, 'discount', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  <div className="mt-2 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                    {formatMoney(l.quantity * l.price - (l.discount ?? 0), shop?.currency)}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="p-5 lg:sticky lg:top-6">
            <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">Summary</h3>
            <div className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(subtotal, shop?.currency)} />
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Discount</span>
                <Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={discountTotal || ''} onChange={(e) => setDiscountTotal(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                <Row label="Grand Total" value={formatMoney(grandTotal, shop?.currency)} bold />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-600 dark:text-slate-300">Amount paid</span>
                <Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={amountPaid || ''} onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} />
              </div>
              <Field label="Payment method">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-9 text-sm">
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="mobile">Mobile / EasyPaisa</option>
                </Select>
              </Field>
              <Row label="Balance" value={formatMoney(Math.max(0, balance), shop?.currency)} bold warn={balance > 0} />
            </div>

            <Button onClick={submit} loading={saving} className="mt-4 w-full" size="lg" disabled={validLines.length === 0}>
              <Check className="h-4 w-4" /> Confirm Sale
            </Button>
            <Link to="/sales" className="mt-2 block">
              <Button variant="ghost" className="w-full">Cancel</Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, warn }: { label: string; value: string; bold?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}>{label}</span>
      <span className={`${bold ? 'text-base font-bold' : 'font-medium'} ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</span>
    </div>
  );
}
