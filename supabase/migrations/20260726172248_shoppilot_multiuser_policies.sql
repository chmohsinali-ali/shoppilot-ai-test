/*
# ShopPilot AI — Multi-User RLS Policy Updates (Part 2)

1. Purpose
Updates ALL existing RLS policies on business tables to use the new
`can_access(shop_id, permission)` function instead of the old
`shop_owner(shop_id)` check. This means:
  - Shop owners keep full access (can_access returns true for owners on any
    permission because the owner role has all permissions).
  - Staff members get access based on their role's permissions.
  - Users not belonging to any shop get nothing.

2. Tables Updated
All business tables: shops, customers, products, sales, sale_items,
customer_ledger, expenses, audit_logs, number_sequences, suppliers,
supplier_ledger, purchases, purchase_items, sale_returns, sale_return_items,
purchase_returns, purchase_return_items, warranties, warranty_claims,
notifications, daily_closings.

3. Policy Pattern
Each table gets 4 policies (select/insert/update/delete) where each uses
can_access(shop_id, '<module>.<verb>') with the appropriate permission string.
Tables that previously had fewer policies keep the same set — only the
USING/WITH CHECK predicates change.
*/

-- ---------- shops ----------
drop policy if exists "owner_read_shops" on shops;
create policy "owner_read_shops" on shops for select to authenticated
  using (auth.uid() = owner_id or exists (select 1 from shop_users where shop_id = shops.id and user_id = auth.uid() and status = 'active'));
drop policy if exists "owner_insert_shops" on shops;
create policy "owner_insert_shops" on shops for insert to authenticated
  with check (auth.uid() = owner_id);
drop policy if exists "owner_update_shops" on shops;
create policy "owner_update_shops" on shops for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "owner_delete_shops" on shops;
create policy "owner_delete_shops" on shops for delete to authenticated
  using (auth.uid() = owner_id);

-- ---------- customers ----------
drop policy if exists "owner_select_customers" on customers;
create policy "owner_select_customers" on customers for select to authenticated
  using (can_access(shop_id, 'customers.view'));
drop policy if exists "owner_insert_customers" on customers;
create policy "owner_insert_customers" on customers for insert to authenticated
  with check (can_access(shop_id, 'customers.create'));
drop policy if exists "owner_update_customers" on customers;
create policy "owner_update_customers" on customers for update to authenticated
  using (can_access(shop_id, 'customers.update')) with check (can_access(shop_id, 'customers.update'));
drop policy if exists "owner_delete_customers" on customers;
create policy "owner_delete_customers" on customers for delete to authenticated
  using (can_access(shop_id, 'customers.deactivate'));

-- ---------- products ----------
drop policy if exists "owner_select_products" on products;
create policy "owner_select_products" on products for select to authenticated
  using (can_access(shop_id, 'products.view'));
drop policy if exists "owner_insert_products" on products;
create policy "owner_insert_products" on products for insert to authenticated
  with check (can_access(shop_id, 'products.create'));
drop policy if exists "owner_update_products" on products;
create policy "owner_update_products" on products for update to authenticated
  using (can_access(shop_id, 'products.update')) with check (can_access(shop_id, 'products.update'));
drop policy if exists "owner_delete_products" on products;
create policy "owner_delete_products" on products for delete to authenticated
  using (can_access(shop_id, 'products.deactivate'));

-- ---------- sales ----------
drop policy if exists "owner_select_sales" on sales;
create policy "owner_select_sales" on sales for select to authenticated
  using (can_access(shop_id, 'sales.view'));
drop policy if exists "owner_insert_sales" on sales;
create policy "owner_insert_sales" on sales for insert to authenticated
  with check (can_access(shop_id, 'sales.create_cash'));
drop policy if exists "owner_update_sales" on sales;
create policy "owner_update_sales" on sales for update to authenticated
  using (can_access(shop_id, 'sales.reverse')) with check (can_access(shop_id, 'sales.reverse'));
drop policy if exists "owner_delete_sales" on sales;
create policy "owner_delete_sales" on sales for delete to authenticated
  using (can_access(shop_id, 'sales.reverse'));

-- ---------- sale_items ----------
drop policy if exists "owner_select_sale_items" on sale_items;
create policy "owner_select_sale_items" on sale_items for select to authenticated
  using (can_access(shop_id, 'sales.view'));
drop policy if exists "owner_insert_sale_items" on sale_items;
create policy "owner_insert_sale_items" on sale_items for insert to authenticated
  with check (can_access(shop_id, 'sales.create_cash'));
drop policy if exists "owner_delete_sale_items" on sale_items;
create policy "owner_delete_sale_items" on sale_items for delete to authenticated
  using (can_access(shop_id, 'sales.reverse'));

-- ---------- customer_ledger ----------
drop policy if exists "owner_select_ledger" on customer_ledger;
create policy "owner_select_ledger" on customer_ledger for select to authenticated
  using (can_access(shop_id, 'customers.view'));
