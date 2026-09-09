/*
# ShopPilot AI — Restore and permanently delete a cancelled Sale

1. Purpose
The Sale detail page can now offer Edit / Restore / Delete on a
genuinely-cancelled sale (not one that was only superseded by an
edit — that case already has its own "View corrected invoice" flow
and is not touched here). This adds the two RPCs that were missing:
- `restore_sale`: undoes a cancellation a shopkeeper made by mistake
  — re-deducts stock and re-applies the customer ledger debit, using
  the exact same "current balance + delta" pattern already used by
  cancel_sale/reverse_customer_payment, so it stays consistent with
  every other reversal in this schema.
- `permanently_delete_sale`: a genuine hard delete, following the
  same shape as the existing permanently_delete_customer/supplier —
  only ever allowed on an already-cancelled sale (deleting an active
  sale without reversing it first would corrupt stock/ledger, so this
  is refused rather than silently doing the reversal itself).

2. Security
Both are SECURITY DEFINER with the same shop_owner() check used by
every other financial RPC here. No RLS/policy changes.
*/

create or replace function restore_sale(
  p_sale_id uuid,
  p_user_id uuid
)
returns void
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
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then
    raise exception 'Sale not found';
  end if;

  if not shop_owner(v_sale.shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  if v_sale.status <> 'cancelled' then
    raise exception 'This sale is not cancelled';
  end if;

  if v_sale.superseded_by_sale_id is not null then
    raise exception 'This sale was replaced by a corrected invoice — edit or restore the corrected invoice instead';
  end if;

  -- Re-deduct stock (cancel_sale added it back; restore takes it out again).
  for v_item in select * from sale_items where sale_id = p_sale_id loop
    if v_item.product_id is not null then
      update products
         set stock = stock - v_item.quantity,
             updated_at = now()
       where id = v_item.product_id
         and shop_id = v_sale.shop_id;
    end if;
  end loop;

  update sales
     set status = 'active',
         cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null
   where id = p_sale_id;

  if v_sale.customer_id is not null then
    v_reversal_amount := v_sale.grand_total - v_sale.amount_paid;

    select coalesce(sum(debit_amount - credit_amount), 0) into v_prev_balance
      from customer_ledger
     where customer_id = v_sale.customer_id and shop_id = v_sale.shop_id;

    v_new_balance := v_prev_balance + v_reversal_amount;

    insert into customer_ledger (
      shop_id, customer_id, transaction_date, entry_type,
      reference_type, reference_id, reference_number, description,
      debit_amount, credit_amount, running_balance, created_by
    ) values (
      v_sale.shop_id, v_sale.customer_id, now(), 'CREDIT_SALE',
      'sale', p_sale_id, v_sale.invoice_number,
      'Restoration of sale ' || v_sale.invoice_number,
      v_reversal_amount, 0, v_new_balance, p_user_id
    );
  end if;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (v_sale.shop_id, p_user_id, 'sale.restore', 'sale', p_sale_id,
    jsonb_build_object('invoice', v_sale.invoice_number));
end;
$$;

create or replace function public.permanently_delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_shop_id uuid;
  v_invoice text;
  v_status text;
begin
  select shop_id, invoice_number, status into v_shop_id, v_invoice, v_status
    from sales where id = p_sale_id;

  if v_shop_id is null then
    raise exception 'Sale not found';
  end if;
  if not shop_owner(v_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;
  if v_status <> 'cancelled' then
    raise exception 'Only a cancelled sale can be permanently deleted — cancel it first';
  end if;

  update sales set superseded_by_sale_id = null where superseded_by_sale_id = p_sale_id;

  delete from sale_items where sale_id = p_sale_id;
  delete from customer_ledger where reference_id = p_sale_id and reference_type in ('sale', 'sale_cancel');

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (v_shop_id, auth.uid(), 'sale.permanent_delete', 'sale', p_sale_id, jsonb_build_object('invoice', v_invoice));

  delete from sales where id = p_sale_id;
end;
$function$;
