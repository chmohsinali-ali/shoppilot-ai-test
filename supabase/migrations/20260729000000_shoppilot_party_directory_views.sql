-- customer_directory / supplier_directory
--
-- EmbeddedPartyPicker.tsx (the AI Assistant's duplicate-name disambiguation
-- picker) queries these two views directly, but they were never checked
-- into migration history — only created ad hoc directly on the live
-- database. A fresh environment running just the migrations folder would
-- be missing them and the multi-match picker would fail. This migration
-- checks them into history so every environment has them.
--
-- Dropped and recreated (rather than `create or replace`) because the
-- ad hoc live version may have a different column shape, and Postgres
-- does not allow `create or replace view` to drop/reorder columns.
--
-- Plain views (invoker rights, the Postgres default) — they read straight
-- from customers/suppliers, so the existing row-level-security policies on
-- those tables already scope every query to the caller's own shop, exactly
-- like every other read in the app.

drop view if exists customer_directory;
drop view if exists supplier_directory;

create view customer_directory as
select
  c.id,
  c.shop_id,
  c.full_name,
  c.customer_code,
  c.primary_phone,
  coalesce(get_customer_balance(c.id), 0)::numeric as current_balance
from customers c;

create view supplier_directory as
select
  s.id,
  s.shop_id,
  s.supplier_name,
  s.supplier_code,
  s.primary_phone,
  coalesce(get_supplier_balance(s.id), 0)::numeric as current_payable
from suppliers s;
