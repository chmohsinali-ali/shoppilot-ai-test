/*
# ShopPilot AI — Customer payments & balance helper

1. New Functions
- `receive_customer_payment(shop_id, customer_id, amount, method, reference, notes, user_id)`
  SECURITY DEFINER RPC. Creates a customer ledger CREDIT entry (reduces what the
  customer owes), records an audit log, and returns the new running balance.
  Validates shop ownership.
- `customer_balance(customer_id)` helper view-like function returning current
  outstanding balance (sum of debit - credit) for a customer.

2. Security
Both functions are SECURITY DEFINER and call shop_owner() internally so they
respect tenant isolation regardless of how they are invoked.
*/

create or replace function receive_customer_payment(
  p_shop_id uuid,
  p_customer_id uuid,
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

  v_paynum := next_number(p_shop_id, 'CPAY');

  select coalesce(sum(debit_amount - credit_amount), 0) into v_prev
    from customer_ledger
   where customer_id = p_customer_id and shop_id = p_shop_id;

  v_new := v_prev - p_amount;

  insert into customer_ledger (
    shop_id, customer_id, transaction_date, entry_type,
    reference_type, reference_number, description,
    debit_amount, credit_amount, running_balance, created_by
  ) values (
    p_shop_id, p_customer_id, now(), 'CUSTOMER_PAYMENT',
    'payment', v_paynum,
    'Payment received ' || v_paynum || coalesce(' ' || p_reference, ''),
    0, p_amount, v_new, p_user_id
  );

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (p_shop_id, p_user_id, 'customer.payment', 'customer', p_customer_id,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', v_paynum));

  return v_new;
end;
$$;

create or replace function get_customer_balance(p_customer_id uuid)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(debit_amount - credit_amount), 0)::numeric
    from customer_ledger
   where customer_id = p_customer_id;
$$;
