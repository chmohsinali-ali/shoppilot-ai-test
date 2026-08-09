/*
# Cancel / Edit Sale & Purchase (reversal-based)

1. Purpose
Adds a safe, reversal-based cancel system for Sales and Purchases.
The original invoice is NEVER deleted and NEVER overwritten — it stays as
permanent history. Cancelling creates opposite ledger entries and reverses
stock, then marks the invoice as 'cancelled'.

2. New Columns
- sales.status              text not null default 'active'
- sales.cancelled_at        timestamptz nullable
- sales.cancelled_by        uuid nullable references auth.users(id)
- sales.cancellation_reason text nullable
- sales.superseded_by_sale_id uuid nullable references sales(id)
- purchases.status              text not null default 'active'
- purchases.cancelled_at        timestamptz nullable
- purchases.cancelled_by        uuid nullable references auth.users(id)
- purchases.cancellation_reason text nullable
- purchases.superseded_by_purchase_id uuid nullable references purchases(id)

3. New Functions
- cancel_sale(p_sale_id, p_reason, p_user_id) -> uuid
    Reverses customer ledger, restores stock, sets status='cancelled'.
- cancel_purchase(p_purchase_id, p_reason, p_user_id) -> uuid
    Reverses supplier ledger, decreases stock, sets status='cancelled'.

4. Safety
- cancel_sale raises an error if a sale_return exists for the sale.
- cancel_purchase raises an error if a purchase_return exists for the purchase.
- Both refuse to cancel an already-cancelled invoice.

5. Notes
- The original ledger row is never edited or deleted; a new reversal row is
  inserted so the running balance corrects itself going forward.
- Stock is only adjusted for line items that have a non-null product_id.
*/

-- ---------- sales: cancellation columns ----------
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='sales' and column_name='status') then
    alter table sales add column status text not null default 'active';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='sales' and column_name='cancelled_at') then
    alter table sales add column cancelled_at timestamptz;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='sales' and column_name='cancelled_by') then
    alter table sales add column cancelled_by uuid references auth.users(id) on delete set null;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='sales' and column_name='cancellation_reason') then
    alter table sales add column cancellation_reason text;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='sales' and column_name='superseded_by_sale_id') then
    alter table sales add column superseded_by_sale_id uuid references sales(id) on delete set null;
  end if;
end $$;

create index if not exists idx_sales_status on sales(shop_id, status);

-- ---------- purchases: cancellation columns ----------
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='purchases' and column_name='status') then
    alter table purchases add column status text not null default 'active';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='purchases' and column_name='cancelled_at') then
    alter table purchases add column cancelled_at timestamptz;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='purchases' and column_name='cancelled_by') then
    alter table purchases add column cancelled_by uuid references auth.users(id) on delete set null;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='purchases' and column_name='cancellation_reason') then
    alter table purchases add column cancellation_reason text;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_name='purchases' and column_name='superseded_by_purchase_id') then
    alter table purchases add column superseded_by_purchase_id uuid references purchases(id) on delete set null;
  end if;
end $$;

create index if not exists idx_purchases_status on purchases(shop_id, status);

-- ---------- cancel_sale() ----------
create or replace function cancel_sale(
  p_sale_id uuid,
  p_reason text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_item record;
  v_prev_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_reversal_amount numeric(14,2);
  v_has_return boolean;
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then
    raise exception 'Sale not found';
  end if;

  if not shop_owner(v_sale.shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'This sale is already cancelled';
  end if;

  -- Safety: block if a sale return exists
  select exists(select 1 from sale_returns where sale_id = p_sale_id) into v_has_return;
  if v_has_return then
    raise exception 'Cannot cancel — this invoice has a return recorded. Cancel the return first.';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A cancellation reason is required';
  end if;

  -- Mark the sale as cancelled (original row preserved)
  update sales
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = p_user_id,
         cancellation_reason = p_reason,
         updated_at = now()
   where id = p_sale_id;

  -- Restore stock for each line item
  for v_item in select * from sale_items where sale_id = p_sale_id loop
    if v_item.product_id is not null then
      update products
         set stock = stock + v_item.quantity,
             updated_at = now()
       where id = v_item.product_id
         and shop_id = v_sale.shop_id;
    end if;
  end loop;

  -- Reverse the customer ledger entry (opposite of original)
  if v_sale.customer_id is not null then
    v_reversal_amount := v_sale.grand_total - v_sale.amount_paid;

    select coalesce(sum(debit_amount - credit_amount), 0) into v_prev_balance
      from customer_ledger
     where customer_id = v_sale.customer_id and shop_id = v_sale.shop_id;

    v_new_balance := v_prev_balance - v_reversal_amount;

    insert into customer_ledger (
      shop_id, customer_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      v_sale.shop_id, v_sale.customer_id, now(), 'SALE_CANCEL',
      'sale', p_sale_id, v_sale.invoice_number,
      'Cancellation of sale ' || v_sale.invoice_number,
      0, v_reversal_amount, v_new_balance, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (v_sale.shop_id, p_user_id, 'sale.cancel', 'sale', p_sale_id,
    jsonb_build_object('invoice', v_sale.invoice_number, 'reason', p_reason, 'total', v_sale.grand_total));

  return p_sale_id;
end;
$$;

-- ---------- cancel_purchase() ----------
create or replace function cancel_purchase(
  p_purchase_id uuid,
  p_reason text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
  v_item record;
  v_prev_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_reversal_amount numeric(14,2);
  v_has_return boolean;
begin
  select * into v_purchase from purchases where id = p_purchase_id;
  if not found then
    raise exception 'Purchase not found';
  end if;

  if not shop_owner(v_purchase.shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  if v_purchase.status = 'cancelled' then
    raise exception 'This purchase is already cancelled';
  end if;

  -- Safety: block if a purchase return exists
  select exists(select 1 from purchase_returns where purchase_id = p_purchase_id) into v_has_return;
  if v_has_return then
    raise exception 'Cannot cancel — this invoice has a return recorded. Cancel the return first.';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A cancellation reason is required';
  end if;

  -- Mark the purchase as cancelled (original row preserved)
  update purchases
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = p_user_id,
         cancellation_reason = p_reason,
         updated_at = now()
   where id = p_purchase_id;

  -- Decrease stock back down for each line item
  for v_item in select * from purchase_items where purchase_id = p_purchase_id loop
    if v_item.product_id is not null then
      update products
         set stock = stock - v_item.total_received_quantity,
             updated_at = now()
       where id = v_item.product_id
         and shop_id = v_purchase.shop_id;
    end if;
  end loop;

  -- Reverse the supplier ledger entry (opposite of original)
  if v_purchase.supplier_id is not null then
    v_reversal_amount := v_purchase.grand_total - v_purchase.amount_paid;

    select coalesce(sum(credit_amount - debit_amount), 0) into v_prev_balance
      from supplier_ledger
     where supplier_id = v_purchase.supplier_id and shop_id = v_purchase.shop_id;

    v_new_balance := v_prev_balance - v_reversal_amount;

    insert into supplier_ledger (
      shop_id, supplier_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      v_purchase.shop_id, v_purchase.supplier_id, now(), 'PURCHASE_CANCEL',
      'purchase', p_purchase_id, v_purchase.purchase_number,
      'Cancellation of purchase ' || v_purchase.purchase_number,
      v_reversal_amount, 0, v_new_balance, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (v_purchase.shop_id, p_user_id, 'purchase.cancel', 'purchase', p_purchase_id,
    jsonb_build_object('number', v_purchase.purchase_number, 'reason', p_reason, 'total', v_purchase.grand_total));

  return p_purchase_id;
end;
$$;
