/*
# Fix cancel_sale: remove updated_at reference

The sales table has no updated_at column. The cancel_sale RPC references
updated_at which would cause a runtime error. This migration recreates
the function without that reference.
*/

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
         cancellation_reason = p_reason
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
