import { describe, it, expect } from 'vitest';
import { levenshteinDistance, isNearMatch, compareToContextName } from '@/lib/nameMatch';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('Ali Raza', 'Ali Raza')).toBe(0);
    expect(levenshteinDistance('Ali Raza', 'ali raza')).toBe(0);
  });

  it('counts single-character edits', () => {
    expect(levenshteinDistance('Ali Raza', 'Ali Raja')).toBe(1);
    expect(levenshteinDistance('Muhsin', 'Mohsin')).toBe(1);
  });
});

describe('isNearMatch', () => {
  it('treats common speech-recognition variants as near matches', () => {
    expect(isNearMatch('Ali Raza', 'Ali Raja')).toBe(true);
    expect(isNearMatch('Ali Raza', 'Ali Raaza')).toBe(true);
    expect(isNearMatch('Muhsin', 'Mohsin')).toBe(true);
  });

  it('does not treat genuinely different names as near matches', () => {
    expect(isNearMatch('Mohsin Ali', 'Ali Raza')).toBe(false);
    expect(isNearMatch('Mohsin Ali', 'Mohsin Ahmad')).toBe(false);
    expect(isNearMatch('Mohsin Ali', 'Mohsin Raja')).toBe(false);
  });

  it('does not match on substring containment alone (regression guard)', () => {
    // "Ali" is a substring of "Mohsin Ali" but they are not the same person.
    expect(isNearMatch('Ali', 'Mohsin Ali')).toBe(false);
  });

  it('is false for identical strings (nothing to confirm)', () => {
    expect(isNearMatch('Ali Raza', 'Ali Raza')).toBe(false);
  });
});

describe('compareToContextName', () => {
  it('returns same for an exact (case-insensitive) match', () => {
    expect(compareToContextName('Ali Raza', 'Ali Raza')).toBe('same');
    expect(compareToContextName('ali raza', 'Ali Raza')).toBe('same');
  });

  it('returns near for a likely speech-recognition typo of the context name', () => {
    expect(compareToContextName('Ali Raja', 'Ali Raza')).toBe('near');
  });

  it('returns different for an unrelated name, never auto-merging', () => {
    expect(compareToContextName('Mohsin Ali', 'Ali Raza')).toBe('different');
  });
});
