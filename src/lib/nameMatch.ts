// Pure name-matching helpers used by the AI Assistant's party-resolution
// flow. No DB/network calls here — this is intentionally testable in
// isolation from Supabase.

export function levenshteinDistance(a: string, b: string): number {
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
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j];
  }
  return prev[t.length];
}

// A "near match" is close enough to plausibly be the same name spoken/typed
// differently (speech-recognition variants, minor spelling slips) but is
// NOT treated as automatically the same person — callers must still ask
// for confirmation. Deliberately conservative: a small absolute edit
// distance AND a small distance relative to name length, so short unrelated
// names ("Ali" vs "Ana") don't falsely match, and names that only share a
// substring ("Ali" / "Mohsin Ali") don't match either (substring pairs have
// a large edit distance relative to length).
export function isNearMatch(a: string, b: string): boolean {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (!s || !t || s === t) return false;
  const distance = levenshteinDistance(s, t);
  if (distance === 0 || distance > 2) return false;
  const maxLen = Math.max(s.length, t.length);
  return distance / maxLen <= 0.34;
}

export type ContextNameComparison = 'same' | 'near' | 'different';

// Compares a spoken/typed party name against the name of the customer or
// supplier a dedicated chat is currently bound to.
export function compareToContextName(spoken: string, contextName: string): ContextNameComparison {
  const s = spoken.trim().toLowerCase();
  const c = contextName.trim().toLowerCase();
  if (!s || !c) return 'different';
  if (s === c) return 'same';
  if (isNearMatch(s, c)) return 'near';
  return 'different';
}
