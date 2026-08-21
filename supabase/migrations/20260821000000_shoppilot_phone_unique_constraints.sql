/*
# ShopPilot AI — Mandatory phone-number uniqueness (Customer + Supplier)

1. Problem
Previously `primary_phone` had only a plain (non-unique) index on both
`customers` and `suppliers`. A shopkeeper could register the same phone
number against two different customers (or two different suppliers) with
zero warning, silently corrupting who-owes-what tracking.

2. Fix
Partial UNIQUE indexes on (shop_id, primary_phone), scoped to:
  - non-empty phone numbers only (a blank/NULL phone is not an identifier
    and must remain allowed on multiple records, e.g. quick walk-in adds)
  - active (non soft-deleted) records only, so a phone freed up by
    deactivating a customer/supplier can be reused by a new one — matches
    the existing soft-delete semantics used everywhere else in the app
    (`deleted_at is null` filters in CustomersPage/SuppliersPage).

This is the authoritative guarantee — enforced at the database level so it
holds regardless of which code path (AI Assistant, manual form, future
API) attempts the insert/update. The client also pre-checks and shows a
friendly warning before hitting this constraint, but the constraint is
what actually prevents the duplicate under concurrent writes.

Customer and Supplier get identical treatment, per the requirement that
duplicate-prevention rules be the same quality for both.

NOTE: if any shop already has two active customers (or suppliers) sharing
a phone number, this migration will fail to apply until that pre-existing
duplicate is resolved (blank one of the numbers, or merge the records) —
this is intentional: silently picking a "winner" between two existing
records would itself be a silent, unreviewed data change.
*/

create unique index if not exists uniq_customers_shop_phone
  on customers(shop_id, primary_phone)
  where primary_phone is not null and primary_phone <> '' and deleted_at is null;

create unique index if not exists uniq_suppliers_shop_phone
  on suppliers(shop_id, primary_phone)
  where primary_phone is not null and primary_phone <> '' and deleted_at is null;
