/*
# ShopPilot AI — Suppliers, Purchases, Returns, Warranty, Notifications, Daily Closing

1. Purpose
Extends the core schema with supplier management, purchase invoices (with
free-unit and discount support), sale/purchase returns, warranty tracking,
warranty claims, in-app notifications, and daily-closing records. All tables
are multi-tenant (shop-scoped) with RLS enforced via the existing shop_owner()
helper.

2. New Tables
- `suppliers` — supplier master with distributor fields, opening balance, soft-delete.
- `supplier_ledger` — immutable supplier ledger; payable balance derived from this.
- `purchases` — purchase header (supplier invoice number, distributor fields, totals, free units).
- `purchase_items` — line items with free_units, discounts, batch/expiry, effective cost.
- `sale_returns` — return header linked to a sale; refund amount, stock restock flag.
- `sale_return_items` — returned line items.
- `purchase_returns` — return to supplier; stock decrease, payable adjustment.
- `purchase_return_items` — returned purchase line items.
- `warranties` — warranty record linked to a sale item; auto-calculated expiry.
- `warranty_claims` — claims against a warranty with status workflow.
- `notifications` — in-app notification center (type, read status, archived).
- `daily_closings` — per-day cash reconciliation; once locked cannot edit.

3. Money
All monetary columns use NUMERIC(14,2). Quantities use NUMERIC(14,3).

4. Security (RLS)
Every table has RLS enabled. Access is scoped to the shop owner via shop_owner().
Four separate CRUD policies per table (no FOR ALL).

5. New Functions
- `create_purchase(...)` — SECURITY DEFINER. Atomically creates purchase + items +
  supplier ledger credit entry + stock increase + audit log. Handles free units
  (increases stock without increasing payable) and effective cost calculation.
- `pay_supplier(...)` — SECURITY DEFINER. Records supplier payment, creates
  ledger debit entry, returns new payable balance.
- `record_sale_return(...)` — SECURITY DEFINER. Creates sale return + items +
  customer ledger credit (reduces what customer owes) + stock restock + audit.
- `record_purchase_return(...)` — SECURITY DEFINER. Creates purchase return +
  supplier ledger debit (reduces payable) + stock decrease + audit.
- `get_supplier_balance(supplier_id)` — returns current payable balance.
*/

-- ---------- suppliers ----------
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  supplier_code   text,
  supplier_name   text not null,
  company_name    text,
  contact_person text,
  primary_phone   text,
  secondary_phone text,
  whatsapp_number text,
  email           text,
  distributor_contact text,
  tso_contact     text,
  registration_number text,
  tax_number      text,
  channel         text,
  customer_number_with_supplier text,
  route           text,
  sub_locality    text,
  order_booker_name text,
  distribution_manager_name text,
  default_payment_days int,
  credit_limit    numeric(14,2),
  opening_balance numeric(14,2) not null default 0,
  opening_balance_type text not null default 'shop_owes',
  address_line1   text,
  area            text,
  city            text,
  province        text,
  country         text not null default 'Pakistan',
  bank_account_title text,
  bank_name       text,
  bank_account_number text,
  iban            text,
  notes           text,
  tags            text[] default '{}',
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
alter table suppliers enable row level security;

drop policy if exists "owner_select_suppliers" on suppliers;
create policy "owner_select_suppliers" on suppliers for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_suppliers" on suppliers;
create policy "owner_insert_suppliers" on suppliers for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_suppliers" on suppliers;
create policy "owner_update_suppliers" on suppliers for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));
drop policy if exists "owner_delete_suppliers" on suppliers;
create policy "owner_delete_suppliers" on suppliers for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_suppliers_shop on suppliers(shop_id);
create index if not exists idx_suppliers_name on suppliers(shop_id, supplier_name);
create index if not exists idx_suppliers_phone on suppliers(shop_id, primary_phone);

