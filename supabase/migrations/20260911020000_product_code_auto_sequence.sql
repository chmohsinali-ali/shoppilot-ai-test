/*
# ShopPilot AI — Permanent, human-readable Product Code

1. Purpose
`products.product_code` has existed since the core schema but was never
populated or shown anywhere — every product's only real identity was
its internal uuid `id`. Per the shop's product-identity architecture
("Sugar" / "چینی" / "Chini" must resolve to ONE product, not three),
there needs to be a stable, human-readable code a shopkeeper can look
at on the Product Details view to confirm they're looking at one single
identity, no matter which name/language is currently displayed —
mirroring the exact pattern already used for sales.display_seq ("S1",
"S2", ...).

2. Design
- Format: "P" + zero-padded 5-digit per-shop sequence (P00001, P00002,
  ...) — never reused, never reset, assigned once at creation and never
  changed afterward.
- Backfilled for all existing products, ordered by creation order.
- A BEFORE INSERT trigger assigns the next code automatically for every
  new product — no application code needs to set it.
- A unique (shop_id, product_code) index guarantees no collision within
  a shop.

3. Security
No RLS/policy changes — product_code is a plain column on the existing
`products` table, covered by the table's existing policies.
*/

-- Backfill existing products: sequential per shop, oldest first.
with numbered as (
  select id, row_number() over (partition by shop_id order by created_at, id) as rn
  from products
  where product_code is null
)
update products
   set product_code = 'P' || lpad(numbered.rn::text, 5, '0')
  from numbered
 where products.id = numbered.id;

create unique index if not exists idx_products_shop_product_code on products(shop_id, product_code);

create or replace function set_product_code()
returns trigger
language plpgsql
as $$
declare
  v_next integer;
begin
  if new.product_code is null then
    select coalesce(max(substring(product_code from 2)::integer), 0) + 1 into v_next
      from products
     where shop_id = new.shop_id and product_code is not null;
    new.product_code := 'P' || lpad(v_next::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_product_code on products;
create trigger trg_set_product_code
  before insert on products
  for each row
  execute function set_product_code();
