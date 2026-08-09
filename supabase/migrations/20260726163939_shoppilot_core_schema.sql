/*
# ShopPilot AI — Core Schema

1. Purpose
This migration creates the foundation for ShopPilot AI, a multi-tenant shop
management application. Each shop is a tenant. All business records are scoped
to a shop. The authenticated owner of a shop can read/write only their own
shop's data.

2. New Tables
- `shops` — tenant root: shop profile, business type, currency, settings (JSONB).
- `customers` — customer master with opening balance, credit config, soft-delete.
- `products` — product master (catalog mode) with prices, stock, unit, reorder level.
- `sales` — sale header (invoice number, customer, totals, payment status).
- `sale_items` — line items with permanent price/qty/discount snapshot.
- `customer_ledger` — immutable ledger entries; customer balance is derived from this.
- `expenses` — expense records with category, amount, payment method.
- `audit_logs` — append-only audit trail of sensitive actions.
- `number_sequences` — concurrency-safe per-shop invoice/expense number generator.

3. Money
All monetary columns use NUMERIC(14,2). Quantities use NUMERIC(14,3) to allow
fractional units (0.5 kg, 1.25 L).

4. Security (RLS)
Every table has RLS enabled. Access is scoped to the shop owner via the
`shop_owner()` helper: a row is visible/editable iff the requesting user owns the
shop it belongs to. Owner is determined by `auth.uid()` matching the shop's
`owner_id`. The `shops` table is directly owner-scoped.

5. Concurrency-safe numbering
`next_number(shop_id, prefix)` is a SECURITY DEFINER function that atomically
increments and returns the next sequence value for a given shop + prefix
(e.g. 'SALE' -> 'SALE-2026-000001'). It locks the sequence row for the duration
of the transaction.

6. Atomic sale creation
`create_sale(...)` is a SECURITY DEFINER PL/pgSQL function that creates a sale,
its line items, the customer ledger debit entry, and decrements product stock —
all inside one transaction. It returns the created sale id. It is the single
source of truth for sale creation; the frontend never writes these tables directly.
*/