-- ---------- supplier_ledger ----------
create table if not exists supplier_ledger (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  supplier_id     uuid not null references suppliers(id) on delete cascade,
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
alter table supplier_ledger enable row level security;

drop policy if exists "owner_select_sledger" on supplier_ledger;
create policy "owner_select_sledger" on supplier_ledger for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_sledger" on supplier_ledger;
create policy "owner_insert_sledger" on supplier_ledger for insert to authenticated
  with check (shop_owner(shop_id));

create index if not exists idx_sledger_supplier on supplier_ledger(shop_id, supplier_id);
create index if not exists idx_sledger_date on supplier_ledger(shop_id, transaction_date);

-- ---------- purchases ----------
create table if not exists purchases (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  purchase_number text not null,
  supplier_invoice_number text,
  supplier_id     uuid references suppliers(id) on delete set null,
  supplier_name   text,
  distributor_contact text,
  tso_contact     text,
  channel         text,
  route           text,
  sub_locality    text,
  order_booker_name text,
  distribution_manager_name text,
  purchase_date   timestamptz not null default now(),
  subtotal        numeric(14,2) not null default 0,
  discount_total  numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  delivery_charges numeric(14,2) not null default 0,
  freight         numeric(14,2) not null default 0,
  other_charges   numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  balance         numeric(14,2) not null default 0,
  payment_status  text not null default 'cash',
  payment_method  text not null default 'cash',
  due_date        date,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table purchases enable row level security;

drop policy if exists "owner_select_purchases" on purchases;
create policy "owner_select_purchases" on purchases for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_purchases" on purchases;
create policy "owner_insert_purchases" on purchases for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_purchases" on purchases;
create policy "owner_update_purchases" on purchases for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));
drop policy if exists "owner_delete_purchases" on purchases;
create policy "owner_delete_purchases" on purchases for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_purchases_shop on purchases(shop_id);
create index if not exists idx_purchases_number on purchases(shop_id, purchase_number);
create index if not exists idx_purchases_supplier on purchases(shop_id, supplier_id);
create index if not exists idx_purchases_date on purchases(shop_id, purchase_date);

-- ---------- purchase_items ----------
create table if not exists purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references purchases(id) on delete cascade,
  shop_id       uuid not null references shops(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  unit          text not null default 'piece',
  ordered_quantity numeric(14,3) not null,
  free_units    numeric(14,3) not null default 0,
  total_received_quantity numeric(14,3) not null default 0,
  price_per_unit numeric(14,2) not null,
  gross_value   numeric(14,2) not null,
  regular_discount numeric(14,2) not null default 0,
  special_discount numeric(14,2) not null default 0,
  scheme_discount numeric(14,2) not null default 0,
  additional_discount numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  tax_rate      numeric(5,2) not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  net_amount    numeric(14,2) not null,
  batch_number  text,
  manufacturing_date date,
  expiry_date   date,
  serial_numbers text,
  effective_cost_per_unit numeric(14,2) not null default 0,
  created_at    timestamptz not null default now()
);
alter table purchase_items enable row level security;

drop policy if exists "owner_select_pitems" on purchase_items;
create policy "owner_select_pitems" on purchase_items for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_pitems" on purchase_items;
create policy "owner_insert_pitems" on purchase_items for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_delete_pitems" on purchase_items;
create policy "owner_delete_pitems" on purchase_items for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_pitems_purchase on purchase_items(purchase_id);
create index if not exists idx_pitems_shop on purchase_items(shop_id);

