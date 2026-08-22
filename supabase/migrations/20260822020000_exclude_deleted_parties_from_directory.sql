/*
# ShopPilot AI — Exclude soft-deleted customers/suppliers from AI lookups

1. Problem
"Deleting" a customer/supplier from the Customers/Suppliers pages is a
soft delete (DeactivateCustomerModal etc. set `deleted_at` and
`status = 'inactive'` — the row stays in the table, see
20260726163939_shoppilot_core_schema.sql). The Customers/Suppliers list
pages already filter `deleted_at is null`, but `customer_directory` /
`supplier_directory` (used by the AI Assistant's EmbeddedPartyPicker for
duplicate-name and balance-search results) never did — so a shopkeeper
who deactivated every customer would still see them resolved as existing
matches inside the AI chat.

2. Fix
Recreate both views filtered to `deleted_at is null`, matching what the
rest of the app already treats as "gone". No column/shape changes, so no
caller needs updating beyond this.
*/

drop view if exists customer_directory;
create view customer_directory as
select
  c.id,
  c.shop_id,
  c.full_name,
  c.customer_code,
  c.primary_phone,
  coalesce(get_customer_balance(c.id), 0)::numeric as current_balance
from customers c
where c.deleted_at is null;

drop view if exists supplier_directory;
create view supplier_directory as
select
  s.id,
  s.shop_id,
  s.supplier_name,
  s.supplier_code,
  s.primary_phone,
  coalesce(get_supplier_balance(s.id), 0)::numeric as current_payable
from suppliers s
where s.deleted_at is null;
