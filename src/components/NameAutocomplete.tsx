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

// Same tolerance as supabase/functions/ai-assistant/nameDictionary.ts (and
// src/lib/nameMatch.ts) — kept as a local copy for the same reason those
// two already are: this needs to work standalone in the browser bundle.
function levenshteinDistance(a: string, b: string): number {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j];
  }
  return prev[t.length];
}

function isNearMatch(a: string, b: string): boolean {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (!s || !t || s === t) return false;
  const distance = levenshteinDistance(s, t);
  if (distance === 0 || distance > 2) return false;
  return distance / Math.max(s.length, t.length) <= 0.34;
}

// Urdu for one word: exact match first (e.g. "Mohsin" -> محسن), then a
// close spelling variant (e.g. "Muhsin"/"Mohsn" -> still محسن) — the
// shopkeeper's own English spelling is NEVER changed because of this, only
// the Urdu is filled in for whichever known name it's closest to. A pure
// number (a house-number-style identifier someone adds after a name, e.g.
// "197") never matches anything, by design. No fixed reference list can
// ever cover every real Pakistani name, so a word with no close match
// (exact or fuzzy) is simply left without Urdu — never guessed, never an
// error.
function lookupUrdu(word: string, tokens: NameRow[], tokenByEn: Map<string, string>): string | undefined {
  if (/^\d+$/.test(word)) return undefined;
  const exact = tokenByEn.get(word.toLowerCase());
  if (exact) return exact;
  if (word.length < 3) return undefined;
  let best: string | undefined;
  let bestDist = Infinity;
  for (const t of tokens) {
    if (t.en.length < word.length) continue; // never shrink a longer typed word onto a shorter token
    if (isNearMatch(t.en, word)) {
      const d = levenshteinDistance(t.en, word);
      if (d < bestDist) { bestDist = d; best = t.ur; }
    }
  }
  return best;
}

function buildUrForFullName(fullName: string, tokens: NameRow[], tokenByEn: Map<string, string>): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((w) => lookupUrdu(w, tokens, tokenByEn))
    .filter((v): v is string => !!v)
    .join(' ');
}

// Backend/private reference list only (same ~30,000-name sheet also used
// for AI spelling correction — see scripts/data/nameDictionarySource.json /
// supabase/functions/ai-assistant/nameTokens.json) — never an actual
// customer, never searched or displayed as one.
//
// One box only: the shopkeeper types/edits English here, exactly as they
// want it (never force-corrected) — a picked suggestion still corrects
// spelling if they choose it, but nothing is forced. The Urdu translation
// is a read-only preview pinned to the right edge of the same field
// (nobody actually types on an Urdu keyboard, so there's no separate Urdu
// input to fill in) — it updates live from the current English text via
// buildUrForFullName, word by word, skipping anything with no close match.
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
  const [data, setData] = useState(cachedData);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadNameData().then((d) => {
      if (cancelled) return;
      setData(d);
      onUrChange(buildUrForFullName(value, d.tokens, d.tokenByEn));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          return { fullEn, fullUr: buildUrForFullName(fullEn, data.tokens, data.tokenByEn) };
        }));
    }
    suggestions = suggestions.slice(0, MAX_SUGGESTIONS);
  }

  const handleChange = (v: string) => {
    onChange(v);
    if (data) onUrChange(buildUrForFullName(v, data.tokens, data.tokenByEn));
    setOpen(true);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.fullEn);
    onUrChange(s.fullUr);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Full Name {required && '*'}
      </label>
      <div className="relative">
        <Input
          required={required}
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          className={urValue ? 'pr-28' : ''}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {urValue && (
          <span
            dir="rtl"
            lang="ur"
            className="pointer-events-none absolute inset-y-0 right-3 flex max-w-[45%] items-center truncate text-sm text-slate-400 dark:text-slate-500"
          >
            {urValue}
          </span>
        )}
      </div>
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
