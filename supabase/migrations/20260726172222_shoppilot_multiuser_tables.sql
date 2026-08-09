/*
# ShopPilot AI — Multi-User Tables & Functions (Part 1)

1. Purpose
Creates the shop_users table, role_permissions table, and all the helper
functions needed for multi-user RBAC. The RLS policy updates that use
can_access() are in a follow-up migration (Part 2) because policies reference
the function and it must exist first.

2. New Tables
- `role_permissions` — canonical role-to-permission mapping.
- `shop_users` — maps users to shops with role + status.

3. New Functions
- `can_access(shop_id, permission)` — owner or active member with permission.
- `get_my_shop_id()` — returns the shop the current user belongs to.
- `get_my_role(shop_id)` — returns the user's role in a shop.
- `get_my_permissions(shop_id)` — returns the user's permission list.
- `invite_shop_user(shop_id, email, role)` — owner invites by email.
- `activate_invited_user(user_id, email)` — attaches invited user on signup.
- `update_shop_user_role(shop_user_id, role)` — owner changes role.
- `deactivate_shop_user(shop_user_id)` — owner disables user.

4. Trigger
- `on_auth_user_created` — after insert on auth.users, auto-activates pending
  invitations matching the new user's email.

5. Data Migration
- Seeds all 5 default roles with their permission lists.
- Inserts an 'owner' shop_users row for every existing shop owner.
*/

