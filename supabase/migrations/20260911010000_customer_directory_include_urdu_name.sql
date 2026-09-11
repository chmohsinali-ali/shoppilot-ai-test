/*
# ShopPilot AI — Include Urdu name in customer_directory

1. Problem
`customer_directory` (used by EmbeddedPartyPicker for duplicate-name
results in the Add Customer flow and AI Assistant chat) predates the
`customers.full_name_ur` column (20260909010000), so it never carried
it — the duplicate-match list only ever showed the English name, even
though the rest of the app (Customers list, Customer Detail header) now
shows "English / Urdu" wherever a saved customer's name is displayed.

2. Fix
Recreate the view with `c.full_name_ur` added. No other column/shape
changes, so no other caller needs updating.
*/

drop view if exists customer_directory;
create view customer_directory as
select
  c.id,
  c.shop_id,
  c.full_name,
  c.full_name_ur,
  c.customer_code,
  c.primary_phone,
  coalesce(get_customer_balance(c.id), 0)::numeric as current_balance
from customers c
where c.deleted_at is null;
