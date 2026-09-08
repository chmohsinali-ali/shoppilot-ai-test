/*
# ShopPilot AI — Customer payment reversal (auditable, not a delete)

1. Purpose
The redesigned Customer Ledger History needs a "Reverse Payment"
action: a payment was recorded in error and must be undone without
ever deleting the original financial record (same principle already
used for cancel_sale — the original row is preserved, a reversing
entry is added, and the balance is corrected going forward).

2. Design
- `customer_ledger.reversed_at` / `reversed_by` mark the ORIGINAL
  CUSTOMER_PAYMENT row so the UI can show it as "Reversed" without
  losing it — these columns are only ever set once (the function
  blocks a second reversal of the same entry).
- `reverse_customer_payment()` follows the exact same pattern as the
  existing `cancel_sale()`: it does not rewrite any historical
  running_balance, it adds a new CUSTOMER_PAYMENT_REVERSAL entry
  dated now() whose running_balance reflects the CURRENT total
  balance plus the reversed amount — consistent with how every other
  reversal/cancellation already works in this schema.

3. Security
New SECURITY DEFINER function, same shop_owner() authorization check
used by every other financial RPC. No RLS policy changes — the
function runs with elevated privileges like its siblings; there is
still no client-side UPDATE policy on customer_ledger, so only this
function (or another SECURITY DEFINER RPC) can ever set reversed_at.
*/

alter table customer_ledger add column if not exists reversed_at timestamptz;
alter table customer_ledger add column if not exists reversed_by uuid references auth.users(id) on delete set null;

create or replace function reverse_customer_payment(
  p_ledger_entry_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_prev_balance numeric(14,2);
  v_new_balance numeric(14,2);
begin
  select * into v_entry from customer_ledger where id = p_ledger_entry_id;
  if not found then
    raise exception 'Ledger entry not found';
  end if;

  if not shop_owner(v_entry.shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  if v_entry.entry_type <> 'CUSTOMER_PAYMENT' then
    raise exception 'Only a payment entry can be reversed';
  end if;

  if v_entry.reversed_at is not null then
    raise exception 'This payment has already been reversed';
  end if;

  update customer_ledger
     set reversed_at = now(),
         reversed_by = p_user_id
   where id = p_ledger_entry_id;

  select coalesce(sum(debit_amount - credit_amount), 0) into v_prev_balance
    from customer_ledger
   where customer_id = v_entry.customer_id and shop_id = v_entry.shop_id;

  v_new_balance := v_prev_balance + v_entry.credit_amount;

  insert into customer_ledger (
    shop_id, customer_id, transaction_date, entry_type,
    reference_type, reference_id, reference_number, description,
    debit_amount, credit_amount, running_balance, created_by
  ) values (
    v_entry.shop_id, v_entry.customer_id, now(), 'CUSTOMER_PAYMENT_REVERSAL',
    'payment_reversal', p_ledger_entry_id, v_entry.reference_number,
    'Reversal of payment' || coalesce(' ' || v_entry.reference_number, '') || coalesce(' — ' || nullif(trim(p_reason), ''), ''),
    v_entry.credit_amount, 0, v_new_balance, p_user_id
  );

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (v_entry.shop_id, p_user_id, 'customer_payment.reverse', 'customer_ledger', p_ledger_entry_id,
    jsonb_build_object('amount', v_entry.credit_amount, 'reason', p_reason));

  return v_new_balance;
end;
$$;
