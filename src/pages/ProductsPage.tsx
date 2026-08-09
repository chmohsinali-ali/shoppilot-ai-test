import { useEffect, useState, useMemo, FormEvent } from 'react';
import { Package, Search, Plus, AlertTriangle, Barcode, Box } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatMoney, formatNumber } from '@/lib/format';
import type { Product } from '@/types/db';

const units = ['piece', 'kilogram', 'gram', 'liter', 'milliliter', 'meter', 'foot', 'pack', 'box', 'carton', 'bag', 'bottle', 'dozen', 'pair', 'roll', 'tray', 'case'];

export function ProductsPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('shop_id', shop.id)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) toast('error', 'Could not load products.');
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const lowStockCount = products.filter((p) => Number(p.min_stock_level) > 0 && Number(p.stock) <= Number(p.min_stock_level)).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Products"
        subtitle={`${products.length} products · ${lowStockCount} low stock`}
        action={<Button onClick={() => { setEditing(null); setShowAdd(true); }}><Plus className="h-4 w-4" /> Add Product</Button>}
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search by name, SKU, barcode, category..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={search ? 'No matching products' : 'No products yet'}
            description={search ? 'Try a different search.' : 'Add products to your catalog to start tracking stock and prices.'}
            action={!search && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Product</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Sale Price</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => {
                  const low = Number(p.min_stock_level) > 0 && Number(p.stock) <= Number(p.min_stock_level);
                  const out = Number(p.stock) <= 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                            <Box className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                            {(p.sku || p.barcode) && (
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {p.sku && <span className="flex items-center gap-1"><Barcode className="h-3 w-3" />{p.sku}</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.category ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{formatMoney(Number(p.sale_price), shop?.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={out ? 'text-red-600 dark:text-red-400 font-medium' : low ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-700 dark:text-slate-300'}>
                          {formatNumber(Number(p.stock))} {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {out ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" /> Out
                          </span>
                        ) : low ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Low
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">In stock</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setShowAdd(true); }}>Edit</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ProductModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} product={editing} />
    </div>
  );
}

function ProductModal({ open, onClose, onSaved, product }: { open: boolean; onClose: () => void; onSaved: () => void; product: Product | null }) {
  const { shop } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', category: '', brand: '', unit: 'piece',
    purchase_price: 0, sale_price: 0, stock: 0, min_stock_level: 0, description: '',
  });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name, sku: product.sku ?? '', barcode: product.barcode ?? '',
        category: product.category ?? '', brand: product.brand ?? '', unit: product.unit,
        purchase_price: Number(product.purchase_price), sale_price: Number(product.sale_price),
        stock: Number(product.stock), min_stock_level: Number(product.min_stock_level),
        description: product.description ?? '',
      });
    } else {
      setForm({ name: '', sku: '', barcode: '', category: '', brand: '', unit: 'piece', purchase_price: 0, sale_price: 0, stock: 0, min_stock_level: 0, description: '' });
    }
  }, [product, open]);

  const update = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const payload = {
      shop_id: shop.id,
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      category: form.category || null,
      brand: form.brand || null,
      unit: form.unit,
      purchase_price: form.purchase_price,
      sale_price: form.sale_price,
      stock: form.stock,
      min_stock_level: form.min_stock_level,
      description: form.description || null,
    };
    let res;
    if (product) {
      res = await supabase.from('products').update(payload).eq('id', product.id);
    } else {
      res = await supabase.from('products').insert(payload);
    }
    setSaving(false);
    if (res.error) { toast('error', res.error.message); return; }
    toast('success', product ? 'Product updated.' : 'Product added.');
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'} size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Product name">
          <Input required placeholder="Sugar" value={form.name} onChange={(e) => update('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU (optional)"><Input placeholder="SUG-001" value={form.sku} onChange={(e) => update('sku', e.target.value)} /></Field>
          <Field label="Barcode (optional)"><Input placeholder="8964000..." value={form.barcode} onChange={(e) => update('barcode', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category (optional)"><Input placeholder="Grocery" value={form.category} onChange={(e) => update('category', e.target.value)} /></Field>
          <Field label="Brand (optional)"><Input placeholder="Brand" value={form.brand} onChange={(e) => update('brand', e.target.value)} /></Field>
        </div>
        <Field label="Unit">
          <Select value={form.unit} onChange={(e) => update('unit', e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Purchase price"><Input type="number" min={0} step="0.01" value={form.purchase_price || ''} onChange={(e) => update('purchase_price', parseFloat(e.target.value) || 0)} /></Field>
          <Field label="Sale price"><Input type="number" min={0} step="0.01" value={form.sale_price || ''} onChange={(e) => update('sale_price', parseFloat(e.target.value) || 0)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current stock"><Input type="number" min={0} step="0.001" value={form.stock || ''} onChange={(e) => update('stock', parseFloat(e.target.value) || 0)} /></Field>
          <Field label="Min stock level"><Input type="number" min={0} step="0.001" value={form.min_stock_level || ''} onChange={(e) => update('min_stock_level', parseFloat(e.target.value) || 0)} /></Field>
        </div>
        <Field label="Description (optional)"><Textarea rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{product ? 'Update' : 'Add'} Product</Button>
        </div>
      </form>
    </Modal>
  );
}
