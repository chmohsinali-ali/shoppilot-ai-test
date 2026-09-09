import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import nameDirectory from '@/data/nameDirectory.json';
import nameTokens from '@/data/nameTokens.json';

type NameRow = { en: string; ur: string };

const DIRECTORY = nameDirectory as NameRow[];
const TOKENS = nameTokens as NameRow[];
const MAX_SUGGESTIONS = 8;

// Backend/private reference list only (same ~5,000-name sheet already used
// for AI spelling correction — see supabase/functions/ai-assistant/
// masterNameDictionary.json) — never an actual customer, never searched or
// displayed as one. Purely spelling/autocomplete, English left + Urdu right.
//
// Two sources are searched together: the full-name list (en_full/ur_full —
// covers "Mo" -> "Mohsin Ali", "Mohsin Ahmad", ...) and a smaller
// deduped token list (every distinct first/last name — covers a name like
// "Mahmood" that the source sheet only ever pairs as a LAST name, so it
// never starts any full_name and would otherwise show zero suggestions).
// A token match only ever replaces the word currently being typed (the
// text after the last space), never the words already finished.
//
// Urdu is only ever set by explicitly picking a suggestion — never derived
// from raw typing — so a name + trailing identifier (e.g. "Mohsin Ali 197")
// keeps the canonical Urdu tied to "Mohsin Ali" without translating "197".
// If the text is edited enough that it no longer starts with the last
// picked value, the stale Urdu is cleared rather than left incorrect.
export function NameAutocomplete({
  value, onChange, urValue, onUrChange, placeholder, required,
}: {
  value: string;
  onChange: (v: string) => void;
  urValue: string;
  onUrChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lastSelectedEn = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const trimmed = value.trim();
  const q = trimmed.toLowerCase();
  const lastSpace = trimmed.lastIndexOf(' ');
  const precedingWords = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace);
  const currentWord = (lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1)).toLowerCase();

  type Suggestion = { en: string; ur: string; fullNameMatch: boolean };
  let suggestions: Suggestion[] = [];
  if (q.length >= 2) {
    const fullMatches = DIRECTORY.filter((r) => r.en.toLowerCase().startsWith(q))
      .map((r) => ({ en: r.en, ur: r.ur, fullNameMatch: true }));
    suggestions = fullMatches;
  }
  if (currentWord.length >= 2 && suggestions.length < MAX_SUGGESTIONS) {
    const tokenMatches = TOKENS.filter((t) => t.en.toLowerCase().startsWith(currentWord))
      .map((t) => ({ en: t.en, ur: t.ur, fullNameMatch: false }));
    suggestions = [...suggestions, ...tokenMatches];
  }
  suggestions = suggestions.slice(0, MAX_SUGGESTIONS);

  const handleChange = (v: string) => {
    onChange(v);
    if (lastSelectedEn.current && !v.toLowerCase().startsWith(lastSelectedEn.current.toLowerCase())) {
      onUrChange('');
      lastSelectedEn.current = '';
    }
    setOpen(true);
  };

  const handleSelect = (s: Suggestion) => {
    if (s.fullNameMatch) {
      onChange(s.en);
      onUrChange(s.ur);
      lastSelectedEn.current = s.en;
    } else {
      // Token match — only replaces the word being typed, keeping any
      // earlier word(s) as-is; Urdu builds up word by word alongside it.
      const newValue = precedingWords ? `${precedingWords} ${s.en}` : s.en;
      const newUr = precedingWords ? `${urValue} ${s.ur}`.trim() : s.ur;
      onChange(newValue);
      onUrChange(newUr);
      lastSelectedEn.current = newValue;
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        required={required}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s, i) => (
            <button
              key={`${s.en}-${i}`}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="min-w-0 truncate text-slate-900 dark:text-slate-100">
                {s.fullNameMatch ? s.en : (precedingWords ? `${precedingWords} ${s.en}` : s.en)}
              </span>
              <span dir="rtl" lang="ur" className="flex-shrink-0 text-slate-500 dark:text-slate-400">{s.ur}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
