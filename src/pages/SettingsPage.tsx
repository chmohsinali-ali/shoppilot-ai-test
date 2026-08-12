import { useEffect, useState, FormEvent } from 'react';
import { Store, Save, User, Receipt, Sparkles, Database } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import type { AuditLog } from '@/types/db';

export function SettingsPage() {
  const { shop, user, refreshShop } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', email: '', address: '', city: '', country: '',
    currency: 'PKR', receipt_header: '', receipt_footer: '',
    inventory_enabled: true, catalog_enabled: false, tax_enabled: false, default_tax_rate: 0,
  });
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (shop) {
      setForm({
        name: shop.name, phone: shop.phone ?? '', whatsapp: shop.whatsapp ?? '', email: shop.email ?? '',
        address: shop.address ?? '', city: shop.city ?? '', country: shop.country,
        currency: shop.currency, receipt_header: shop.receipt_header ?? '', receipt_footer: shop.receipt_footer ?? '',
        inventory_enabled: shop.inventory_enabled, catalog_enabled: shop.catalog_enabled,
        tax_enabled: shop.tax_enabled, default_tax_rate: Number(shop.default_tax_rate),
      });
    }
  }, [shop]);

  useEffect(() => {
    if (shop) {
      supabase.from('audit_logs').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(10)
        .then(({ data }) => setAudit((data ?? []) as AuditLog[]));
    }
  }, [shop]);

  const update = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const { error } = await supabase.from('shops').update({
      name: form.name, phone: form.phone || null, whatsapp: form.whatsapp || null, email: form.email || null,
      address: form.address || null, city: form.city || null, country: form.country, currency: form.currency,
      receipt_header: form.receipt_header || null, receipt_footer: form.receipt_footer || null,
      inventory_enabled: form.inventory_enabled, catalog_enabled: form.catalog_enabled,
      tax_enabled: form.tax_enabled, default_tax_rate: form.default_tax_rate,
      updated_at: new Date().toISOString(),
    }).eq('id', shop.id);
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    await refreshShop();
    toast('success', 'Settings saved.');
  };

  if (!shop) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Settings" subtitle="Manage your shop profile and preferences." />

      <form onSubmit={save} className="space-y-6">
        {/* Shop info */}
        <Card>
          <CardHeader title="Shop Information" subtitle="Basic details about your shop" />
          <CardBody className="space-y-4">
            <Field label="Shop name"><Input required value={form.name} onChange={(e) => update('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone"><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field>
              <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} /></Field>
            </div>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field>
            <Field label="Address"><Input value={form.address} onChange={(e) => update('address', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City"><Input value={form.city} onChange={(e) => update('city', e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={(e) => update('country', e.target.value)} /></Field>
            </div>
            <Field label="Currency">
              <Select value={form.currency} onChange={(e) => update('currency', e.target.value)}>
                <option value="PKR">PKR — Pakistani Rupee</option>
                <option value="INR">INR — Indian Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SAR">SAR — Saudi Riyal</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        {/* Receipt */}
        <Card>
          <CardHeader title="Receipt Settings" subtitle="Customize your printed receipts" />
          <CardBody className="space-y-4">
            <Field label="Receipt header (optional)"><Textarea rows={2} value={form.receipt_header} onChange={(e) => update('receipt_header', e.target.value)} /></Field>
            <Field label="Receipt footer (optional)"><Textarea rows={2} value={form.receipt_footer} onChange={(e) => update('receipt_footer', e.target.value)} /></Field>
          </CardBody>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader title="Business Preferences" subtitle="Configure how your shop operates" />
          <CardBody className="space-y-3">
            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">Track inventory</p><p className="text-xs text-slate-500 dark:text-slate-400">Deduct stock on each sale</p></div>
              <input type="checkbox" checked={form.inventory_enabled} onChange={(e) => update('inventory_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">Product catalog</p><p className="text-xs text-slate-500 dark:text-slate-400">Save products with SKU and barcode</p></div>
              <input type="checkbox" checked={form.catalog_enabled} onChange={(e) => update('catalog_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enable tax</p><p className="text-xs text-slate-500 dark:text-slate-400">Apply tax on sales</p></div>
              <input type="checkbox" checked={form.tax_enabled} onChange={(e) => update('tax_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
            </label>
            {form.tax_enabled && (
              <Field label="Default tax rate (%)"><Input type="number" min={0} step="0.01" value={form.default_tax_rate || ''} onChange={(e) => update('default_tax_rate', parseFloat(e.target.value) || 0)} /></Field>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={saving} size="lg"><Save className="h-4 w-4" /> Save Settings</Button>
        </div>
      </form>

      {/* AI status */}
      <Card className="mt-6">
        <CardHeader title="AI Assistant Status" subtitle="OpenAI-compatible provider" />
        <CardBody>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 text-sm">
              <p className="text-slate-700 dark:text-slate-200">
                The AI assistant uses an OpenAI-compatible API. To activate it, add an <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">AI_API_KEY</code> secret in your Supabase project settings.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Optional: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">AI_BASE_URL</code> and <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">AI_MODEL</code> to use a different provider.
              </p>
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Until the key is added, the assistant works in manual mode and the app stays fully usable.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Account */}
      <Card className="mt-6">
        <CardHeader title="Account" />
        <CardBody>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user?.email}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Shop owner</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Recent activity */}
      <Card className="mt-6">
        <CardHeader title="Recent Activity" subtitle="Last 10 actions" />
        <CardBody className="p-0">
          {audit.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.action}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.entity_type ?? 'system'}</p>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
