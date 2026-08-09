import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Plus, Trash2, Search, Check, ArrowLeft, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/format';
import { mulMoney, addMoney, subMoney } from '@/lib/calc';
import type { Supplier, Product, PurchaseItemInput } from '@/types/db';

type Line = PurchaseItemInput & { key: string; expanded: boolean };

export function NewPurchasePage() {
  const { shop, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const location = useLocation();
  const presetSupplier = params.get('supplier');

  // Pre-fill support: when arriving from the "Edit Purchase" flow on
  // PurchaseDetailPage, navigation state carries the original purchase's
  // data so the shopkeeper can adjust it before saving as a correction.
  const prefill = (location.state as { prefill?: {
    supplierId: string;
    supplierInvoice: string;
    lines: Line[];
    discountTotal: number;
    taxTotal: number;
    deliveryCharges: number;
    freight: number;
    otherCharges: number;
    amountPaid: number;
    paymentMethod: string;
    notes: string;
    originalPurchaseId: string;
  } } | null)?.prefill;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState(prefill?.supplierId ?? '');
  const [supplierInvoice, setSupplierInvoice] = useState(prefill?.supplierInvoice ?? '');
  const [invoiceStatus, setInvoiceStatus] = useState('open');
  const [shopCustomerNumber, setShopCustomerNumber] = useState('');
  const [lines, setLines] = useState<Line[]>(prefill?.lines?.length ? prefill.lines : [emptyLine()]);
  const [discountTotal, setDiscountTotal] = useState(prefill?.discountTotal ?? 0);
  const [taxTotal, setTaxTotal] = useState(prefill?.taxTotal ?? 0);
  const [deliveryCharges, setDeliveryCharges] = useState(prefill?.deliveryCharges ?? 0);
  const [freight, setFreight] = useState(prefill?.freight ?? 0);
  const [otherCharges, setOtherCharges] = useState(prefill?.otherCharges ?? 0);
  const [amountPaid, setAmountPaid] = useState(prefill?.amountPaid ?? 0);
  const [paymentMethod, setPaymentMethod] = useState(prefill?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    if (!shop) return;
    (async () => {
      setLoading(true);
      const [s, p] = await Promise.all([
        supabase.from('suppliers').select('*').eq('shop_id', shop.id).is('deleted_at', null).order('supplier_name'),
        supabase.from('products').select('*').eq('shop_id', shop.id).is('deleted_at', null).order('name'),
      ]);
      setSuppliers((s.data ?? []) as Supplier[]);
      setProducts((p.data ?? []) as Product[]);
      if (presetSupplier) setSupplierId(presetSupplier);
      setLoading(false);
    })();
  }, [shop, presetSupplier]);

  function emptyLine(): Line {
    return {
      key: Math.random().toString(36).slice(2), product_name: '', unit: 'piece',
      ordered_quantity: 1, free_units: 0, price_per_unit: 0,
      regular_discount: 0, special_discount: 0, scheme_discount: 0, additional_discount: 0,
      trade_offer_amount: 0, tax_amount: 0, tax_rate: 0,
      hs_code: '', supplier_product_code: '', ctn_size: '', retail_price: 0,
      trade_activity: '', sales_tax_rate: 0, further_tax: 0, advance_tax: 0, tax_type: '',
      product_id: null, expanded: false,
    };
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => addMoney(s, mulMoney(l.ordered_quantity, l.price_per_unit)), 0), [lines]);
  const grandTotal = Math.max(0, subMoney(subtotal, discountTotal) + taxTotal + deliveryCharges + freight + otherCharges);
  const balance = grandTotal - amountPaid;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productSearch]);

  const addProduct = (p: Product) => {
    setLines((ls) => {
      const firstEmpty = ls.length === 1 && !ls[0].product_name;
      if (firstEmpty) return [{ ...ls[0], product_id: p.id, product_name: p.name, unit: p.unit, price_per_unit: Number(p.purchase_price), retail_price: Number(p.sale_price) }];
      return [...ls, { ...emptyLine(), product_id: p.id, product_name: p.name, unit: p.unit, price_per_unit: Number(p.purchase_price), retail_price: Number(p.sale_price) }];
    });
    setProductSearch('');
  };

  const updateLine = (key: string, field: keyof Line, value: string | number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((l) => l.key !== key)));
  const toggleExpand = (key: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, expanded: !l.expanded } : l)));

  const validLines = lines.filter((l) => l.product_name.trim() && l.ordered_quantity > 0);

  const submit = async () => {
    if (!shop || !user) return;
    if (!supplierId) { toast('error', 'Please select a supplier.'); return; }
    if (validLines.length === 0) { toast('error', 'Add at least one product.'); return; }
    setSaving(true);
    const supplier = suppliers.find((s) => s.id === supplierId);
    const itemsJson = validLines.map((l) => ({
      product_id: l.product_id ?? '',
      product_name: l.product_name,
      unit: l.unit,
      ordered_quantity: l.ordered_quantity,
      free_units: l.free_units ?? 0,
      price_per_unit: l.price_per_unit,
      regular_discount: l.regular_discount ?? 0,
      special_discount: l.special_discount ?? 0,
      scheme_discount: l.scheme_discount ?? 0,
      additional_discount: l.additional_discount ?? 0,
      trade_offer_amount: l.trade_offer_amount ?? 0,
      tax_amount: l.tax_amount ?? 0,
      tax_rate: l.tax_rate ?? 0,
      hs_code: l.hs_code ?? '',
      supplier_product_code: l.supplier_product_code ?? '',
      ctn_size: l.ctn_size ?? '',
      retail_price: l.retail_price ?? 0,
      trade_activity: l.trade_activity ?? '',
      sales_tax_rate: l.sales_tax_rate ?? 0,
      further_tax: l.further_tax ?? 0,
      advance_tax: l.advance_tax ?? 0,
      tax_type: l.tax_type ?? '',
    }));
    const { data, error } = await supabase.rpc('create_purchase', {
      p_shop_id: shop.id, p_supplier_id: supplierId, p_supplier_name: supplier?.supplier_name ?? '',
      p_supplier_invoice_number: supplierInvoice, p_purchase_date: new Date().toISOString(),
      p_items: itemsJson, p_discount_total: discountTotal, p_tax_total: taxTotal,
      p_delivery_charges: deliveryCharges, p_freight: freight, p_other_charges: otherCharges,
      p_amount_paid: amountPaid, p_payment_method: paymentMethod, p_notes: notes, p_user_id: user.id,
      p_supplier_invoice_status: invoiceStatus,
      p_shop_customer_number: shopCustomerNumber || null,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }

    if (prefill?.originalPurchaseId) {
      await supabase.from('purchases').update({ superseded_by_purchase_id: data }).eq('id', prefill.originalPurchaseId);
      toast('success', 'Corrected purchase saved. Original marked as replaced.');
    } else {
      toast('success', 'Purchase recorded.');
    }
    navigate(`/purchases/${data}`);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <button onClick={() => navigate('/purchases')} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Back to purchases</button>
      <PageHeader
        title={prefill ? 'Edit Purchase — Corrected Invoice' : 'New Purchase'}
        subtitle={prefill ? 'The original purchase was cancelled. Adjust anything below, then save to create the corrected invoice.' : 'Record stock received from a supplier.'}
      />
      {prefill && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          You're editing a previous purchase. Change any quantity, price, or item below, then save — this will become the new corrected invoice.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Supplier + invoice header */}
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Supplier">
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                </Select>
              </Field>
              <Field label="Supplier invoice #"><Input placeholder="Supplier's invoice number" value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} /></Field>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Invoice status">
                <Select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </Select>
              </Field>
              <Field label="Customer no. (your a/c with supplier)"><Input placeholder="03000068302" value={shopCustomerNumber} onChange={(e) => setShopCustomerNumber(e.target.value)} /></Field>
            </div>
          </Card>

          {/* Product search + line items */}
          <Card className="p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search products to add..." className="pl-9" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </div>
            {productSearch && filteredProducts.length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filteredProducts.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/30">
                    <Package className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0"><p className="truncate font-medium text-slate-900 dark:text-slate-100">{p.name}</p><p className="text-xs text-slate-500">{formatMoney(Number(p.purchase_price), shop?.currency)} · {p.stock} {p.unit}</p></div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {lines.map((l, idx) => {
                const gross = mulMoney(l.ordered_quantity, l.price_per_unit);
                const totalDisc = (l.regular_discount ?? 0) + (l.special_discount ?? 0) + (l.scheme_discount ?? 0) + (l.additional_discount ?? 0);
                const tradeOffer = l.trade_offer_amount ?? 0;
                const furtherTax = l.further_tax ?? 0;
                const advanceTax = l.advance_tax ?? 0;
                const net = gross - totalDisc - tradeOffer + (l.tax_amount ?? 0) + furtherTax + advanceTax;
                const received = (l.ordered_quantity ?? 0) + (l.free_units ?? 0);
                return (
                  <div key={l.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Item {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleExpand(l.key)} className="text-slate-400 hover:text-slate-600" title="Toggle FMCG fields">
                          {l.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <button onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {/* Core fields — always visible */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-12 sm:col-span-4"><Input placeholder="Product name" value={l.product_name} onChange={(e) => updateLine(l.key, 'product_name', e.target.value)} /></div>
                      <div className="col-span-4 sm:col-span-2"><Input type="number" min={0} step="0.001" placeholder="Qty" value={l.ordered_quantity || ''} onChange={(e) => updateLine(l.key, 'ordered_quantity', parseFloat(e.target.value) || 0)} /></div>
                      <div className="col-span-4 sm:col-span-2"><Input type="number" min={0} step="0.001" placeholder="Free" value={l.free_units || ''} onChange={(e) => updateLine(l.key, 'free_units', parseFloat(e.target.value) || 0)} /></div>
                      <div className="col-span-4 sm:col-span-2"><Input type="number" min={0} step="0.01" placeholder="Price" value={l.price_per_unit || ''} onChange={(e) => updateLine(l.key, 'price_per_unit', parseFloat(e.target.value) || 0)} /></div>
                      <div className="col-span-4 sm:col-span-2"><Input type="number" min={0} step="0.01" placeholder="Disc" value={l.regular_discount || ''} onChange={(e) => updateLine(l.key, 'regular_discount', parseFloat(e.target.value) || 0)} /></div>
                    </div>
                    {/* Expanded FMCG fields */}
                    {l.expanded && (
                      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-6 sm:col-span-3"><Input placeholder="HS Code" value={l.hs_code ?? ''} onChange={(e) => updateLine(l.key, 'hs_code', e.target.value)} /></div>
                          <div className="col-span-6 sm:col-span-3"><Input placeholder="Supplier Product Code" value={l.supplier_product_code ?? ''} onChange={(e) => updateLine(l.key, 'supplier_product_code', e.target.value)} /></div>
                          <div className="col-span-6 sm:col-span-3"><Input placeholder="CTN Size" value={l.ctn_size ?? ''} onChange={(e) => updateLine(l.key, 'ctn_size', e.target.value)} /></div>
                          <div className="col-span-6 sm:col-span-3"><Input type="number" min={0} step="0.01" placeholder="Retail Price" value={l.retail_price || ''} onChange={(e) => updateLine(l.key, 'retail_price', parseFloat(e.target.value) || 0)} /></div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-4 sm:col-span-3"><Input type="number" min={0} step="0.01" placeholder="Trade Offer Amt" value={l.trade_offer_amount || ''} onChange={(e) => updateLine(l.key, 'trade_offer_amount', parseFloat(e.target.value) || 0)} /></div>
                          <div className="col-span-4 sm:col-span-3"><Input placeholder="Trade Activity" value={l.trade_activity ?? ''} onChange={(e) => updateLine(l.key, 'trade_activity', e.target.value)} /></div>
                          <div className="col-span-4 sm:col-span-3"><Input type="number" min={0} step="0.01" placeholder="Sales Tax %" value={l.sales_tax_rate || ''} onChange={(e) => updateLine(l.key, 'sales_tax_rate', parseFloat(e.target.value) || 0)} /></div>
                          <div className="col-span-4 sm:col-span-3"><Input placeholder="Tax Type" value={l.tax_type ?? ''} onChange={(e) => updateLine(l.key, 'tax_type', e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-4 sm:col-span-4"><Input type="number" min={0} step="0.01" placeholder="Tax Amount" value={l.tax_amount || ''} onChange={(e) => updateLine(l.key, 'tax_amount', parseFloat(e.target.value) || 0)} /></div>
                          <div className="col-span-4 sm:col-span-4"><Input type="number" min={0} step="0.01" placeholder="Further Tax" value={l.further_tax || ''} onChange={(e) => updateLine(l.key, 'further_tax', parseFloat(e.target.value) || 0)} /></div>
                          <div className="col-span-4 sm:col-span-4"><Input type="number" min={0} step="0.01" placeholder="Advance Tax" value={l.advance_tax || ''} onChange={(e) => updateLine(l.key, 'advance_tax', parseFloat(e.target.value) || 0)} /></div>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>Received: {received} {l.unit}</span>
                      <span>Net: {formatMoney(net, shop?.currency)}</span>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-4 w-4" /> Add line</Button>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="p-5 lg:sticky lg:top-6">
            <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Subtotal</span><span className="font-medium">{formatMoney(subtotal, shop?.currency)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-300">Discount</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={discountTotal || ''} onChange={(e) => setDiscountTotal(parseFloat(e.target.value) || 0)} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-300">Tax</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={taxTotal || ''} onChange={(e) => setTaxTotal(parseFloat(e.target.value) || 0)} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-300">Delivery</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={deliveryCharges || ''} onChange={(e) => setDeliveryCharges(parseFloat(e.target.value) || 0)} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-300">Freight</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={freight || ''} onChange={(e) => setFreight(parseFloat(e.target.value) || 0)} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-600 dark:text-slate-300">Other</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={otherCharges || ''} onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)} /></div>
              <div className="border-t border-slate-100 pt-2 dark:border-slate-800"><div className="flex justify-between"><span className="font-semibold">Grand Total</span><span className="text-lg font-bold">{formatMoney(grandTotal, shop?.currency)}</span></div></div>
              <div className="flex items-center justify-between pt-1"><span className="text-slate-600 dark:text-slate-300">Amount paid</span><Input type="number" min={0} step="0.01" className="h-8 w-28 text-right text-sm" value={amountPaid || ''} onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} /></div>
              <Field label="Payment method"><Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-9 text-sm"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option><option value="mobile">Mobile / EasyPaisa</option></Select></Field>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Balance</span><span className={`font-semibold ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatMoney(Math.max(0, balance), shop?.currency)}</span></div>
            </div>
            <Button onClick={submit} loading={saving} className="mt-4 w-full" size="lg" disabled={validLines.length === 0 || !supplierId}><Check className="h-4 w-4" /> Confirm Purchase</Button>
            <Link to="/purchases" className="mt-2 block"><Button variant="ghost" className="w-full">Cancel</Button></Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
