/*
# ShopPilot AI — Store the Urdu product name on invoice line items

1. Purpose
`sale_items.product_name_ur` / `purchase_items.product_name_ur` were added
as plain columns in the previous migration, but `create_sale()` and
`create_purchase()` did not yet read `product_name_ur` out of the items
jsonb payload, so it was never actually populated. This updates both RPCs
(same signatures, no breaking change for existing callers) to snapshot
the Urdu name onto the line item exactly like `product_name` (English)
already is — so a historical invoice keeps its Urdu label even if the
product's name is edited later.

2. Security
No signature or policy changes — same SECURITY DEFINER functions, same
shop_owner() check, unchanged.
*/

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
      sale_id, shop_id, product_id, product_name, product_name_ur, unit, quantity, price,
      discount, tax_rate, line_total
    ) values (
      v_sale_id, p_shop_id,
      nullif(v_pid, '')::uuid,
      v_item->>'product_name',
      nullif(v_item->>'product_name_ur', ''),
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
      purchase_id, shop_id, product_id, product_name, product_name_ur, unit,
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
      nullif(v_item->>'product_name_ur', ''),
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
