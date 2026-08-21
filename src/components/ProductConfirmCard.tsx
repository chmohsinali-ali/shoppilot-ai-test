import { Check, X, PackagePlus } from 'lucide-react';

/**
 * Inline product-identification confirmation card — rendered directly
 * inside a chat message bubble (same pattern as PartyConfirmCard), used
 * whenever the AI Assistant's product resolution can't proceed silently:
 *
 *  - 'confirm-new': no existing product (by exact or near alias match)
 *    was found anywhere in this shop's dictionary, and the AI itself was
 *    not fully confident of the Urdu/English identification — ask before
 *    creating a brand-new product record.
 *  - 'near-match': an existing product's alias is CLOSE (not exact) to
 *    what was said, but confidence was low enough not to auto-accept —
 *    ask whether they mean that existing product or a genuinely new one.
 */
export function ProductConfirmCard({
  mode, nameEn, nameUr, nearMatchNameEn, nearMatchNameUr, onConfirmNew, onUseExisting, onReject,
}: {
  mode: 'confirm-new' | 'near-match';
  nameEn: string;
  nameUr: string;
  nearMatchNameEn?: string;
  nearMatchNameUr?: string | null;
  onConfirmNew: () => void;
  onUseExisting?: () => void;
  onReject?: () => void;
}) {
  return (
    <div dir="rtl" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-right text-slate-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-slate-100">
      {mode === 'confirm-new' ? (
        <>
          <p className="mb-2.5 text-sm font-medium leading-relaxed">
            اس پروڈکٹ کا انگریزی نام "{nameEn}" اور اردو نام "{nameUr}" لگتا ہے۔ کیا آپ اسے اسی نام سے محفوظ کرنا چاہتے ہیں؟
          </p>
          <div className="space-y-1.5">
            <button
              onClick={onConfirmNew}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-emerald-950/20"
            >
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              ہاں، محفوظ کریں
            </button>
            <button
              onClick={onReject}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950/20"
            >
              <X className="h-3.5 w-3.5" />
              نہیں، نام درست کر کے دوبارہ لکھیں
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2.5 text-sm font-medium leading-relaxed">
            کیا آپ کی مراد "{nearMatchNameEn}"{nearMatchNameUr ? ` (${nearMatchNameUr})` : ''} ہے؟ (آپ نے "{nameEn}" کہا)
          </p>
          <div className="space-y-1.5">
            <button
              onClick={onUseExisting}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-950/20"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                {nearMatchNameEn}{nearMatchNameUr ? ` — ${nearMatchNameUr}` : ''}
              </span>
            </button>
            <button
              onClick={onConfirmNew}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-950/20"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              نہیں، یہ نیا پروڈکٹ "{nameEn}" ہے
            </button>
          </div>
        </>
      )}
    </div>
  );
}
