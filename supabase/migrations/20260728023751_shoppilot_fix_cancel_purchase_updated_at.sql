/*
# Fix cancel_purchase: remove updated_at reference

The purchases table has no updated_at column. The cancel_purchase RPC
references updated_at which would cause a runtime error. This migration
recreates the function without that reference.
*/

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
         cancellation_reason = p_reason
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
