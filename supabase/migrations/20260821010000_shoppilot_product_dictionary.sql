/*
# ShopPilot AI — Bilingual product dictionary (Urdu + English + voice aliases)

1. Problem
The AI Assistant never matched a spoken product name against the shop's
own product catalog — every voice sale/purchase line was free text with
no product_id, no Urdu/English pairing, and no memory of how a shopkeeper
pronounces a given product ("pyaz", "piyaz", "pyaaz" were all unrelated
strings). This also meant a shopkeeper had to either manually pre-create
every product, or accept whatever raw transcript text landed on the
invoice.

2. Fix
- `products.urdu_name` — the product's Urdu-script display name,
  alongside the existing `name` column which is treated as the
  canonical English display name.
- `product_aliases` — every phrase (Urdu, English, or a phonetic Roman
  variant) known to resolve to a given product, scoped per shop so one
  shopkeeper's local pronunciation never affects another shop's data.
  A unique index on (shop_id, lower(alias)) prevents the same alias text
  from ever being registered against two different products in one shop.
- `sale_items.product_name_ur` / `purchase_items.product_name_ur` — the
  Urdu name is snapshotted onto the invoice line at save time, exactly
  like `product_name` (English) already is, so a historical invoice
  keeps showing what it showed at the time even if the product's Urdu
  name is edited later.

3. Security
`product_aliases` gets the same four-policy shop_owner() RLS pattern used
by every other shop-scoped table in this schema.
*/

alter table products add column if not exists urdu_name text;

create table if not exists product_aliases (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);
alter table product_aliases enable row level security;

drop policy if exists "owner_select_product_aliases" on product_aliases;
create policy "owner_select_product_aliases" on product_aliases for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_product_aliases" on product_aliases;
create policy "owner_insert_product_aliases" on product_aliases for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_product_aliases" on product_aliases;
create policy "owner_update_product_aliases" on product_aliases for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

drop policy if exists "owner_delete_product_aliases" on product_aliases;
create policy "owner_delete_product_aliases" on product_aliases for delete to authenticated
  using (shop_owner(shop_id));

create unique index if not exists uniq_product_alias_per_shop on product_aliases(shop_id, lower(alias));
create index if not exists idx_product_aliases_shop on product_aliases(shop_id);
create index if not exists idx_product_aliases_product on product_aliases(product_id);

alter table sale_items add column if not exists product_name_ur text;
alter table purchase_items add column if not exists product_name_ur text;
