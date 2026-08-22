import { Check, X, UserPlus, Phone } from 'lucide-react';
import { formatMoney } from '@/lib/format';

export type ConfirmCandidate = { id: string; name: string; phone?: string; balance?: number };

/**
 * Inline identity-confirmation card rendered directly inside a chat
 * message bubble — used whenever the AI Assistant found a party match
 * that still needs a human "yes, that's them" before an invoice/payment
 * preview is built. Covers three situations, all in Urdu-script RTL per
 * the shop's language requirements:
 *
 *  - 'confirm-one': exactly one existing customer/supplier has this exact
 *    name — still ask, rather than silently auto-selecting them, since a
 *    brand-new person can walk in with the same name as an existing one.
 *  - 'fuzzy': no exact match, but 1-3 existing names are close enough that
 *    this is plausibly a speech-recognition/spelling variant of one of
 *    them (e.g. "Ali Raja" spoken for "Ali Raza"). Similar names are never
 *    auto-merged — the shopkeeper must pick one, or add a new person.
 *  - 'context-typo': inside a dedicated customer/supplier chat, the spoken
 *    name is a near-match (not exact) of the chat's own bound party —
 *    confirms whether they meant that same person before proceeding.
 *  - 'confirm-new': no existing customer/supplier matches at all (exact or
 *    near), AND the spoken/transcribed name itself looks uncertain (low AI
 *    confidence, or suspiciously short — e.g. voice recognition heard "Ab"
 *    instead of "Abbas"). Rather than silently creating a new person from a
 *    possibly-truncated name, this asks the shopkeeper to confirm the name
 *    is correct before anything is saved. Renders with zero candidates.
 */
export function PartyConfirmCard({
  kind, mode, spokenName, candidates, currency, onSelect, onAddNew, onReject,
}: {
  kind: 'customer' | 'supplier';
  mode: 'confirm-one' | 'fuzzy' | 'context-typo' | 'confirm-new';
  spokenName: string;
  candidates: ConfirmCandidate[];
  currency?: string;
  onSelect: (candidate: ConfirmCandidate) => void;
  onAddNew?: () => void;
  onReject?: () => void;
}) {
  const partyWord = kind === 'customer' ? 'کسٹمر' : 'سپلائر';

  // The spoken/matched name (always Latin script) leads every heading so it
  // renders at the visual start of the line even in RTL Urdu text.
  let heading: string;
  if (mode === 'confirm-one') {
    heading = `"${spokenName}" نام کا ایک ${partyWord} پہلے سے موجود ہے۔ کیا یہ وہی ${partyWord} ہے؟`;
  } else if (mode === 'context-typo') {
    heading = `"${candidates[0]?.name}" — کیا آپ کی بات اسی کے بارے میں ہے؟ (آپ نے "${spokenName}" لکھا)`;
  } else if (mode === 'confirm-new') {
    heading = `"${spokenName}" — نام واضح طور پر سنائی نہیں دیا۔ کیا یہ نام درست ہے؟ اسی نام سے نیا ${partyWord} شامل کریں؟`;
  } else {
    heading = `"${spokenName}" سے ملتے جلتے نام موجود ہیں۔ کیا آپ ان میں سے کسی کی بات کر رہے ہیں؟`;
  }

  return (
    <div dir="rtl" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-right text-slate-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-slate-100">
      <p className="mb-2.5 text-sm font-medium leading-relaxed">{heading}</p>

      <div className="space-y-1.5">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              {c.name}
              {c.phone && <span className="flex items-center gap-1 text-xs font-normal text-slate-500"><Phone className="h-3 w-3" />{c.phone}</span>}
            </span>
            {c.balance != null && (
              <span className={`flex-shrink-0 text-xs font-semibold ${c.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatMoney(c.balance, currency)}
              </span>
            )}
          </button>
        ))}

        {mode === 'context-typo' && (
          <button
            onClick={onReject}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950/20"
          >
            <X className="h-3.5 w-3.5" />
            نہیں، یہ ایک مختلف شخص ہے
          </button>
        )}

        {mode === 'confirm-new' && (
          <>
            <button
              onClick={onAddNew}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
            >
              <Check className="h-3.5 w-3.5" />
              ہاں، درست ہے — نیا {partyWord} شامل کریں
            </button>
            <button
              onClick={onReject}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950/20"
            >
              <X className="h-3.5 w-3.5" />
              نہیں، نام دوبارہ لکھیں
            </button>
          </>
        )}

        {mode !== 'context-typo' && mode !== 'confirm-new' && onAddNew && (
          <button
            onClick={onAddNew}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-950/20"
          >
            <UserPlus className="h-3.5 w-3.5" />
            نہیں، نیا {partyWord} "{spokenName}" شامل کریں
          </button>
        )}
      </div>
    </div>
  );
}
