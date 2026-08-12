import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, MapPin, Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';

const businessTypes = [
  { value: 'general_store', label: 'General Store' },
  { value: 'grocery', label: 'Grocery Store' },
  { value: 'wholesale', label: 'Wholesale Business' },
  { value: 'fmcg_retailer', label: 'FMCG Retailer' },
  { value: 'medical_store', label: 'Medical Store / Pharmacy' },
  { value: 'electronics', label: 'Electronics Shop' },
  { value: 'mobile_shop', label: 'Mobile Shop' },
  { value: 'hardware', label: 'Hardware Store' },
  { value: 'clothing', label: 'Clothing Shop' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'restaurant', label: 'Restaurant / Takeaway' },
  { value: 'salon', label: 'Salon / Barbershop' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'service', label: 'Service Business' },
  { value: 'other', label: 'Other' },
];

export function OnboardingPage() {
  const { user, refreshShop } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    business_type: 'general_store',
    currency: 'PKR',
    phone: '',
    whatsapp: '',
    address: '',
    city: '',
    country: 'Pakistan',
    inventory_enabled: true,
    catalog_enabled: false,
    tax_enabled: false,
    default_tax_rate: 0,
  });

  const update = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const steps = [
    { icon: Store, title: 'Shop details', desc: 'Tell us about your shop' },
    { icon: MapPin, title: 'Location', desc: 'Where is your shop' },
    { icon: SettingsIcon, title: 'Preferences', desc: 'Configure your setup' },
  ];

  const next = () => setStep((s) => Math.min(s + 1, 2));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('shops').insert({
      owner_id: user.id,
      name: form.name,
      business_type: form.business_type,
      currency: form.currency,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      address: form.address || null,
      city: form.city || null,
      country: form.country,
      inventory_enabled: form.inventory_enabled,
      catalog_enabled: form.catalog_enabled,
      tax_enabled: form.tax_enabled,
      default_tax_rate: form.default_tax_rate,
    });
    setLoading(false);
    if (error) {
      toast('error', error.message);
      return;
    }
    await refreshShop();
    toast('success', 'Shop created! Welcome to ShopPilot AI.');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30">
            <Store className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Set up your shop</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Just a few details and you are ready.</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  i <= step
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-8 ${i < step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {step === 0 && (
            <div className="space-y-4 animate-fade-in">
              <Field label="Shop name">
                <Input required placeholder="Khan General Store" value={form.name} onChange={(e) => update('name', e.target.value)} />
              </Field>
              <Field label="Business type">
                <Select value={form.business_type} onChange={(e) => update('business_type', e.target.value)}>
                  {businessTypes.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </Select>
              </Field>
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
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <Field label="Primary phone">
                <Input placeholder="0300 1234567" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </Field>
              <Field label="WhatsApp number">
                <Input placeholder="0300 1234567" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} />
              </Field>
              <Field label="Address">
                <Input placeholder="Shop street, area" value={form.address} onChange={(e) => update('address', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <Input placeholder="Karachi" value={form.city} onChange={(e) => update('city', e.target.value)} />
                </Field>
                <Field label="Country">
                  <Input value={form.country} onChange={(e) => update('country', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Track inventory</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Deduct stock on each sale</p>
                </div>
                <input type="checkbox" checked={form.inventory_enabled} onChange={(e) => update('inventory_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Product catalog</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Save products with SKU and barcode</p>
                </div>
                <input type="checkbox" checked={form.catalog_enabled} onChange={(e) => update('catalog_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enable tax</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Apply tax on sales</p>
                </div>
                <input type="checkbox" checked={form.tax_enabled} onChange={(e) => update('tax_enabled', e.target.checked)} className="h-5 w-5 rounded accent-blue-600" />
              </label>
              {form.tax_enabled && (
                <Field label="Default tax rate (%)">
                  <Input type="number" min={0} step="0.01" value={form.default_tax_rate} onChange={(e) => update('default_tax_rate', parseFloat(e.target.value) || 0)} />
                </Field>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={back}>Back</Button>
            ) : <span />}
            {step < 2 ? (
              <Button type="button" onClick={next} disabled={step === 0 && !form.name}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" loading={loading}>Create shop</Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
