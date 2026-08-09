# ShopPilot AI

**"Bas boliye, ShopPilot AI hisaab sambhal lega."**

AI-powered shop and small-business management system for shopkeepers in Pakistan and similar markets. Manage sales, purchases, customers, suppliers, inventory, ledgers, warranty, expenses, returns, and reports — through natural voice/text commands or traditional forms.

## Features

- **AI Assistant** — Speak or type in Urdu/English/Roman Urdu; the AI builds a transaction preview you confirm before saving. OpenAI-compatible provider (works with OpenAI, Groq, Together, OpenRouter, etc.)
- **Multi-tenant** — Each shop is an isolated tenant with Row-Level Security enforced at the database level
- **Dashboard** — Live stats: today's sales, monthly sales, outstanding receivables, expenses, low-stock alerts
- **Customers** — Master records, opening balances, credit limits, full ledger history, receive payments
- **Suppliers** — Master records with distributor fields, opening payables, ledger, supplier payments
- **Products** — Catalog with SKU/barcode, units, stock levels, reorder points, price history
- **Sales** — Invoice builder with product search, line items, discounts, payment tracking, printable receipts
- **Purchases** — Supplier invoice with free units, multiple discount types, batch/expiry tracking, effective cost calculation
- **Returns** — Sale returns (with stock restock + ledger credit) and purchase returns (with stock decrease + payable adjustment)
- **Warranty** — Warranty records with auto-calculated expiry, warranty claims with status workflow
- **Expenses** — Categorized expense tracking with vendor and payment method
- **Reports** — Sales, purchases, expenses, P&L, inventory valuation, customer/supplier balances — with CSV export and print
- **Notifications** — In-app notification center with read/archive/delete
- **User Roles & Permissions** — Role definitions (Owner, Manager, Accountant, Cashier, Staff) with full permissions matrix
- **Audit Logs** — Every financial action is logged with metadata
- **Dark Mode** — Light/dark/system theme

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide icons
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Row-Level Security)
- **AI**: OpenAI-compatible edge function with retry, timeout, and graceful fallback

## Quick Start

### Prerequisites

- Node.js 20+
- A Supabase project (the schema migrations are applied via the Supabase MCP tools)

### Development

```bash
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

### Build

```bash
npm run build
npm run preview
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `AI_API_KEY` | No | OpenAI-compatible API key (add to Supabase secrets) |
| `AI_BASE_URL` | No | API base URL (default: `https://api.openai.com/v1`) |
| `AI_MODEL` | No | Model name (default: `gpt-4o-mini`) |
| `AI_TIMEOUT_MS` | No | Request timeout (default: 30000) |
| `AI_MAX_RETRIES` | No | Retry count (default: 2) |

## AI Configuration

The AI assistant uses an OpenAI-compatible API. To activate it:

1. Add `AI_API_KEY` as a secret in your Supabase project (Edge Functions secrets)
2. Optionally set `AI_BASE_URL` and `AI_MODEL` to use a different provider (Groq, Together, OpenRouter, etc.)
3. The edge function is already deployed — no code changes needed

Until the key is added, the app works fully via manual forms.

## Docker

```bash
docker-compose up --build
```

The app will be available at `http://localhost:5173`.

## Database Schema

The schema is managed via Supabase migrations (applied through the Supabase MCP tools). Key tables:

- `shops` — tenant root
- `customers` / `suppliers` — master records
- `products` — catalog
- `sales` / `sale_items` — sales
- `purchases` / `purchase_items` — purchases
- `customer_ledger` / `supplier_ledger` — immutable ledgers
- `sale_returns` / `purchase_returns` — returns
- `warranties` / `warranty_claims` — warranty
- `expenses` — expense tracking
- `notifications` — in-app notifications
- `audit_logs` — audit trail
- `number_sequences` — concurrency-safe invoice numbering
- `daily_closings` — daily cash reconciliation

All tables have RLS enabled with owner-scoped policies.

## Testing

```bash
npm test
```

Tests cover money calculations, unit conversions, sale/purchase totals, ledger balances, and warranty expiry computation.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm test` | Run tests |

## Deployment

### Vercel / Netlify / Render / Railway

1. Set environment variables in the hosting dashboard
2. Build command: `npm run build`
3. Output directory: `dist`

### VPS / Docker

```bash
docker-compose up -d --build
```

### Supabase

The Supabase project is already provisioned. Migrations are applied via the Supabase MCP tools. Edge functions are deployed via the Supabase MCP tools.

## Architecture

```
src/
  components/     # Reusable UI components (Button, Card, Modal, Input, Toast)
  lib/            # Supabase client, auth context, theme, calc, format, export
  pages/          # Route pages (Dashboard, Customers, Sales, etc.)
  types/          # TypeScript types matching DB schema
supabase/
  functions/      # Edge functions (ai-assistant)
  migrations/     # SQL migrations (applied via Supabase MCP)
```

## License

This is a proprietary project for ShopPilot AI.
