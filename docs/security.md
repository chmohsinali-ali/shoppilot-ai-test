# Security — ShopPilot AI

## Authentication

ShopPilot AI uses Supabase Auth with email/password authentication. No magic links, social providers, or custom auth tables are used.

- **Password hashing**: Handled by Supabase Auth (bcrypt-based)
- **Session management**: JWT access tokens with automatic refresh
- **Email confirmation**: Disabled (users can sign up and immediately access the app)

### Session Flow

1. User signs in via `supabase.auth.signInWithPassword()`
2. Supabase returns a session (access token + refresh token)
3. The session is persisted in the browser and auto-refreshed
4. `AuthProvider` listens to `onAuthStateChange` and updates the React context
5. On sign out, the session is cleared from the browser

## Multi-Tenancy & Row-Level Security

Every business record has a `shop_id` column. Row-Level Security (RLS) is enabled on every table. This means even if a user somehow constructs a raw API call, the database itself enforces access control.

### Access Control Function: `can_access(shop_id, permission)`

This is the core of the RBAC system. It is a `SECURITY DEFINER` PostgreSQL function that returns `true` if:

1. **The user is the shop owner**: `shops.owner_id = auth.uid()` — owners have implicit full access via the 'owner' role permissions.
2. **The user is an active shop member with the required permission**: There exists a `shop_users` row with `user_id = auth.uid()`, `status = 'active'`, and the member's role (via `role_permissions`) includes the requested permission string.

If neither condition is met, the function returns `false` and the RLS policy blocks the query — the user sees zero rows.

### Policy Pattern

Every business table has 4 separate policies (SELECT, INSERT, UPDATE, DELETE), each using `can_access()` with the appropriate permission string:

```sql
-- Example: customers table
CREATE POLICY "owner_select_customers" ON customers FOR SELECT
  TO authenticated USING (can_access(shop_id, 'customers.view'));

CREATE POLICY "owner_insert_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (can_access(shop_id, 'customers.create'));

CREATE POLICY "owner_update_customers" ON customers FOR UPDATE
  TO authenticated USING (can_access(shop_id, 'customers.update'))
  WITH CHECK (can_access(shop_id, 'customers.update'));

CREATE POLICY "owner_delete_customers" ON customers FOR DELETE
  TO authenticated USING (can_access(shop_id, 'customers.deactivate'));
```

### Tables with RLS

All 22+ business tables have RLS enabled:
- shops, customers, suppliers, products
- sales, sale_items, purchases, purchase_items
- customer_ledger, supplier_ledger
- sale_returns, sale_return_items, purchase_returns, purchase_return_items
- warranties, warranty_claims
- expenses, notifications, daily_closings
- audit_logs, number_sequences
- shop_users, role_permissions

## Roles & Permissions

### Default Roles

| Role | Description |
|------|-------------|
| Owner | Full access to all modules and settings |
| Manager | Operations and staff management, no settings |
| Accountant | Ledgers, payments, reports, audit logs |
| Cashier | Process sales and receive payments |
| Staff | Basic view access |

### Permission Enforcement

Permissions are enforced at **two levels**:

1. **Server-side (RLS)**: The `can_access()` function checks the user's role permissions against the `role_permissions` table. This is the authoritative enforcement — even if the frontend is bypassed, the database blocks unauthorized access.

2. **Client-side (UI)**: The `AuthProvider` loads the user's role and permissions via `get_my_role()` and `get_my_permissions()` RPCs. `AppLayout` filters nav items using `hasPermission()`. Individual pages can also use `hasPermission()` to conditionally show/hide buttons.

### Permission Strings

Permissions follow a `<module>.<verb>` convention:
- `customers.view`, `customers.create`, `customers.update`, `customers.deactivate`
- `sales.view`, `sales.create_cash`, `sales.create_credit`, `sales.return`, `sales.reverse`
- `purchases.view`, `purchases.create_cash`, `purchases.return`
- `reports.view`, `reports.export`
- `users.manage`, `settings.manage`, `audit.view`
- `daily_closing.view`, `daily_closing.manage`
- etc.

## Multi-User Invitation Flow

1. Owner enters an email + selects a role
2. `invite_shop_user()` creates a `shop_users` row with `status='invited'`
3. The invitee signs up with that email
4. A database trigger (`on_auth_user_created` on `auth.users`) calls `activate_invited_user()` which attaches the new user to the shop with `status='active'`
5. The invitee is redirected into the shop (not the onboarding flow)

### Security Guarantees

- Only the shop owner can invite, change roles, or deactivate users
- Invited users cannot access any data until they sign up (their `user_id` is null until then)
- Disabled users (`status='disabled'`) are immediately blocked by `can_access()`
- A user cannot invite themselves or escalate their own role

## Audit Logging

Every financial action (sale creation, purchase creation, payments, returns, daily closing, role changes) creates an `audit_logs` row with:
- `shop_id`, `user_id`, `action`, `entity_type`, `entity_id`, `metadata` (JSONB)

Audit logs are append-only (no UPDATE or DELETE policies exist for the `action` or `metadata` columns).

## AI Security

- The AI API key is stored as a Supabase Edge Function secret — never exposed to the frontend
- All AI requests go through the edge function (server-side)
- The AI never writes to the database — it only returns a structured JSON preview
- The user must explicitly confirm before any transaction is saved
- If the AI key is not configured, the app remains fully functional via manual forms

## Data Safety

- No `DROP` or `DELETE` operations that could lose user data are used in migrations
- Soft-delete (`deleted_at`) is used for customers, suppliers, and products
- Ledger entries are immutable — corrections create reversal/adjustment entries, never edit historical records
- All monetary values use `NUMERIC(14,2)` — no floating-point arithmetic
