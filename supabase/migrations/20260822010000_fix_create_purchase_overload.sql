/*
# ShopPilot AI — Fix ambiguous create_purchase() overload

1. Problem
`20260726165125_shoppilot_extended_modules.sql` created create_purchase()
with 15 parameters. `20260728021531_shoppilot_fmcg_invoice_fields.sql`
later added `p_supplier_invoice_status` and `p_shop_customer_number` (both
with defaults) via `create or replace function` — but Postgres only
replaces a function when the parameter TYPE list matches exactly. Adding
two new parameters (even with defaults) created a SECOND, separate
17-parameter overload instead of replacing the original 15-parameter one.
Neither migration ever dropped the original.

The app calls `create_purchase` with exactly 15 named arguments (see
`confirmPurchase` in AssistantPage.tsx). Postgres now has two equally
valid candidates for that call (the 15-arg function, and the 17-arg one
where the 2 trailing params fall back to their defaults), so it cannot
pick one — this is the "could not choose the best candidate function"
error shopkeepers hit when confirming a purchase/supplier entry.

2. Fix
Drop the original 15-parameter overload. The 17-parameter version (kept
up to date by the later `..._bilingual_item_names.sql` migration) remains
as the single, unambiguous create_purchase() function — its trailing two
parameters already default to 'open' / null, so every existing caller
(including the 15-arg call the app makes today) keeps working unchanged.
*/

drop function if exists create_purchase(
  uuid, uuid, text, text, timestamptz, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, text, uuid
);