-- ---------- shops ----------
create table if not exists shops (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  business_type text not null default 'general_store',
  currency      text not null default 'PKR',
  phone         text,
  whatsapp      text,
  email         text,
  address       text,
  city          text,
  country       text not null default 'Pakistan',
  logo_url      text,
  receipt_header text,
  receipt_footer text,
  inventory_enabled boolean not null default true,
  catalog_enabled  boolean not null default false,
  tax_enabled   boolean not null default false,
  default_tax_rate numeric(5,2) not null default 0,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table shops enable row level security;

drop policy if exists "owner_read_shops" on shops;
create policy "owner_read_shops" on shops for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "owner_insert_shops" on shops;
create policy "owner_insert_shops" on shops for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "owner_update_shops" on shops;
create policy "owner_update_shops" on shops for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "owner_delete_shops" on shops;
create policy "owner_delete_shops" on shops for delete to authenticated
  using (auth.uid() = owner_id);

-- ---------- helper: shop owner check ----------
create or replace function shop_owner(p_shop_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from shops
    where id = p_shop_id and owner_id = auth.uid()
  );
$$;

-- ---------- customers ----------
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  customer_code   text,
  full_name       text not null,
  father_name     text,
  business_name   text,
  primary_phone   text,
  secondary_phone text,
  whatsapp_number text,
  email           text,
  national_id     text,
  customer_type   text not null default 'retail',
  credit_enabled  boolean not null default true,
  credit_limit    numeric(14,2),
  opening_balance numeric(14,2) not null default 0,
  opening_balance_type text not null default 'customer_owes',
  address_line1   text,
  area            text,
  city            text,
  province        text,
  country         text not null default 'Pakistan',
  notes           text,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
alter table customers enable row level security;

drop policy if exists "owner_select_customers" on customers;
create policy "owner_select_customers" on customers for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_customers" on customers;
create policy "owner_insert_customers" on customers for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_customers" on customers;
create policy "owner_update_customers" on customers for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

drop policy if exists "owner_delete_customers" on customers;
create policy "owner_delete_customers" on customers for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_customers_shop on customers(shop_id);
create index if not exists idx_customers_name on customers(shop_id, full_name);
create index if not exists idx_customers_phone on customers(shop_id, primary_phone);
create index if not exists idx_customers_code on customers(shop_id, customer_code);

-- ---------- products ----------
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  product_code    text,
  sku             text,
  barcode         text,
  name            text not null,
  description     text,
  category        text,
  brand           text,
  unit            text not null default 'piece',
  purchase_price  numeric(14,2) not null default 0,
  sale_price      numeric(14,2) not null default 0,
  stock           numeric(14,3) not null default 0,
  min_stock_level numeric(14,3) not null default 0,
  reorder_qty     numeric(14,3) not null default 0,
  tax_rate        numeric(5,2) not null default 0,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
alter table products enable row level security;

drop policy if exists "owner_select_products" on products;
create policy "owner_select_products" on products for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_products" on products;
create policy "owner_insert_products" on products for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_products" on products;
create policy "owner_update_products" on products for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

drop policy if exists "owner_delete_products" on products;
create policy "owner_delete_products" on products for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_products_shop on products(shop_id);
create index if not exists idx_products_name on products(shop_id, name);
create index if not exists idx_products_sku on products(shop_id, sku);
create index if not exists idx_products_barcode on products(shop_id, barcode);

-- ---------- sales ----------
create table if not exists sales (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  invoice_number  text not null,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,
  sale_date       timestamptz not null default now(),
  subtotal        numeric(14,2) not null default 0,
  discount_total  numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  balance         numeric(14,2) not null default 0,
  payment_status  text not null default 'cash',
  payment_method  text not null default 'cash',
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table sales enable row level security;

drop policy if exists "owner_select_sales" on sales;
create policy "owner_select_sales" on sales for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_sales" on sales;
create policy "owner_insert_sales" on sales for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_sales" on sales;
create policy "owner_update_sales" on sales for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

drop policy if exists "owner_delete_sales" on sales;
create policy "owner_delete_sales" on sales for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_sales_shop on sales(shop_id);
create index if not exists idx_sales_invoice on sales(shop_id, invoice_number);
create index if not exists idx_sales_customer on sales(shop_id, customer_id);
create index if not exists idx_sales_date on sales(shop_id, sale_date);

-- ---------- sale_items ----------
create table if not exists sale_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references sales(id) on delete cascade,
  shop_id       uuid not null references shops(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  unit          text not null default 'piece',
  quantity      numeric(14,3) not null,
  price         numeric(14,2) not null,
  discount      numeric(14,2) not null default 0,
  tax_rate      numeric(5,2) not null default 0,
  line_total    numeric(14,2) not null,
  created_at    timestamptz not null default now()
);
alter table sale_items enable row level security;

drop policy if exists "owner_select_sale_items" on sale_items;
create policy "owner_select_sale_items" on sale_items for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_sale_items" on sale_items;
create policy "owner_insert_sale_items" on sale_items for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_delete_sale_items" on sale_items;
create policy "owner_delete_sale_items" on sale_items for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_shop on sale_items(shop_id);

-- ---------- customer_ledger ----------
create table if not exists customer_ledger (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  transaction_date timestamptz not null default now(),
  entry_type       text not null,
  reference_type  text,
  reference_id    uuid,
  reference_number text,
  description     text,
  debit_amount    numeric(14,2) not null default 0,
  credit_amount   numeric(14,2) not null default 0,
  running_balance numeric(14,2) not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table customer_ledger enable row level security;

drop policy if exists "owner_select_ledger" on customer_ledger;
create policy "owner_select_ledger" on customer_ledger for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_ledger" on customer_ledger;
create policy "owner_insert_ledger" on customer_ledger for insert to authenticated
  with check (shop_owner(shop_id));

create index if not exists idx_ledger_customer on customer_ledger(shop_id, customer_id);
create index if not exists idx_ledger_date on customer_ledger(shop_id, transaction_date);

-- ---------- expenses ----------
create table if not exists expenses (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  expense_number text,
  expense_date   timestamptz not null default now(),
  category       text not null,
  vendor         text,
  description    text,
  amount         numeric(14,2) not null,
  payment_method text not null default 'cash',
  notes          text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table expenses enable row level security;

drop policy if exists "owner_select_expenses" on expenses;
create policy "owner_select_expenses" on expenses for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_expenses" on expenses;
create policy "owner_insert_expenses" on expenses for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_expenses" on expenses;
create policy "owner_update_expenses" on expenses for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

drop policy if exists "owner_delete_expenses" on expenses;
create policy "owner_delete_expenses" on expenses for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_expenses_shop on expenses(shop_id);
create index if not exists idx_expenses_date on expenses(shop_id, expense_date);

-- ---------- audit_logs ----------
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid references shops(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
alter table audit_logs enable row level security;

drop policy if exists "owner_select_audit" on audit_logs;
create policy "owner_select_audit" on audit_logs for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_audit" on audit_logs;
create policy "owner_insert_audit" on audit_logs for insert to authenticated
  with check (shop_owner(shop_id));

create index if not exists idx_audit_shop on audit_logs(shop_id);
create index if not exists idx_audit_created on audit_logs(created_at);

-- ---------- number_sequences ----------
create table if not exists number_sequences (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references shops(id) on delete cascade,
  prefix    text not null,
  year      int not null default extract(year from now())::int,
  last_value int not null default 0,
  unique (shop_id, prefix, year)
);
alter table number_sequences enable row level security;

drop policy if exists "owner_select_seq" on number_sequences;
create policy "owner_select_seq" on number_sequences for select to authenticated
  using (shop_owner(shop_id));

drop policy if exists "owner_insert_seq" on number_sequences;
create policy "owner_insert_seq" on number_sequences for insert to authenticated
  with check (shop_owner(shop_id));

drop policy if exists "owner_update_seq" on number_sequences;
create policy "owner_update_seq" on number_sequences for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

-- ---------- next_number() ----------
create or replace function next_number(p_shop_id uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_next int;
  v_padded text;
begin
  insert into number_sequences (shop_id, prefix, year, last_value)
  values (p_shop_id, p_prefix, v_year, 0)
  on conflict (shop_id, prefix, year) do nothing;

  update number_sequences
     set last_value = last_value + 1
   where shop_id = p_shop_id and prefix = p_prefix and year = v_year
  returning last_value into v_next;

  v_padded := lpad(v_next::text, 6, '0');
  return p_prefix || '-' || v_year || '-' || v_padded;
end;
$$;

-- ---------- create_sale() ----------
create or replace function create_sale(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_sale_date timestamptz,
  p_items jsonb,
  p_discount_total numeric,
  p_tax_total numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_notes text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_invoice text;
  v_subtotal numeric(14,2) := 0;
  v_grand numeric(14,2);
  v_balance numeric(14,2);
  v_payment_status text;
  v_item jsonb;
  v_line_total numeric(14,2);
  v_prev_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_pid text;
  v_items_arr jsonb[];
begin
  if not shop_owner(p_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  v_invoice := next_number(p_shop_id, 'SALE');

  v_items_arr := ARRAY(SELECT jsonb_array_elements(p_items));

  foreach v_item in array v_items_arr loop
    v_line_total := ((v_item->>'quantity')::numeric) * ((v_item->>'price')::numeric) - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand := v_subtotal - p_discount_total + p_tax_total;
  v_balance := v_grand - p_amount_paid;

  if v_balance <= 0.01 then
    v_payment_status := 'paid';
  elsif p_amount_paid > 0 then
    v_payment_status := 'partial';
  else
    v_payment_status := 'credit';
  end if;

  insert into sales (
    shop_id, invoice_number, customer_id, customer_name, sale_date,
    subtotal, discount_total, tax_total, grand_total,
    amount_paid, balance, payment_status, payment_method, notes, created_by
  ) values (
    p_shop_id, v_invoice, p_customer_id, p_customer_name, p_sale_date,
    v_subtotal, p_discount_total, p_tax_total, v_grand,
    p_amount_paid, v_balance, v_payment_status, p_payment_method, p_notes, p_user_id
  ) returning id into v_sale_id;

  foreach v_item in array v_items_arr loop
    v_line_total := ((v_item->>'quantity')::numeric) * ((v_item->>'price')::numeric) - coalesce((v_item->>'discount')::numeric, 0);
    v_pid := v_item->>'product_id';

    insert into sale_items (
      sale_id, shop_id, product_id, product_name, unit, quantity, price,
      discount, tax_rate, line_total
    ) values (
      v_sale_id, p_shop_id,
      nullif(v_pid, '')::uuid,
      v_item->>'product_name',
      coalesce(v_item->>'unit', 'piece'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      coalesce((v_item->>'discount')::numeric, 0),
      coalesce((v_item->>'tax_rate')::numeric, 0),
      v_line_total
    );

    if v_pid is not null and v_pid <> '' then
      update products
         set stock = stock - (v_item->>'quantity')::numeric,
             updated_at = now()
       where id = v_pid::uuid
         and shop_id = p_shop_id;
    end if;
  end loop;

  if p_customer_id is not null then
    select coalesce(sum(debit_amount - credit_amount), 0) into v_prev_balance
      from customer_ledger
     where customer_id = p_customer_id and shop_id = p_shop_id;

    v_new_balance := v_prev_balance + v_grand - p_amount_paid;

    insert into customer_ledger (
      shop_id, customer_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      p_shop_id, p_customer_id, p_sale_date, 'CREDIT_SALE',
      'sale', v_sale_id, v_invoice,
      'Sale ' || v_invoice,
      v_grand - p_amount_paid, 0, v_new_balance, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'sale.create', 'sale', v_sale_id,
    jsonb_build_object('invoice', v_invoice, 'total', v_grand, 'paid', p_amount_paid));

  return v_sale_id;
end;
$$;
