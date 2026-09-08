/*
# ShopPilot AI — Short, sequential Sale Reference for the UI

1. Purpose
`sales.invoice_number` (e.g. "SALE-2026-000001") is the internal
identifier used by create_sale(), cancel_sale(), audit_logs, and the
customer_ledger.reference_number column — it must not change.
However it is too long/unfriendly to show as the primary user-facing
"Sale Reference" in the UI. This adds a second, purely-cosmetic
column, `display_seq`, that is a simple per-shop sequential integer
(1, 2, 3, ...) so the frontend can render it as "S1", "S2", "S3", ...
without ever resetting or repeating within a shop.

2. Design
- `display_seq` is backfilled for all existing sales, ordered by
  creation order, so historical sales get a consistent number too.
- A BEFORE INSERT trigger assigns the next value automatically for
  every new sale — no changes needed to create_sale() or any other
  RPC, so no existing behavior/identifiers are touched.
- A unique (shop_id, display_seq) constraint guarantees the reference
  never collides within a shop, and it never resets by year (unlike
  next_number(), which is intentionally left untouched here since it
  is shared by SALE/PUR/CPAY/SPAY/SRET/PRET and changing it would
  affect unrelated modules).

3. Security
No RLS/policy changes — display_seq is just a plain column on the
existing `sales` table, covered by the table's existing policies.
*/

alter table sales add column if not exists display_seq integer;

-- Backfill existing sales: sequential per shop, oldest first.
with numbered as (
  select id, row_number() over (partition by shop_id order by created_at, id) as rn
  from sales
  where display_seq is null
)
update sales
   set display_seq = numbered.rn
  from numbered
 where sales.id = numbered.id;

create unique index if not exists idx_sales_shop_display_seq on sales(shop_id, display_seq);

create or replace function set_sale_display_seq()
returns trigger
language plpgsql
as $$
begin
  if new.display_seq is null then
    select coalesce(max(display_seq), 0) + 1 into new.display_seq
      from sales
     where shop_id = new.shop_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_sale_display_seq on sales;
create trigger trg_set_sale_display_seq
  before insert on sales
  for each row
  execute function set_sale_display_seq();
