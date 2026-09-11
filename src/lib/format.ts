// Pakistan-first shop app: the PKR amount is shown as a plain number
// (no "PKR" prefix) everywhere a shopkeeper reads or hears it, since the
// shop's own currency is implicit. A non-default currency (USD/EUR/CAD —
// e.g. an imported product priced in USD) still shows its code, since
// silently dropping it there would hide a real distinction the shopkeeper
// needs to notice.
export function formatMoney(amount: number, currency = 'PKR'): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  return currency && currency !== 'PKR' ? `${currency} ${formatted}` : formatted;
}

// Short, human-facing sale reference for the UI (S1, S2, S3, ...) — backed
// by sales.display_seq, a per-shop sequential integer that never resets.
// The long internal invoice_number (e.g. "SALE-2026-000001") stays untouched
// in the database and keeps being used everywhere else (audit logs, RPCs).
export function formatSaleRef(displaySeq: number | null | undefined, fallback: string): string {
  return displaySeq != null ? `S${displaySeq}` : fallback;
}

export function formatNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Compact numeric date (d/m/y) for tight spaces (ledger rows, list tables,
// receipt headers) where a full "02 Sept 2026, 14:57" wastes horizontal
// room — e.g. "12/8/26".
export function formatDateCompact(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// English/Urdu name pairing rule used everywhere a customer's name is
// displayed as read text (lists, modal titles, confirmations, toasts):
// "English Name / Urdu Name" when a translation exists, English alone
// when it doesn't — never a forced or guessed Urdu name.
export function bilingualName(en: string, ur?: string | null): string {
  return ur && ur.trim() ? `${en} / ${ur}` : en;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
