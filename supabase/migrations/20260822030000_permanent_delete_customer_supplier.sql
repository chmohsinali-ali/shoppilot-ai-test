/*
# ShopPilot AI — Permanent (hard) delete for customers and suppliers

1. Problem
"Deactivate" (see DeactivateCustomerModal / DeactivateSupplierModal) is a
soft delete: it sets `deleted_at` + `status = 'inactive'` but keeps the
row, and 20260822020000 already made sure a soft-deleted party never
resurfaces in the AI's customer_directory/supplier_directory lookups.
That's the right default, but the shopkeeper also wants a genuine,
irreversible delete for a specific party — one that removes the party
and every trace of their sales/purchases/ledger history for good, so a
name can never be confused with old data again even by direct ID.

2. What this adds
Two SECURITY DEFINER RPC functions, `permanently_delete_customer` and
`permanently_delete_supplier`, following the same auth pattern as
create_sale/create_purchase (shop_owner(shop_id) check derived from the
row itself, so the caller only needs to pass the party id). Each walks
the FK graph in dependency order (children before parents, self-ref
"superseded_by_*" columns nulled first) and deletes everything, then
logs a summary (not the live record) to audit_logs for support/dispute
traceability. This is intentionally irreversible — no soft-delete flag,
no recovery path.
*/

create or replace function public.permanently_delete_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_shop_id uuid;
  v_name text;
  v_phone text;
  v_sale_count int;
begin
  select shop_id, full_name, primary_phone into v_shop_id, v_name, v_phone
    from customers where id = p_customer_id;

  if v_shop_id is null then
    raise exception 'Customer not found';
  end if;
  if not shop_owner(v_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  select count(*) into v_sale_count from sales where customer_id = p_customer_id;

  delete from warranty_claims where customer_id = p_customer_id;
  delete from warranties where customer_id = p_customer_id;

  delete from sale_return_items
   where sale_return_id in (select id from sale_returns where customer_id = p_customer_id);
  delete from sale_returns where customer_id = p_customer_id;

  delete from sale_items
   where sale_id in (select id from sales where customer_id = p_customer_id);

  -- Break any self-reference (a correction/return sale superseding an
  -- older one) before the referenced rows are removed, regardless of
  -- which sale/customer owns the pointer.
  update sales set superseded_by_sale_id = null
   where superseded_by_sale_id in (select id from sales where customer_id = p_customer_id);
  delete from sales where customer_id = p_customer_id;

  delete from customer_ledger where customer_id = p_customer_id;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_shop_id, auth.uid(), 'customer.permanent_delete', 'customer', p_customer_id,
    jsonb_build_object('name', v_name, 'phone', v_phone, 'sales_deleted', v_sale_count)
  );

  delete from customers where id = p_customer_id;
end;
$function$;

create or replace function public.permanently_delete_supplier(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_shop_id uuid;
  v_name text;
  v_phone text;
  v_purchase_count int;
begin
  select shop_id, supplier_name, primary_phone into v_shop_id, v_name, v_phone
    from suppliers where id = p_supplier_id;

  if v_shop_id is null then
    raise exception 'Supplier not found';
  end if;
  if not shop_owner(v_shop_id) then
    raise exception 'Not authorized for this shop';
  end if;

  select count(*) into v_purchase_count from purchases where supplier_id = p_supplier_id;

  delete from purchase_return_items
   where purchase_return_id in (select id from purchase_returns where supplier_id = p_supplier_id);
  delete from purchase_returns where supplier_id = p_supplier_id;

  delete from purchase_items
   where purchase_id in (select id from purchases where supplier_id = p_supplier_id);

  update purchases set superseded_by_purchase_id = null
   where superseded_by_purchase_id in (select id from purchases where supplier_id = p_supplier_id);
  delete from purchases where supplier_id = p_supplier_id;

  delete from supplier_ledger where supplier_id = p_supplier_id;

  insert into audit_logs (shop_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_shop_id, auth.uid(), 'supplier.permanent_delete', 'supplier', p_supplier_id,
    jsonb_build_object('name', v_name, 'phone', v_phone, 'purchases_deleted', v_purchase_count)
  );

  delete from suppliers where id = p_supplier_id;
end;
$function$;
