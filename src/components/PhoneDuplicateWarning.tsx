import { formatMoney, bilingualName } from '@/lib/format';
import type { CustomerPhoneMatch } from '@/lib/partyValidation';

// Same red bubble/arrow shape as FieldWarning, pinned above the Phone
// Number field — but for the "this number already belongs to someone"
// case it also shows exactly who, with balance, so the shopkeeper can
// tap straight through to that customer's ledger instead of just being
// blocked with no way to check who it is.
export function PhoneDuplicateWarning({
  match, message, currency, onNavigate,
}: {
  match: CustomerPhoneMatch | null;
  message: string;
  currency?: string;
  onNavigate: () => void;
}) {
  if (!match) return null;
  return (
    <div
      dir="rtl"
      className="absolute bottom-full left-0 right-0 z-10 mb-1.5 max-w-sm rounded-lg bg-red-600 p-2.5 text-white shadow-lg"
    >
      <p lang="ur" className="text-xs font-medium leading-snug">{message}</p>
      <button
        type="button"
        onClick={onNavigate}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-md bg-white/15 px-2.5 py-2 text-right transition-colors hover:bg-white/25"
      >
        <span className="min-w-0 flex-1">
          <span lang="ur" className="block truncate text-xs font-semibold">{bilingualName(match.full_name, match.full_name_ur)}</span>
          <span dir="ltr" className="block text-right text-[11px] opacity-80">{match.primary_phone}</span>
        </span>
        <span className="flex-shrink-0 text-xs font-bold">{formatMoney(match.balance, currency)}</span>
      </button>
      <div className="absolute left-4 top-full h-2 w-2 -translate-y-1 rotate-45 bg-red-600" />
    </div>
  );
}
