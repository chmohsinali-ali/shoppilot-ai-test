// Shared duplicate-prevention helpers for Customer and Supplier manual
// forms — identical rules/messages for both, per the requirement that
// duplicate-prevention quality must be the same for both party types.
import { supabase } from '@/lib/supabase';

export const DUPLICATE_PHONE_MESSAGE_CUSTOMER =
  'یہ فون نمبر پہلے سے ایک کسٹمر کے ساتھ رجسٹرڈ ہے۔ براہ کرم نیا فون نمبر شامل کریں۔';
export const DUPLICATE_PHONE_MESSAGE_SUPPLIER =
  'یہ فون نمبر پہلے سے ایک سپلائر کے ساتھ رجسٹرڈ ہے۔ براہ کرم نیا فون نمبر شامل کریں۔';

// Postgres unique_violation error code — the authoritative guard is the
// database's partial unique index (see migration
// 20260821000000_shoppilot_phone_unique_constraints.sql); this just
// recognizes that failure and turns it into the friendly Urdu message
// instead of a raw Postgres error string.
export function isDuplicatePhoneError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /uniq_customers_shop_phone|uniq_suppliers_shop_phone/i.test(error.message ?? '');
}

// Proactive pre-check so the shopkeeper sees the warning immediately,
// before even attempting to save — the DB constraint above is what
// actually guarantees no duplicate is ever persisted (e.g. under
// concurrent writes), this is purely a faster/friendlier UX path.
export async function phoneAlreadyUsed(
  table: 'customers' | 'suppliers',
  shopId: string,
  phone: string,
  excludeId?: string
): Promise<boolean> {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('primary_phone', trimmed)
    .is('deleted_at', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { count } = await query;
  return (count ?? 0) > 0;
}

export type NameMatchCandidate = { id: string; name: string; phone?: string; balance?: number };

// Exact-name duplicate check used by the manual Add Customer / Add
// Supplier forms — same "don't silently create a duplicate" rule the AI
// Assistant chat already applies when resolving a spoken name.
export async function findExactNameMatches(
  table: 'customers' | 'suppliers',
  nameColumn: 'full_name' | 'supplier_name',
  shopId: string,
  name: string
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .is('deleted_at', null)
    .ilike(nameColumn, trimmed);
  return count ?? 0;
}