drop policy if exists "owner_insert_ledger" on customer_ledger;
create policy "owner_insert_ledger" on customer_ledger for insert to authenticated
  with check (can_access(shop_id, 'customers.receive_payment') or can_access(shop_id, 'sales.create_credit'));

-- ---------- expenses ----------
drop policy if exists "owner_select_expenses" on expenses;
create policy "owner_select_expenses" on expenses for select to authenticated
  using (can_access(shop_id, 'expenses.view'));
drop policy if exists "owner_insert_expenses" on expenses;
create policy "owner_insert_expenses" on expenses for insert to authenticated
  with check (can_access(shop_id, 'expenses.create'));
drop policy if exists "owner_update_expenses" on expenses;
create policy "owner_update_expenses" on expenses for update to authenticated
  using (can_access(shop_id, 'expenses.update')) with check (can_access(shop_id, 'expenses.update'));
drop policy if exists "owner_delete_expenses" on expenses;
create policy "owner_delete_expenses" on expenses for delete to authenticated
  using (can_access(shop_id, 'expenses.update'));

-- ---------- audit_logs ----------
drop policy if exists "owner_select_audit" on audit_logs;
create policy "owner_select_audit" on audit_logs for select to authenticated
  using (can_access(shop_id, 'audit.view'));
drop policy if exists "owner_insert_audit" on audit_logs;
create policy "owner_insert_audit" on audit_logs for insert to authenticated
  with check (can_access(shop_id, 'dashboard.view'));

-- ---------- number_sequences ----------
drop policy if exists "owner_select_seq" on number_sequences;
create policy "owner_select_seq" on number_sequences for select to authenticated
  using (can_access(shop_id, 'dashboard.view'));
drop policy if exists "owner_insert_seq" on number_sequences;
create policy "owner_insert_seq" on number_sequences for insert to authenticated
  with check (can_access(shop_id, 'dashboard.view'));
drop policy if exists "owner_update_seq" on number_sequences;
create policy "owner_update_seq" on number_sequences for update to authenticated
  using (can_access(shop_id, 'dashboard.view')) with check (can_access(shop_id, 'dashboard.view'));

-- ---------- suppliers ----------
drop policy if exists "owner_select_suppliers" on suppliers;
create policy "owner_select_suppliers" on suppliers for select to authenticated
  using (can_access(shop_id, 'suppliers.view'));
drop policy if exists "owner_insert_suppliers" on suppliers;
create policy "owner_insert_suppliers" on suppliers for insert to authenticated
  with check (can_access(shop_id, 'suppliers.create'));
drop policy if exists "owner_update_suppliers" on suppliers;
create policy "owner_update_suppliers" on suppliers for update to authenticated
  using (can_access(shop_id, 'suppliers.update')) with check (can_access(shop_id, 'suppliers.update'));
drop policy if exists "owner_delete_suppliers" on suppliers;
create policy "owner_delete_suppliers" on suppliers for delete to authenticated
  using (can_access(shop_id, 'suppliers.update'));

-- ---------- supplier_ledger ----------
drop policy if exists "owner_select_sledger" on supplier_ledger;
create policy "owner_select_sledger" on supplier_ledger for select to authenticated
  using (can_access(shop_id, 'suppliers.view'));
drop policy if exists "owner_insert_sledger" on supplier_ledger;
create policy "owner_insert_sledger" on supplier_ledger for insert to authenticated
  with check (can_access(shop_id, 'suppliers.make_payment') or can_access(shop_id, 'purchases.create_credit'));

-- ---------- purchases ----------
drop policy if exists "owner_select_purchases" on purchases;
create policy "owner_select_purchases" on purchases for select to authenticated
  using (can_access(shop_id, 'purchases.view'));
drop policy if exists "owner_insert_purchases" on purchases;
create policy "owner_insert_purchases" on purchases for insert to authenticated
  with check (can_access(shop_id, 'purchases.create_cash'));
drop policy if exists "owner_update_purchases" on purchases;
create policy "owner_update_purchases" on purchases for update to authenticated
  using (can_access(shop_id, 'purchases.return')) with check (can_access(shop_id, 'purchases.return'));
drop policy if exists "owner_delete_purchases" on purchases;
create policy "owner_delete_purchases" on purchases for delete to authenticated
  using (can_access(shop_id, 'purchases.return'));

-- ---------- purchase_items ----------
drop policy if exists "owner_select_pitems" on purchase_items;
create policy "owner_select_pitems" on purchase_items for select to authenticated
  using (can_access(shop_id, 'purchases.view'));
drop policy if exists "owner_insert_pitems" on purchase_items;
create policy "owner_insert_pitems" on purchase_items for insert to authenticated
  with check (can_access(shop_id, 'purchases.create_cash'));
drop policy if exists "owner_delete_pitems" on purchase_items;
create policy "owner_delete_pitems" on purchase_items for delete to authenticated
  using (can_access(shop_id, 'purchases.return'));

-- ---------- sale_returns ----------
drop policy if exists "owner_select_sreturns" on sale_returns;
create policy "owner_select_sreturns" on sale_returns for select to authenticated
  using (can_access(shop_id, 'sales.view'));
