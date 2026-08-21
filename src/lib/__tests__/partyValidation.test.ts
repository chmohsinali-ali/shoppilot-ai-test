import { describe, it, expect } from 'vitest';
import { isDuplicatePhoneError } from '@/lib/partyValidation';

describe('isDuplicatePhoneError', () => {
  it('recognizes a Postgres unique_violation error code', () => {
    expect(isDuplicatePhoneError({ code: '23505', message: 'duplicate key value' })).toBe(true);
  });

  it('recognizes the customer phone unique index by name', () => {
    expect(isDuplicatePhoneError({ message: 'duplicate key value violates unique constraint "uniq_customers_shop_phone"' })).toBe(true);
  });

  it('recognizes the supplier phone unique index by name', () => {
    expect(isDuplicatePhoneError({ message: 'duplicate key value violates unique constraint "uniq_suppliers_shop_phone"' })).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isDuplicatePhoneError({ code: '23503', message: 'foreign key violation' })).toBe(false);
    expect(isDuplicatePhoneError(null)).toBe(false);
    expect(isDuplicatePhoneError(undefined)).toBe(false);
  });
});
