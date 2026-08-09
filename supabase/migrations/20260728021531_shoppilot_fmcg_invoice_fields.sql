/*
# ShopPilot AI — Real FMCG Invoice Fields on purchase_items and purchases

1. Purpose
Adds the missing columns that appear on real Pakistani FMCG distributor invoices,
as seen in the provided invoice photos. All additions are purely additive — no
existing columns are removed or altered.

2. New columns on `purchase_items`
Based on the actual invoice column headers in the photos:

| Column               | Type           | From invoice                          |
|----------------------|----------------|---------------------------------------|
| hs_code              | text           | "HS Code" column                      |
| supplier_product_code| text           | "Product Code / Description"          |
| ctn_size             | text           | "CTN Size" (e.g. "432", "CTN 12P")   |
| retail_price         | numeric(14,2)  | "Retail Price" / "MRP"                |
| trade_offer_free_qty | numeric(14,3)  | "Trade Offer Free Qty" (alias of free_units concept but invoice-level label kept) |
| trade_offer_amount   | numeric(14,2)  | "Trade Offer Amount" (promo deduction, separate from regular/special discount) |
| trade_activity       | text           | "Trade Activity" code                 |
| sales_tax_rate       | numeric(5,2)   | "Tax Applicable 18%" / "S.Tax MRP 4%" (MRP-based sales tax %) |
| further_tax          | numeric(14,2)  | "Further Tax" (FBR)                   |
| advance_tax          | numeric(14,2)  | "Advance Tax" (FBR)                   |
| tax_type             | text           | "Tax Type" column                     |

Net amount formula with new fields:
  gross_value = ordered_quantity × price_per_unit
  total_discount = regular_discount + special_discount + scheme_discount + additional_discount
  net_before_tax = gross_value - total_discount - trade_offer_amount
  net_amount = net_before_tax + tax_amount + further_tax + advance_tax

3. New columns on `purchases` (header level)
| Column                    | Type | From invoice                          |
|---------------------------|------|---------------------------------------|
| supplier_invoice_status   | text | "Invoice Status: Open"                |
| shop_customer_number      | text | "Customer No: 03000068302" (shop's account number with THIS specific supplier, per invoice — supplements the supplier-level field) |

4. Security
No new tables — no new RLS policies needed. The existing `purchase_items` and
`purchases` policies (via `can_access()`) cover all new columns automatically.

5. Updated RPC: create_purchase
The `create_purchase` function is updated to:
  - Accept new item fields (hs_code, supplier_product_code, ctn_size,
    retail_price, trade_offer_amount, trade_activity, sales_tax_rate,
    further_tax, advance_tax, tax_type)
  - Recalculate net_amount = gross - total_discount - trade_offer_amount
    + tax_amount + further_tax + advance_tax
  - Accept new header fields (supplier_invoice_status, shop_customer_number)
  - Store all fields correctly in the inserted rows
*/

-- ---------- purchase_items: new columns ----------
alter table purchase_items
  add column if not exists hs_code             text,
  add column if not exists supplier_product_code text,
  add column if not exists ctn_size            text,
  add column if not exists retail_price        numeric(14,2) not null default 0,
  add column if not exists trade_offer_amount  numeric(14,2) not null default 0,
  add column if not exists trade_activity      text,
  add column if not exists sales_tax_rate      numeric(5,2) not null default 0,
  add column if not exists further_tax         numeric(14,2) not null default 0,
  add column if not exists advance_tax         numeric(14,2) not null default 0,
  add column if not exists tax_type            text;

-- ---------- purchases: new columns ----------
alter table purchases
  add column if not exists supplier_invoice_status text not null default 'open',
  add column if not exists shop_customer_number    text;

