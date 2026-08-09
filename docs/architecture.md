# Architecture — ShopPilot AI

## Overview

ShopPilot AI is a multi-tenant, AI-powered shop management application built for shopkeepers in Pakistan and similar markets. It runs as a single-page React application backed by Supabase (PostgreSQL + Auth + Edge Functions).

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide icons
- **Backend**: Supabase (PostgreSQL, Auth, Row-Level Security, Edge Functions)
- **AI**: OpenAI-compatible edge function (works with OpenAI, Groq, Together, OpenRouter, etc.)
- **Exports**: SheetJS (xlsx) for Excel, print-to-PDF for PDF, native CSV generation
- **Testing**: Vitest

## Folder Structure

```
src/
  components/
    ui/              # Reusable primitives: Button, Card, Input, Modal, Toast, EmptyState
    AppLayout.tsx    # Sidebar + mobile nav + theme toggle (permission-filtered)
    AuthShell.tsx    # Shared auth page wrapper
    PageHeader.tsx   # Page title + subtitle + action button
  lib/
    supabase.ts      # Singleton Supabase client
    auth.tsx         # AuthProvider: session, shop, role, permissions, hasPermission()
    theme.tsx        # Light/dark/system theme provider
    calc.ts          # Money math (integer cents), sale/purchase totals, ledger, warranty, unit conversion
    format.ts        # Money/date formatting helpers
    export.ts        # CSV, Excel (xlsx), PDF (print) export utilities
  pages/
    LoginPage.tsx          # Email/password sign-in
    SignupPage.tsx         # Account creation (auto-attaches invited users)
    OnboardingPage.tsx     # 3-step shop setup wizard
    DashboardPage.tsx      # Live stats + quick actions + recent sales
    CustomersPage.tsx      # Searchable list + add modal
    CustomerDetailPage.tsx # Profile + ledger + receive payment
    SuppliersPage.tsx      # Searchable list + add modal
    SupplierDetailPage.tsx # Profile + ledger + pay supplier
    ProductsPage.tsx       # Catalog table + add/edit modal
    SalesPage.tsx          # Invoice list
    NewSalePage.tsx        # Invoice builder + confirm via create_sale RPC
    SaleDetailPage.tsx     # Printable receipt
    PurchasesPage.tsx      # Purchase list
    NewPurchasePage.tsx    # Purchase builder + free units + confirm via create_purchase RPC
    PurchaseDetailPage.tsx # Printable purchase receipt
    ReturnsPage.tsx        # Combined sale/purchase returns
    WarrantyPage.tsx       # Warranty cards + claims
    ExpensesPage.tsx       # Expense list + add modal
    ReportsPage.tsx        # 7 report types with CSV/Excel/PDF export
    NotificationsPage.tsx  # In-app notification center
    UsersPage.tsx          # Staff management + invite + role change + permissions matrix
    DailyClosingPage.tsx  # Cash reconciliation + lock
    SettingsPage.tsx       # Shop profile + preferences + AI status
    AssistantPage.tsx      # AI chat with voice input + transaction preview
  types/
    db.ts            # TypeScript types matching all DB tables
supabase/
  functions/
    ai-assistant/    # OpenAI-compatible NLU edge function
    reminders/       # Scheduled reminder/notification generator
  migrations/        # SQL migrations (applied via Supabase MCP)
docs/
  api.md             # RPC + REST + edge function reference
  architecture.md    # This file
  deployment.md      # Docker, env vars, hosting guides
  security.md        # RLS model, auth, RBAC enforcement
  backups.md         # Supabase backup/restore procedures
```

## Data Flow

### Sale Creation (example)

1. User builds invoice in `NewSalePage` (adds products, sets quantities/prices/discount)
2. Frontend calls `supabase.rpc('create_sale', { ... })`
3. The `create_sale()` PostgreSQL function (SECURITY DEFINER):
   - Checks `shop_owner(shop_id)` — rejects if not authorized
   - Generates invoice number via `next_number(shop_id, 'SALE')`
   - Computes subtotal, grand total, balance, payment status
   - INSERTs into `sales`
   - INSERTs each line into `sale_items` (permanent price snapshot)
   - Deducts stock from `products` (if product_id is set)
   - INSERTs a debit entry into `customer_ledger` (running balance updated)
   - INSERTs an `audit_logs` row
   - Returns the sale UUID
4. Frontend navigates to `SaleDetailPage` showing the receipt

### AI Command Flow

1. User speaks or types in `AssistantPage`
2. Frontend POSTs to `/functions/v1/ai-assistant` edge function
3. Edge function calls the OpenAI-compatible API with a structured system prompt
4. Returns a JSON `ParsedCommand` (intent, entities, missing_info, clarification)
5. Frontend builds a `SalePreview` from the parsed command
6. User reviews and clicks "Confirm"
7. Frontend calls `create_sale()` RPC — same path as manual sale creation
8. **AI never writes to the database** — it only produces a validated preview

### Multi-User Auth Flow

1. Owner invites staff by email via `invite_shop_user()` RPC
2. A `shop_users` row is created with `status='invited'`
3. When the invitee signs up, a database trigger (`on_auth_user_created`) calls `activate_invited_user()` which attaches them to the shop
4. On every page load, `AuthProvider` calls `get_my_shop_id()` to find the user's shop (as owner or active member)
5. `get_my_role()` and `get_my_permissions()` load the user's role and permission list
6. `AppLayout` filters nav items based on `hasPermission()`
7. RLS policies on every table use `can_access(shop_id, permission)` to enforce access server-side

## Multi-Tenancy

Every business record has a `shop_id` column. RLS policies on every table ensure a user can only access rows belonging to a shop they are a member of. The `can_access(shop_id, permission)` function checks:
1. Is the user the shop owner? (shops.owner_id = auth.uid())
2. Is the user an active shop_users member with a role that grants the requested permission?

If neither is true, the query returns zero rows.

## Money Handling

All monetary columns use `NUMERIC(14,2)` in PostgreSQL. In the frontend, `src/lib/calc.ts` uses integer-cent arithmetic to avoid floating-point drift. The `mulMoney`, `addMoney`, `subMoney` functions convert to cents, compute, and convert back.
