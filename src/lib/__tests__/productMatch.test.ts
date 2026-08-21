import { describe, it, expect } from 'vitest';
import { matchProductAlias, normalizeAlias } from '@/lib/productMatch';

describe('normalizeAlias', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeAlias('  Onion  ')).toBe('onion');
    expect(normalizeAlias('Sweet   Corn')).toBe('sweet corn');
  });
});

describe('matchProductAlias', () => {
  const aliases = [
    { alias: 'onion', productId: 'p1' },
    { alias: 'pyaz', productId: 'p1' },
    { alias: 'piyaz', productId: 'p1' },
    { alias: 'پیاز', productId: 'p1' },
    { alias: 'tomato', productId: 'p2' },
    { alias: 'ٹماٹر', productId: 'p2' },
  ];

  it('matches an exact English alias', () => {
    expect(matchProductAlias('Onion', 'پیاز', aliases)).toEqual({ kind: 'exact', productId: 'p1' });
  });

  it('matches an exact Urdu alias', () => {
    expect(matchProductAlias('Tomato', 'ٹماٹر', aliases)).toEqual({ kind: 'exact', productId: 'p2' });
  });

  it('matches a near (phonetic-variant) alias', () => {
    // 'Pyaaz' is a one-letter variant of the registered 'pyaz'/'piyaz'
    // aliases, and no exact candidate is supplied via name_ur here, so
    // this must fall through to the near-match path rather than exact.
    const result = matchProductAlias('Pyaaz', '', aliases);
    expect(result.kind).toBe('near');
    if (result.kind === 'near') expect(result.productId).toBe('p1');
  });

  it('returns none for a genuinely new product', () => {
    expect(matchProductAlias('Rice', 'چاول', aliases)).toEqual({ kind: 'none' });
  });

  it('returns none when there are no aliases yet', () => {
    expect(matchProductAlias('Onion', 'پیاز', [])).toEqual({ kind: 'none' });
  });

  it('does not cross-match unrelated products', () => {
    const result = matchProductAlias('Tomato', 'ٹماٹر', [{ alias: 'onion', productId: 'p1' }]);
    expect(result.kind).toBe('none');
  });
});