-- ---------- Updated create_purchase() ----------
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
  p_user_id uuid,
  p_supplier_invoice_status text default 'open',
  p_shop_customer_number text default null
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
  v_trade_offer numeric(14,2);
  v_net numeric(14,2);
  v_further_tax numeric(14,2);
  v_advance_tax numeric(14,2);
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

  -- First pass: compute subtotal from gross values
  foreach v_item in array v_items_arr loop
    v_gross := ((v_item->>'ordered_quantity')::numeric) * ((v_item->>'price_per_unit')::numeric);
    v_subtotal := v_subtotal + v_gross;
  end loop;

  v_grand := v_subtotal
    - p_discount_total
    + p_tax_total
    + p_delivery_charges
    + p_freight
    + p_other_charges;

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
    amount_paid, balance, payment_status, payment_method, notes, created_by,
    supplier_invoice_status, shop_customer_number
  ) values (
    p_shop_id, v_number, p_supplier_invoice_number, p_supplier_id, p_supplier_name,
    p_purchase_date, v_subtotal, p_discount_total, p_tax_total,
    p_delivery_charges, p_freight, p_other_charges, v_grand,
    p_amount_paid, v_balance, v_payment_status, p_payment_method, p_notes, p_user_id,
    coalesce(p_supplier_invoice_status, 'open'), p_shop_customer_number
  ) returning id into v_purchase_id;

  -- Second pass: insert items with all new fields
  foreach v_item in array v_items_arr loop
    v_gross       := ((v_item->>'ordered_quantity')::numeric) * ((v_item->>'price_per_unit')::numeric);
    v_total_disc  := coalesce((v_item->>'regular_discount')::numeric,0)
                   + coalesce((v_item->>'special_discount')::numeric,0)
                   + coalesce((v_item->>'scheme_discount')::numeric,0)
                   + coalesce((v_item->>'additional_discount')::numeric,0);
    v_trade_offer := coalesce((v_item->>'trade_offer_amount')::numeric,0);
    v_further_tax := coalesce((v_item->>'further_tax')::numeric,0);
    v_advance_tax := coalesce((v_item->>'advance_tax')::numeric,0);

    -- net = gross - discounts - trade offer + sales_tax + further_tax + advance_tax
    v_net := v_gross
           - v_total_disc
           - v_trade_offer
           + coalesce((v_item->>'tax_amount')::numeric,0)
           + v_further_tax
           + v_advance_tax;

    v_received := coalesce((v_item->>'ordered_quantity')::numeric,0)
                + coalesce((v_item->>'free_units')::numeric,0);
    v_eff_cost := case when v_received > 0 then v_net / v_received else 0 end;

    insert into purchase_items (
      purchase_id, shop_id, product_id, product_name, unit,
      ordered_quantity, free_units, total_received_quantity,
      price_per_unit, gross_value,
      regular_discount, special_discount, scheme_discount, additional_discount, total_discount,
      trade_offer_amount,
      tax_rate, tax_amount, net_amount,
      batch_number, manufacturing_date, expiry_date, serial_numbers,
      effective_cost_per_unit,
      hs_code, supplier_product_code, ctn_size, retail_price,
      trade_activity, sales_tax_rate, further_tax, advance_tax, tax_type
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
      v_trade_offer,
      coalesce((v_item->>'tax_rate')::numeric,0),
      coalesce((v_item->>'tax_amount')::numeric,0),
      v_net,
      nullif(v_item->>'batch_number',''),
      nullif(v_item->>'manufacturing_date','')::date,
      nullif(v_item->>'expiry_date','')::date,
      nullif(v_item->>'serial_numbers',''),
      v_eff_cost,
      nullif(v_item->>'hs_code',''),
      nullif(v_item->>'supplier_product_code',''),
      nullif(v_item->>'ctn_size',''),
      coalesce((v_item->>'retail_price')::numeric,0),
      nullif(v_item->>'trade_activity',''),
      coalesce((v_item->>'sales_tax_rate')::numeric,0),
      v_further_tax,
      v_advance_tax,
      nullif(v_item->>'tax_type','')
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