drop policy if exists "owner_insert_sreturns" on sale_returns;
create policy "owner_insert_sreturns" on sale_returns for insert to authenticated
  with check (can_access(shop_id, 'sales.return'));
drop policy if exists "owner_delete_sreturns" on sale_returns;
create policy "owner_delete_sreturns" on sale_returns for delete to authenticated
  using (can_access(shop_id, 'sales.reverse'));

-- ---------- sale_return_items ----------
drop policy if exists "owner_select_sritems" on sale_return_items;
create policy "owner_select_sritems" on sale_return_items for select to authenticated
  using (can_access(shop_id, 'sales.view'));
drop policy if exists "owner_insert_sritems" on sale_return_items;
create policy "owner_insert_sritems" on sale_return_items for insert to authenticated
  with check (can_access(shop_id, 'sales.return'));

-- ---------- purchase_returns ----------
drop policy if exists "owner_select_preturns" on purchase_returns;
create policy "owner_select_preturns" on purchase_returns for select to authenticated
  using (can_access(shop_id, 'purchases.view'));
drop policy if exists "owner_insert_preturns" on purchase_returns;
create policy "owner_insert_preturns" on purchase_returns for insert to authenticated
  with check (can_access(shop_id, 'purchases.return'));
drop policy if exists "owner_delete_preturns" on purchase_returns;
create policy "owner_delete_preturns" on purchase_returns for delete to authenticated
  using (can_access(shop_id, 'purchases.return'));

-- ---------- purchase_return_items ----------
drop policy if exists "owner_select_pritems" on purchase_return_items;
create policy "owner_select_pritems" on purchase_return_items for select to authenticated
  using (can_access(shop_id, 'purchases.view'));
drop policy if exists "owner_insert_pritems" on purchase_return_items;
create policy "owner_insert_pritems" on purchase_return_items for insert to authenticated
  with check (can_access(shop_id, 'purchases.return'));

-- ---------- warranties ----------
drop policy if exists "owner_select_warranties" on warranties;
create policy "owner_select_warranties" on warranties for select to authenticated
  using (can_access(shop_id, 'warranties.view'));
drop policy if exists "owner_insert_warranties" on warranties;
create policy "owner_insert_warranties" on warranties for insert to authenticated
  with check (can_access(shop_id, 'warranties.create'));
drop policy if exists "owner_update_warranties" on warranties;
create policy "owner_update_warranties" on warranties for update to authenticated
  using (can_access(shop_id, 'warranties.manage_claims')) with check (can_access(shop_id, 'warranties.manage_claims'));
drop policy if exists "owner_delete_warranties" on warranties;
create policy "owner_delete_warranties" on warranties for delete to authenticated
  using (can_access(shop_id, 'warranties.manage_claims'));

-- ---------- warranty_claims ----------
drop policy if exists "owner_select_wclaims" on warranty_claims;
create policy "owner_select_wclaims" on warranty_claims for select to authenticated
  using (can_access(shop_id, 'warranties.view'));
drop policy if exists "owner_insert_wclaims" on warranty_claims;
create policy "owner_insert_wclaims" on warranty_claims for insert to authenticated
  with check (can_access(shop_id, 'warranties.create'));
drop policy if exists "owner_update_wclaims" on warranty_claims;
create policy "owner_update_wclaims" on warranty_claims for update to authenticated
  using (can_access(shop_id, 'warranties.manage_claims')) with check (can_access(shop_id, 'warranties.manage_claims'));

-- ---------- notifications ----------
drop policy if exists "owner_select_notif" on notifications;
create policy "owner_select_notif" on notifications for select to authenticated
  using (can_access(shop_id, 'notifications.view'));
drop policy if exists "owner_insert_notif" on notifications;
create policy "owner_insert_notif" on notifications for insert to authenticated
  with check (can_access(shop_id, 'dashboard.view'));
drop policy if exists "owner_update_notif" on notifications;
create policy "owner_update_notif" on notifications for update to authenticated
  using (can_access(shop_id, 'notifications.view')) with check (can_access(shop_id, 'notifications.view'));
drop policy if exists "owner_delete_notif" on notifications;
create policy "owner_delete_notif" on notifications for delete to authenticated
  using (can_access(shop_id, 'notifications.view'));

-- ---------- daily_closings ----------
drop policy if exists "owner_select_closings" on daily_closings;
create policy "owner_select_closings" on daily_closings for select to authenticated
  using (can_access(shop_id, 'daily_closing.view'));
drop policy if exists "owner_insert_closings" on daily_closings;
create policy "owner_insert_closings" on daily_closings for insert to authenticated
  with check (can_access(shop_id, 'daily_closing.manage'));
drop policy if exists "owner_update_closings" on daily_closings;
create policy "owner_update_closings" on daily_closings for update to authenticated
  using (can_access(shop_id, 'daily_closing.manage')) with check (can_access(shop_id, 'daily_closing.manage'));