-- ---------- sale_returns ----------
create table if not exists sale_returns (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  return_number   text not null,
  sale_id         uuid not null references sales(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,
  return_date     timestamptz not null default now(),
  reason          text,
  refund_amount   numeric(14,2) not null default 0,
  restock_items   boolean not null default true,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table sale_returns enable row level security;

drop policy if exists "owner_select_sreturns" on sale_returns;
create policy "owner_select_sreturns" on sale_returns for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_sreturns" on sale_returns;
create policy "owner_insert_sreturns" on sale_returns for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_delete_sreturns" on sale_returns;
create policy "owner_delete_sreturns" on sale_returns for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_sreturns_shop on sale_returns(shop_id);
create index if not exists idx_sreturns_sale on sale_returns(sale_id);

-- ---------- sale_return_items ----------
create table if not exists sale_return_items (
  id            uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references sale_returns(id) on delete cascade,
  shop_id       uuid not null references shops(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  quantity      numeric(14,3) not null,
  price         numeric(14,2) not null,
  line_total    numeric(14,2) not null,
  created_at    timestamptz not null default now()
);
alter table sale_return_items enable row level security;

drop policy if exists "owner_select_sritems" on sale_return_items;
create policy "owner_select_sritems" on sale_return_items for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_sritems" on sale_return_items;
create policy "owner_insert_sritems" on sale_return_items for insert to authenticated
  with check (shop_owner(shop_id));

create index if not exists idx_sritems_return on sale_return_items(sale_return_id);

-- ---------- purchase_returns ----------
create table if not exists purchase_returns (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  return_number   text not null,
  purchase_id     uuid references purchases(id) on delete set null,
  supplier_id     uuid references suppliers(id) on delete set null,
  supplier_name   text,
  return_date     timestamptz not null default now(),
  reason          text,
  refund_amount   numeric(14,2) not null default 0,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table purchase_returns enable row level security;

drop policy if exists "owner_select_preturns" on purchase_returns;
create policy "owner_select_preturns" on purchase_returns for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_preturns" on purchase_returns;
create policy "owner_insert_preturns" on purchase_returns for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_delete_preturns" on purchase_returns;
create policy "owner_delete_preturns" on purchase_returns for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_preturns_shop on purchase_returns(shop_id);
create index if not exists idx_preturns_purchase on purchase_returns(purchase_id);

-- ---------- purchase_return_items ----------
create table if not exists purchase_return_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references purchase_returns(id) on delete cascade,
  shop_id       uuid not null references shops(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  quantity      numeric(14,3) not null,
  price         numeric(14,2) not null,
  line_total    numeric(14,2) not null,
  created_at    timestamptz not null default now()
);
alter table purchase_return_items enable row level security;

drop policy if exists "owner_select_pritems" on purchase_return_items;
create policy "owner_select_pritems" on purchase_return_items for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_pritems" on purchase_return_items;
create policy "owner_insert_pritems" on purchase_return_items for insert to authenticated
  with check (shop_owner(shop_id));

create index if not exists idx_pritems_return on purchase_return_items(purchase_return_id);

-- ---------- warranties ----------
create table if not exists warranties (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  warranty_number text not null,
  sale_id         uuid references sales(id) on delete set null,
  sale_item_id    uuid references sale_items(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,
  product_name    text not null,
  serial_number   text,
  batch_number    text,
  warranty_provider text,
  warranty_start_date date not null default current_date,
  warranty_duration int not null default 0,
  warranty_unit   text not null default 'months',
  warranty_expiry_date date not null,
  warranty_terms  text,
  status          text not null default 'active',
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table warranties enable row level security;

drop policy if exists "owner_select_warranties" on warranties;
create policy "owner_select_warranties" on warranties for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_warranties" on warranties;
create policy "owner_insert_warranties" on warranties for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_warranties" on warranties;
create policy "owner_update_warranties" on warranties for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));
drop policy if exists "owner_delete_warranties" on warranties;
create policy "owner_delete_warranties" on warranties for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_warranties_shop on warranties(shop_id);
create index if not exists idx_warranties_customer on warranties(shop_id, customer_id);
create index if not exists idx_warranties_expiry on warranties(warranty_expiry_date);

-- ---------- warranty_claims ----------
create table if not exists warranty_claims (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  claim_number    text not null,
  warranty_id     uuid not null references warranties(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,
  product_name    text not null,
  claim_date      timestamptz not null default now(),
  problem_description text,
  technician_notes text,
  claim_status    text not null default 'pending',
  resolution_date date,
  cost            numeric(14,2) not null default 0,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table warranty_claims enable row level security;

drop policy if exists "owner_select_wclaims" on warranty_claims;
create policy "owner_select_wclaims" on warranty_claims for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_wclaims" on warranty_claims;
create policy "owner_insert_wclaims" on warranty_claims for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_wclaims" on warranty_claims;
create policy "owner_update_wclaims" on warranty_claims for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

create index if not exists idx_wclaims_shop on warranty_claims(shop_id);
create index if not exists idx_wclaims_warranty on warranty_claims(warranty_id);
create index if not exists idx_wclaims_status on warranty_claims(shop_id, claim_status);

-- ---------- notifications ----------
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  type            text not null default 'info',
  title           text not null,
  message         text,
  entity_type     text,
  entity_id       uuid,
  is_read         boolean not null default false,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table notifications enable row level security;

drop policy if exists "owner_select_notif" on notifications;
create policy "owner_select_notif" on notifications for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_notif" on notifications;
create policy "owner_insert_notif" on notifications for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_notif" on notifications;
create policy "owner_update_notif" on notifications for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));
drop policy if exists "owner_delete_notif" on notifications;
create policy "owner_delete_notif" on notifications for delete to authenticated
  using (shop_owner(shop_id));

create index if not exists idx_notif_shop on notifications(shop_id);
create index if not exists idx_notif_read on notifications(shop_id, is_read);

-- ---------- daily_closings ----------
create table if not exists daily_closings (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  closing_date    date not null,
  opening_cash    numeric(14,2) not null default 0,
  cash_sales      numeric(14,2) not null default 0,
  customer_payments numeric(14,2) not null default 0,
  supplier_payments numeric(14,2) not null default 0,
  expenses        numeric(14,2) not null default 0,
  cash_withdrawals numeric(14,2) not null default 0,
  cash_deposits   numeric(14,2) not null default 0,
  expected_cash   numeric(14,2) not null default 0,
  actual_cash     numeric(14,2) not null default 0,
  difference      numeric(14,2) not null default 0,
  manager_notes   text,
  is_locked       boolean not null default false,
  closed_by       uuid references auth.users(id) on delete set null,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (shop_id, closing_date)
);
alter table daily_closings enable row level security;

drop policy if exists "owner_select_closings" on daily_closings;
create policy "owner_select_closings" on daily_closings for select to authenticated
  using (shop_owner(shop_id));
drop policy if exists "owner_insert_closings" on daily_closings;
create policy "owner_insert_closings" on daily_closings for insert to authenticated
  with check (shop_owner(shop_id));
drop policy if exists "owner_update_closings" on daily_closings;
create policy "owner_update_closings" on daily_closings for update to authenticated
  using (shop_owner(shop_id)) with check (shop_owner(shop_id));

create index if not exists idx_closings_shop on daily_closings(shop_id);
create index if not exists idx_closings_date on daily_closings(shop_id, closing_date);

-- ---------- get_supplier_balance() ----------
create or replace function get_supplier_balance(p_supplier_id uuid)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(credit_amount - debit_amount), 0)::numeric
    from supplier_ledger
   where supplier_id = p_supplier_id;
$$;

-- ---------- create_purchase() ----------
create or replace function create_purchase(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_supplier_invoice_number text,
  p_purchase_date timestamptz,
  p_items jsonb,
  p_discount_total numeric,
  p_tax_total numeric,
  p_delivery_charges numeric,
  p_freight numeric,
  p_other_charges numeric,
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
  v_purchase_id uuid;
  v_number text;
  v_subtotal numeric(14,2) := 0;
  v_grand numeric(14,2);
  v_balance numeric(14,2);
  v_payment_status text;
  v_item jsonb;
  v_gross numeric(14,2);
  v_total_disc numeric(14,2);
  v_net numeric(14,2);
  v_received numeric(14,3);
  v_eff_cost numeric(14,2);
  v_prev_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_items_arr jsonb[];
begin
  if not shop_owner(p_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  v_number := next_number(p_shop_id, 'PUR');
  v_items_arr := ARRAY(SELECT jsonb_array_elements(p_items));

  foreach v_item in array v_items_arr loop
    v_gross := ((v_item->>'ordered_quantity')::numeric) * ((v_item->>'price_per_unit')::numeric);
    v_subtotal := v_subtotal + v_gross;
  end loop;

  v_grand := v_subtotal - p_discount_total + p_tax_total + p_delivery_charges + p_freight + p_other_charges;
  v_balance := v_grand - p_amount_paid;

  if v_balance <= 0.01 then
    v_payment_status := 'paid';
  elsif p_amount_paid > 0 then
    v_payment_status := 'partial';
  else
    v_payment_status := 'credit';
  end if;

  insert into purchases (
    shop_id, purchase_number, supplier_invoice_number, supplier_id, supplier_name,
    purchase_date, subtotal, discount_total, tax_total,
    delivery_charges, freight, other_charges, grand_total,
    amount_paid, balance, payment_status, payment_method, notes, created_by
  ) values (
    p_shop_id, v_number, p_supplier_invoice_number, p_supplier_id, p_supplier_name,
    p_purchase_date, v_subtotal, p_discount_total, p_tax_total,
    p_delivery_charges, p_freight, p_other_charges, v_grand,
    p_amount_paid, v_balance, v_payment_status, p_payment_method, p_notes, p_user_id
  ) returning id into v_purchase_id;

  foreach v_item in array v_items_arr loop
    v_gross := ((v_item->>'ordered_quantity')::numeric) * ((v_item->>'price_per_unit')::numeric);
    v_total_disc := coalesce((v_item->>'regular_discount')::numeric,0) + coalesce((v_item->>'special_discount')::numeric,0)
      + coalesce((v_item->>'scheme_discount')::numeric,0) + coalesce((v_item->>'additional_discount')::numeric,0);
    v_net := v_gross - v_total_disc + coalesce((v_item->>'tax_amount')::numeric,0);
    v_received := coalesce((v_item->>'ordered_quantity')::numeric,0) + coalesce((v_item->>'free_units')::numeric,0);
    v_eff_cost := case when v_received > 0 then v_net / v_received else 0 end;

    insert into purchase_items (
      purchase_id, shop_id, product_id, product_name, unit,
      ordered_quantity, free_units, total_received_quantity,
      price_per_unit, gross_value,
      regular_discount, special_discount, scheme_discount, additional_discount, total_discount,
      tax_rate, tax_amount, net_amount,
      batch_number, manufacturing_date, expiry_date, serial_numbers,
      effective_cost_per_unit
    ) values (
      v_purchase_id, p_shop_id,
      nullif(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      coalesce(v_item->>'unit','piece'),
      (v_item->>'ordered_quantity')::numeric,
      coalesce((v_item->>'free_units')::numeric,0),
      v_received,
      (v_item->>'price_per_unit')::numeric,
      v_gross,
      coalesce((v_item->>'regular_discount')::numeric,0),
      coalesce((v_item->>'special_discount')::numeric,0),
      coalesce((v_item->>'scheme_discount')::numeric,0),
      coalesce((v_item->>'additional_discount')::numeric,0),
      v_total_disc,
      coalesce((v_item->>'tax_rate')::numeric,0),
      coalesce((v_item->>'tax_amount')::numeric,0),
      v_net,
      nullif(v_item->>'batch_number',''),
      nullif(v_item->>'manufacturing_date','')::date,
      nullif(v_item->>'expiry_date','')::date,
      nullif(v_item->>'serial_numbers',''),
      v_eff_cost
    );

    if (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then
      update products
         set stock = stock + v_received,
             purchase_price = (v_item->>'price_per_unit')::numeric,
             updated_at = now()
       where id = (v_item->>'product_id')::uuid
         and shop_id = p_shop_id;
    end if;
  end loop;

  if p_supplier_id is not null then
    select coalesce(sum(credit_amount - debit_amount), 0) into v_prev_balance
      from supplier_ledger
     where supplier_id = p_supplier_id and shop_id = p_shop_id;

    v_new_balance := v_prev_balance + v_grand - p_amount_paid;

    insert into supplier_ledger (
      shop_id, supplier_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      p_shop_id, p_supplier_id, p_purchase_date, 'CREDIT_PURCHASE',
      'purchase', v_purchase_id, v_number,
      'Purchase ' || v_number,
      0, v_grand - p_amount_paid, v_new_balance, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'purchase.create', 'purchase', v_purchase_id,
    jsonb_build_object('number', v_number, 'total', v_grand, 'paid', p_amount_paid));

  return v_purchase_id;
end;
$$;

-- ---------- pay_supplier() ----------
create or replace function pay_supplier(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text,
  p_user_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev numeric(14,2);
  v_new numeric(14,2);
  v_paynum text;
begin
  if not shop_owner(p_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  v_paynum := next_number(p_shop_id, 'SPAY');

  select coalesce(sum(credit_amount - debit_amount), 0) into v_prev
    from supplier_ledger
   where supplier_id = p_supplier_id and shop_id = p_shop_id;

  v_new := v_prev - p_amount;

  insert into supplier_ledger (
    shop_id, supplier_id, transaction_date, entry_type,
    reference_type, reference_number, description,
    debit_amount, credit_amount, running_balance, created_by
  ) values (
    p_shop_id, p_supplier_id, now(), 'SUPPLIER_PAYMENT',
    'payment', v_paynum,
    'Payment to supplier ' || v_paynum || coalesce(' ' || p_reference, ''),
    p_amount, 0, v_new, p_user_id
  );

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'supplier.payment', 'supplier', p_supplier_id,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', v_paynum));

  return v_new;
end;
$$;

-- ---------- record_sale_return() ----------
create or replace function record_sale_return(
  p_shop_id uuid,
  p_sale_id uuid,
  p_reason text,
  p_refund_amount numeric,
  p_restock boolean,
  p_items jsonb,
  p_notes text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_id uuid;
  v_number text;
  v_sale record;
  v_prev numeric(14,2);
  v_new numeric(14,2);
  v_item jsonb;
  v_items_arr jsonb[];
begin
  if not shop_owner(p_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  select * into v_sale from sales where id = p_sale_id and shop_id = p_shop_id;
  if not found then
    raise exception 'Sale not found';
  end if;

  v_number := next_number(p_shop_id, 'SRET');
  v_items_arr := ARRAY(SELECT jsonb_array_elements(p_items));

  insert into sale_returns (
    shop_id, return_number, sale_id, customer_id, customer_name,
    return_date, reason, refund_amount, restock_items, notes, created_by
  ) values (
    p_shop_id, v_number, p_sale_id, v_sale.customer_id, v_sale.customer_name,
    now(), p_reason, p_refund_amount, p_restock, p_notes, p_user_id
  ) returning id into v_return_id;

  foreach v_item in array v_items_arr loop
    insert into sale_return_items (
      sale_return_id, shop_id, product_id, product_name, quantity, price, line_total
    ) values (
      v_return_id, p_shop_id,
      nullif(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'price')::numeric
    );

    if p_restock and (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then
      update products
         set stock = stock + (v_item->>'quantity')::numeric,
             updated_at = now()
       where id = (v_item->>'product_id')::uuid
         and shop_id = p_shop_id;
    end if;
  end loop;

  if v_sale.customer_id is not null then
    select coalesce(sum(debit_amount - credit_amount), 0) into v_prev
      from customer_ledger
     where customer_id = v_sale.customer_id and shop_id = p_shop_id;

    v_new := v_prev - p_refund_amount;

    insert into customer_ledger (
      shop_id, customer_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      p_shop_id, v_sale.customer_id, now(), 'SALE_RETURN',
      'sale_return', v_return_id, v_number,
      'Sale return ' || v_number,
      0, p_refund_amount, v_new, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'sale_return.create', 'sale_return', v_return_id,
    jsonb_build_object('number', v_number, 'refund', p_refund_amount));

  return v_return_id;
end;
$$;

-- ---------- record_purchase_return() ----------
create or replace function record_purchase_return(
  p_shop_id uuid,
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_reason text,
  p_refund_amount numeric,
  p_items jsonb,
  p_notes text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_id uuid;
  v_number text;
  v_prev numeric(14,2);
  v_new numeric(14,2);
  v_item jsonb;
  v_items_arr jsonb[];
begin
  if not shop_owner(p_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  v_number := next_number(p_shop_id, 'PRET');
  v_items_arr := ARRAY(SELECT jsonb_array_elements(p_items));

  insert into purchase_returns (
    shop_id, return_number, purchase_id, supplier_id, supplier_name,
    return_date, reason, refund_amount, notes, created_by
  ) values (
    p_shop_id, v_number, p_purchase_id, p_supplier_id,
    (select supplier_name from suppliers where id = p_supplier_id),
    now(), p_reason, p_refund_amount, p_notes, p_user_id
  ) returning id into v_return_id;

  foreach v_item in array v_items_arr loop
    insert into purchase_return_items (
      purchase_return_id, shop_id, product_id, product_name, quantity, price, line_total
    ) values (
      v_return_id, p_shop_id,
      nullif(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'price')::numeric
    );

    if (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then
      update products
         set stock = stock - (v_item->>'quantity')::numeric,
             updated_at = now()
       where id = (v_item->>'product_id')::uuid
         and shop_id = p_shop_id;
    end if;
  end loop;

  if p_supplier_id is not null then
    select coalesce(sum(credit_amount - debit_amount), 0) into v_prev
      from supplier_ledger
     where supplier_id = p_supplier_id and shop_id = p_shop_id;

    v_new := v_prev - p_refund_amount;

    insert into supplier_ledger (
      shop_id, supplier_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      p_shop_id, p_supplier_id, now(), 'PURCHASE_RETURN',
      'purchase_return', v_return_id, v_number,
      'Purchase return ' || v_number,
      p_refund_amount, 0, v_new, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'purchase_return.create', 'purchase_return', v_return_id,
    jsonb_build_object('number', v_number, 'refund', p_refund_amount));

  return v_return_id;
end;
$$;