-- ---------- role_permissions ----------
create table if not exists role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role        text not null unique,
  permissions text[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table role_permissions enable row level security;
drop policy if exists "anyone_read_role_perms" on role_permissions;
create policy "anyone_read_role_perms" on role_permissions for select to authenticated using (true);

-- Seed default role permissions
insert into role_permissions (role, permissions) values
('owner', array[
  'dashboard.view','customers.view','customers.create','customers.update','customers.deactivate','customers.receive_payment',
  'suppliers.view','suppliers.create','suppliers.update','suppliers.make_payment',
  'products.view','products.create','products.update','products.deactivate',
  'inventory.view','inventory.adjust','inventory.mark_damaged','inventory.mark_expired',
  'sales.view','sales.create_cash','sales.create_credit','sales.create_partial','sales.create_discount','sales.reverse','sales.return',
  'purchases.view','purchases.create_cash','purchases.create_credit','purchases.create_partial','purchases.return',
  'expenses.view','expenses.create','expenses.update',
  'warranties.view','warranties.create','warranties.manage_claims',
  'reports.view','reports.export',
  'users.manage','roles.manage','settings.manage','audit.view',
  'ai.approve_transactions','notifications.view','daily_closing.view','daily_closing.manage'
]) on conflict (role) do nothing;

insert into role_permissions (role, permissions) values
('manager', array[
  'dashboard.view','customers.view','customers.create','customers.update','customers.receive_payment',
  'suppliers.view','suppliers.create','suppliers.update','suppliers.make_payment',
  'products.view','products.create','products.update',
  'inventory.view','inventory.adjust',
  'sales.view','sales.create_cash','sales.create_credit','sales.create_partial','sales.return',
  'purchases.view','purchases.create_cash','purchases.create_credit','purchases.return',
  'expenses.view','expenses.create',
  'warranties.view','warranties.create','warranties.manage_claims',
  'reports.view','reports.export','ai.approve_transactions','notifications.view'
]) on conflict (role) do nothing;

insert into role_permissions (role, permissions) values
('accountant', array[
  'dashboard.view','customers.view','customers.receive_payment',
  'suppliers.view','suppliers.make_payment',
  'sales.view','purchases.view',
  'expenses.view','expenses.create','expenses.update',
  'reports.view','reports.export','audit.view','notifications.view'
]) on conflict (role) do nothing;

insert into role_permissions (role, permissions) values
('cashier', array[
  'dashboard.view','customers.view','customers.create',
  'products.view','sales.view','sales.create_cash','sales.create_partial',
  'customers.receive_payment',
  'warranties.view','warranties.create','notifications.view'
]) on conflict (role) do nothing;

insert into role_permissions (role, permissions) values
('staff', array[
  'dashboard.view','customers.view','products.view','sales.view','inventory.view','notifications.view'
]) on conflict (role) do nothing;

-- ---------- shop_users (must exist before can_access) ----------
create table if not exists shop_users (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  role          text not null default 'staff',
  status        text not null default 'invited',
  invited_email text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table shop_users enable row level security;

create index if not exists idx_shop_users_shop on shop_users(shop_id);
create index if not exists idx_shop_users_user on shop_users(user_id);
create index if not exists idx_shop_users_email on shop_users(invited_email);

-- ---------- can_access() ----------
create or replace function can_access(p_shop_id uuid, p_permission text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from shops where id = p_shop_id and owner_id = auth.uid()
  )
  or exists (
    select 1 from shop_users su
    join role_permissions rp on rp.role = su.role
    where su.shop_id = p_shop_id
      and su.user_id = auth.uid()
      and su.status = 'active'
      and rp.permissions @> array[p_permission]::text[]
  );
$$;

-- Now create shop_users policies (function exists)
drop policy if exists "owner_select_shop_users" on shop_users;
create policy "owner_select_shop_users" on shop_users for select to authenticated
  using (can_access(shop_id, 'users.manage') or can_access(shop_id, 'dashboard.view'));
drop policy if exists "owner_insert_shop_users" on shop_users;
create policy "owner_insert_shop_users" on shop_users for insert to authenticated
  with check (can_access(shop_id, 'users.manage'));
drop policy if exists "owner_update_shop_users" on shop_users;
create policy "owner_update_shop_users" on shop_users for update to authenticated
  using (can_access(shop_id, 'users.manage')) with check (can_access(shop_id, 'users.manage'));
drop policy if exists "owner_delete_shop_users" on shop_users;
create policy "owner_delete_shop_users" on shop_users for delete to authenticated
  using (can_access(shop_id, 'users.manage'));

-- ---------- get_my_shop_id() ----------
create or replace function get_my_shop_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from shops where owner_id = auth.uid()
  union all
  select shop_id from shop_users where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

-- ---------- get_my_role() ----------
create or replace function get_my_role(p_shop_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from shops where id = p_shop_id and owner_id = auth.uid())
      then 'owner'
    else (select role from shop_users where shop_id = p_shop_id and user_id = auth.uid() and status = 'active')
  end;
$$;

-- ---------- get_my_permissions() ----------
create or replace function get_my_permissions(p_shop_id uuid)
returns text[]
language sql
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from shops where id = p_shop_id and owner_id = auth.uid())
      then (select permissions from role_permissions where role = 'owner')
    else (select rp.permissions from shop_users su join role_permissions rp on rp.role = su.role
          where su.shop_id = p_shop_id and su.user_id = auth.uid() and su.status = 'active')
  end;
$$;

-- ---------- invite_shop_user() ----------
create or replace function invite_shop_user(p_shop_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (exists (select 1 from shops where id = p_shop_id and owner_id = auth.uid())) then
    raise exception 'Only the shop owner can invite users';
  end if;
  if p_role not in ('manager','accountant','cashier','staff') then
    raise exception 'Invalid role';
  end if;
  insert into shop_users (shop_id, role, status, invited_email)
  values (p_shop_id, p_role, 'invited', lower(trim(p_email)))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- activate_invited_user() ----------
create or replace function activate_invited_user(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id from shop_users
   where invited_email = lower(trim(p_email)) and status = 'invited'
   order by created_at desc limit 1;
  if v_shop_id is not null then
    update shop_users
       set user_id = p_user_id, status = 'active', updated_at = now()
     where invited_email = lower(trim(p_email)) and status = 'invited';
    return v_shop_id;
  end if;
  return null;
end;
$$;

-- ---------- update_shop_user_role() ----------
create or replace function update_shop_user_role(p_shop_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id from shop_users where id = p_shop_user_id;
  if v_shop_id is null then raise exception 'Shop user not found'; end if;
  if not (exists (select 1 from shops where id = v_shop_id and owner_id = auth.uid())) then
    raise exception 'Only the shop owner can change roles';
  end if;
  if p_role not in ('manager','accountant','cashier','staff') then
    raise exception 'Invalid role';
  end if;
  update shop_users set role = p_role, updated_at = now() where id = p_shop_user_id;
end;
$$;

-- ---------- deactivate_shop_user() ----------
create or replace function deactivate_shop_user(p_shop_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id from shop_users where id = p_shop_user_id;
  if v_shop_id is null then raise exception 'Shop user not found'; end if;
  if not (exists (select 1 from shops where id = v_shop_id and owner_id = auth.uid())) then
    raise exception 'Only the shop owner can deactivate users';
  end if;
  update shop_users set status = 'disabled', updated_at = now() where id = p_shop_user_id;
end;
$$;

-- ---------- Migrate existing owners into shop_users ----------
insert into shop_users (shop_id, user_id, role, status, invited_email)
select s.id, s.owner_id, 'owner', 'active', u.email
from shops s
join auth.users u on u.id = s.owner_id
where not exists (
  select 1 from shop_users su where su.shop_id = s.id and su.user_id = s.owner_id
)
on conflict do nothing;

-- ---------- Trigger: auto-activate invited users on signup ----------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform activate_invited_user(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
