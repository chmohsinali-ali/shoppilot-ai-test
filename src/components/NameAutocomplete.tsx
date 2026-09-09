import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';

type NameRow = { en: string; ur: string };

// The reference sheet is now ~30,000 full names (1.5MB+ as JSON) — far too
// large to bundle into the app's main chunk, which every page load would
// otherwise pay for even though this data is only ever needed on the
// Add/Edit Customer form. Loaded once, lazily, on first mount, and cached
// at module scope so reopening the form (e.g. closing and reopening the
// modal) never re-fetches it.
type NameData = { directory: NameRow[]; tokens: NameRow[]; tokenByEn: Map<string, string> };

let cachedData: NameData | null = null;
let loadingPromise: Promise<NameData> | null = null;

function loadNameData(): Promise<NameData> {
  if (cachedData) return Promise.resolve(cachedData);
  if (!loadingPromise) {
    loadingPromise = Promise.all([
      import('@/data/nameDirectory.json'),
      import('@/data/nameTokens.json'),
    ]).then(([dirMod, tokMod]) => {
      const directory = dirMod.default as NameRow[];
      const tokens = tokMod.default as NameRow[];
      const loaded: NameData = { directory, tokens, tokenByEn: new Map(tokens.map((t) => [t.en.toLowerCase(), t.ur])) };
      cachedData = loaded;
      return loaded;
    });
  }
  return loadingPromise;
}

const MAX_SUGGESTIONS = 8;

// Best-effort Urdu for a full name string, word by word: every finished
// word that matches the dictionary (whole-word, case-insensitive)
// contributes its Urdu; a word that isn't in the dictionary (a trailing
// identifier like "197", a name simply not in the sheet, or a word still
// mid-typing) is skipped rather than guessed. This runs on every
// keystroke, not just on picking a suggestion — so "Ali Mustafa" gets
// "علی مصطفیٰ" as soon as both words are typed out, whether or not either
// one was ever clicked from the dropdown.
function buildUrForFullName(fullName: string, tokenByEn: Map<string, string>): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((w) => tokenByEn.get(w.toLowerCase()))
    .filter((v): v is string => !!v)
    .join(' ');
}

// Backend/private reference list only (same ~30,000-name sheet also used
// for AI spelling correction — see scripts/data/nameDictionarySource.json /
// supabase/functions/ai-assistant/nameTokens.json) — never an actual
// customer, never searched or displayed as one. Purely spelling/
// autocomplete, English left + Urdu right in the dropdown.
//
// Two sources are searched together for suggestions: the full-name list
// (en_full/ur_full — covers "Mo" -> "Mohsin Ali", "Mohsin Ahmad", ...) and
// a smaller deduped token list (every distinct first/last name — covers a
// name like "Mahmood" that the source sheet only ever pairs as a LAST
// name, so it never starts any full_name and would otherwise show zero
// suggestions). Picking a suggestion still corrects spelling (e.g. a
// typo'd "Mohsn" -> "Mohsin"); either way, the Urdu shown in the field is
// always recomputed fresh from the current English text via
// buildUrForFullName, not tracked/cached from whatever was last clicked.
export function NameAutocomplete({
  value, onChange, urValue: _urValue, onUrChange, placeholder, required,
}: {
  value: string;
  onChange: (v: string) => void;
  urValue: string;
  onUrChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(cachedData);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadNameData().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

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

  type Suggestion = { fullEn: string; fullUr: string };
  let suggestions: Suggestion[] = [];
  if (data) {
    const seen = new Set<string>();
    const pushUnique = (list: Suggestion[]) => {
      for (const s of list) {
        const key = s.fullEn.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push(s);
      }
    };
    if (q.length >= 2) {
      pushUnique(data.directory.filter((r) => r.en.toLowerCase().startsWith(q))
        .map((r) => ({ fullEn: r.en, fullUr: r.ur })));
    }
    if (currentWord.length >= 2 && suggestions.length < MAX_SUGGESTIONS) {
      // Same underlying name can surface from both lists (e.g. "Mohsin
      // Naqvi" as a full-name row AND "Naqvi" as a standalone last-name
      // token) — pushUnique's fullEn-based de-dupe collapses those into
      // one row instead of showing the same suggestion twice.
      pushUnique(data.tokens.filter((t) => t.en.toLowerCase().startsWith(currentWord))
        .map((t) => {
          const fullEn = precedingWords ? `${precedingWords} ${t.en}` : t.en;
          return { fullEn, fullUr: buildUrForFullName(fullEn, data.tokenByEn) };
        }));
    }
    suggestions = suggestions.slice(0, MAX_SUGGESTIONS);
  }

  const handleChange = (v: string) => {
    onChange(v);
    if (data) onUrChange(buildUrForFullName(v, data.tokenByEn));
    setOpen(true);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.fullEn);
    onUrChange(s.fullUr);
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
              key={s.fullEn.toLowerCase()}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="min-w-0 truncate text-slate-900 dark:text-slate-100">{s.fullEn}</span>
              <span dir="rtl" lang="ur" className="flex-shrink-0 text-slate-500 dark:text-slate-400">{s.fullUr}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
