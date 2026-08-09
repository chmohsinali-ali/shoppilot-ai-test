# API Documentation — ShopPilot AI

ShopPilot AI uses Supabase as its backend. The "API" consists of:

1. **Supabase auto-generated REST API** (via PostgREST) — all tables are accessible at `https://<project>.supabase.co/rest/v1/<table>`
2. **Edge Functions** — serverless functions for AI and external integrations
3. **RPC Functions** — PostgreSQL functions exposed via `supabase.rpc()`

## Authentication

All requests require a valid Supabase JWT token obtained via `supabase.auth.signInWithPassword()`.

```
Authorization: Bearer <access_token>
apikey: <anon_key>
```

## RPC Endpoints

### create_sale

Creates a sale atomically (sale + items + ledger + stock deduction + audit log).

```typescript
const { data, error } = await supabase.rpc('create_sale', {
  p_shop_id: 'uuid',
  p_customer_id: 'uuid | null',
  p_customer_name: 'Walk-in',
  p_sale_date: '2026-07-26T12:00:00Z',
  p_items: [{ product_id: '', product_name: 'Sugar', unit: 'kg', quantity: 5, price: 270, discount: 0, tax_rate: 0 }],
  p_discount_total: 0,
  p_tax_total: 0,
  p_amount_paid: 2000,
  p_payment_method: 'cash',
  p_notes: '',
  p_user_id: 'uuid',
});
// Returns: sale UUID
```

### receive_customer_payment

Records a customer payment, updates ledger, returns new balance.

```typescript
const { data, error } = await supabase.rpc('receive_customer_payment', {
  p_shop_id: 'uuid',
  p_customer_id: 'uuid',
  p_amount: 5000,
  p_method: 'cash',
  p_reference: '',
  p_notes: '',
  p_user_id: 'uuid',
});
// Returns: new balance (numeric)
```

### create_purchase

Creates a purchase atomically (purchase + items + supplier ledger + stock increase + audit).

```typescript
const { data, error } = await supabase.rpc('create_purchase', {
  p_shop_id: 'uuid',
  p_supplier_id: 'uuid',
  p_supplier_name: 'Abu Bakar Traders',
  p_supplier_invoice_number: 'INV-123',
  p_purchase_date: '2026-07-26T12:00:00Z',
  p_items: [{ product_id: '', product_name: 'Biscuits', unit: 'carton', ordered_quantity: 20, free_units: 2, price_per_unit: 500, regular_discount: 0, special_discount: 0, scheme_discount: 0, additional_discount: 0, tax_amount: 0 }],
  p_discount_total: 0,
  p_tax_total: 0,
  p_delivery_charges: 0,
  p_freight: 0,
  p_other_charges: 0,
  p_amount_paid: 5000,
  p_payment_method: 'cash',
  p_notes: '',
  p_user_id: 'uuid',
});
// Returns: purchase UUID
```

### pay_supplier

Records a supplier payment, updates ledger, returns new payable.

### record_sale_return

Creates a sale return atomically (return + items + customer ledger credit + stock restock + audit).

### record_purchase_return

Creates a purchase return atomically (return + items + supplier ledger debit + stock decrease + audit).

### get_customer_balance

Returns the current outstanding balance for a customer (sum of debit - credit).

### get_supplier_balance

Returns the current payable balance for a supplier (sum of credit - debit).

### next_number

Generates a concurrency-safe sequential number for a given shop + prefix.

```typescript
const { data } = await supabase.rpc('next_number', { p_shop_id: 'uuid', p_prefix: 'SALE' });
// Returns: 'SALE-2026-000001'
```

## Edge Functions

### POST /functions/v1/ai-assistant

Parses natural language into a structured business command.

**Request:**
```json
{ "text": "Mohsin ko 5 kilo cheeni 270 rupay kilo ke hisab se di hai, Mohsin ke khaty mein add kar do" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intent": "SALE",
    "entities": {
      "customer": { "name": "Mohsin" },
      "products": [{ "name": "Sugar", "quantity": 5, "unit": "kilogram", "price": 270 }],
      "payment": { "amount": 2000, "method": "cash" }
    },
    "missing_info": [],
    "confidence": 0.95,
    "warnings": []
  }
}
```

## Tables (REST)

All tables support standard Supabase CRUD via `supabase.from('<table>').select() / insert() / update() / delete()`.

| Table | Description |
|-------|-------------|
| shops | Tenant root |
| customers | Customer master |
| suppliers | Supplier master |
| products | Product catalog |
| sales | Sale invoices |
| sale_items | Sale line items |
| purchases | Purchase invoices |
| purchase_items | Purchase line items |
| customer_ledger | Customer ledger entries |
| supplier_ledger | Supplier ledger entries |
| expenses | Expense records |
| sale_returns | Sale returns |
| sale_return_items | Sale return line items |
| purchase_returns | Purchase returns |
| purchase_return_items | Purchase return line items |
| warranties | Warranty records |
| warranty_claims | Warranty claims |
| notifications | In-app notifications |
| daily_closings | Daily cash reconciliation |
| audit_logs | Audit trail |
| number_sequences | Invoice numbering |

## Error Handling

All errors follow the Supabase/PostgREST convention:

```json
{
  "code": "23505",
  "message": "duplicate key value violates unique constraint",
  "details": "...",
  "hint": "..."
}
```

## Rate Limiting

Rate limiting is handled at the Supabase platform level. Edge functions include timeout and retry logic for AI provider calls.
