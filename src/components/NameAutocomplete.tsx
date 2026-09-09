import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import nameDirectory from '@/data/nameDirectory.json';

type NameRow = { en: string; ur: string };

const DIRECTORY = nameDirectory as NameRow[];
const MAX_SUGGESTIONS = 8;

// Backend/private reference list only (same ~5,000-name sheet already used
// for AI spelling correction — see supabase/functions/ai-assistant/
// masterNameDictionary.json) — never an actual customer, never searched or
// displayed as one. Purely spelling/autocomplete, English left + Urdu right.
//
// Urdu is only ever set by explicitly picking a suggestion — never derived
// from raw typing — so a name + trailing identifier (e.g. "Mohsin Ali 197")
// keeps the canonical Urdu tied to "Mohsin Ali" without translating "197".
// If the text is edited enough that it no longer starts with the last
// picked name, the stale Urdu is cleared rather than left incorrect.
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

  const q = value.trim().toLowerCase();
  const suggestions = q.length >= 2 ? DIRECTORY.filter((r) => r.en.toLowerCase().startsWith(q)).slice(0, MAX_SUGGESTIONS) : [];

  const handleChange = (v: string) => {
    onChange(v);
    if (lastSelectedEn.current && !v.toLowerCase().startsWith(lastSelectedEn.current.toLowerCase())) {
      onUrChange('');
      lastSelectedEn.current = '';
    }
    setOpen(true);
  };

  const handleSelect = (row: NameRow) => {
    onChange(row.en);
    onUrChange(row.ur);
    lastSelectedEn.current = row.en;
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
          {suggestions.map((s) => (
            <button
              key={s.en}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="min-w-0 truncate text-slate-900 dark:text-slate-100">{s.en}</span>
              <span dir="rtl" lang="ur" className="flex-shrink-0 text-slate-500 dark:text-slate-400">{s.ur}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
