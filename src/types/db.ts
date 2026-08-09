export type Shop = {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  currency: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  logo_url: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  inventory_enabled: boolean;
  catalog_enabled: boolean;
  tax_enabled: boolean;
  default_tax_rate: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ShopUser = {
  id: string;
  shop_id: string;
  user_id: string | null;
  role: string;
  status: string;
  invited_email: string;
  created_at: string;
  updated_at: string;
};

export type RolePermission = {
  id: string;
  role: string;
  permissions: string[];
  created_at: string;
};

export type Customer = {
  id: string;
  shop_id: string;
  customer_code: string | null;
  full_name: string;
  father_name: string | null;
  business_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  national_id: string | null;
  customer_type: string;
  credit_enabled: boolean;
  credit_limit: number | null;
  opening_balance: number;
  opening_balance_type: string;
  address_line1: string | null;
  area: string | null;
  city: string | null;
  province: string | null;
  country: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Product = {
  id: string;
  shop_id: string;
  product_code: string | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  stock: number;
  min_stock_level: number;
  reorder_qty: number;
  tax_rate: number;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Sale = {
  id: string;
  shop_id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  sale_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  amount_paid: number;
  balance: number;
  payment_status: string;
  payment_method: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  status: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  superseded_by_sale_id: string | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  tax_rate: number;
  line_total: number;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  shop_id: string;
  customer_id: string;
  transaction_date: string;
  entry_type: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  created_by: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  shop_id: string;
  expense_number: string | null;
  expense_date: string;
  category: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  shop_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SaleItemInput = {
  product_id?: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  price: number;
  discount?: number;
  tax_rate?: number;
};

export type Supplier = {
  id: string;
  shop_id: string;
  supplier_code: string | null;
  supplier_name: string;
  company_name: string | null;
  contact_person: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  distributor_contact: string | null;
  tso_contact: string | null;
  registration_number: string | null;
  tax_number: string | null;
  channel: string | null;
  customer_number_with_supplier: string | null;
  route: string | null;
  sub_locality: string | null;
  order_booker_name: string | null;
  distribution_manager_name: string | null;
  default_payment_days: number | null;
  credit_limit: number | null;
  opening_balance: number;
  opening_balance_type: string;
  address_line1: string | null;
  area: string | null;
  city: string | null;
  province: string | null;
  country: string;
  bank_account_title: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  iban: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SupplierLedgerEntry = {
  id: string;
  shop_id: string;
  supplier_id: string;
  transaction_date: string;
  entry_type: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  created_by: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  shop_id: string;
  purchase_number: string;
  supplier_invoice_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  distributor_contact: string | null;
  tso_contact: string | null;
  channel: string | null;
  route: string | null;
  sub_locality: string | null;
  order_booker_name: string | null;
  distribution_manager_name: string | null;
  purchase_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  delivery_charges: number;
  freight: number;
  other_charges: number;
  grand_total: number;
  amount_paid: number;
  balance: number;
  payment_status: string;
  payment_method: string;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  supplier_invoice_status: string;
  shop_customer_number: string | null;
  status: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  superseded_by_purchase_id: string | null;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  ordered_quantity: number;
  free_units: number;
  total_received_quantity: number;
  price_per_unit: number;
  gross_value: number;
  regular_discount: number;
  special_discount: number;
  scheme_discount: number;
  additional_discount: number;
  total_discount: number;
  trade_offer_amount: number;
  tax_rate: number;
  tax_amount: number;
  net_amount: number;
  batch_number: string | null;
  manufacturing_date: string | null;
  expiry_date: string | null;
  serial_numbers: string | null;
  effective_cost_per_unit: number;
  /* Real FMCG invoice fields */
  hs_code: string | null;
  supplier_product_code: string | null;
  ctn_size: string | null;
  retail_price: number;
  trade_activity: string | null;
  sales_tax_rate: number;
  further_tax: number;
  advance_tax: number;
  tax_type: string | null;
  created_at: string;
};

export type PurchaseItemInput = {
  product_id?: string | null;
  product_name: string;
  unit: string;
  ordered_quantity: number;
  free_units?: number;
  price_per_unit: number;
  regular_discount?: number;
  special_discount?: number;
  scheme_discount?: number;
  additional_discount?: number;
  trade_offer_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  batch_number?: string;
  manufacturing_date?: string;
  expiry_date?: string;
  serial_numbers?: string;
  /* Real FMCG invoice fields */
  hs_code?: string;
  supplier_product_code?: string;
  ctn_size?: string;
  retail_price?: number;
  trade_activity?: string;
  sales_tax_rate?: number;
  further_tax?: number;
  advance_tax?: number;
  tax_type?: string;
};

export type SaleReturn = {
  id: string;
  shop_id: string;
  return_number: string;
  sale_id: string;
  customer_id: string | null;
  customer_name: string | null;
  return_date: string;
  reason: string | null;
  refund_amount: number;
  restock_items: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type SaleReturnItem = {
  id: string;
  sale_return_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  line_total: number;
  created_at: string;
};

export type PurchaseReturn = {
  id: string;
  shop_id: string;
  return_number: string;
  purchase_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  return_date: string;
  reason: string | null;
  refund_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type PurchaseReturnItem = {
  id: string;
  purchase_return_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  line_total: number;
  created_at: string;
};

export type Warranty = {
  id: string;
  shop_id: string;
  warranty_number: string;
  sale_id: string | null;
  sale_item_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  product_name: string;
  serial_number: string | null;
  batch_number: string | null;
  warranty_provider: string | null;
  warranty_start_date: string;
  warranty_duration: number;
  warranty_unit: string;
  warranty_expiry_date: string;
  warranty_terms: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type WarrantyClaim = {
  id: string;
  shop_id: string;
  claim_number: string;
  warranty_id: string;
  customer_id: string | null;
  customer_name: string | null;
  product_name: string;
  claim_date: string;
  problem_description: string | null;
  technician_notes: string | null;
  claim_status: string;
  resolution_date: string | null;
  cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  shop_id: string;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
};

export type DailyClosing = {
  id: string;
  shop_id: string;
  closing_date: string;
  opening_cash: number;
  cash_sales: number;
  customer_payments: number;
  supplier_payments: number;
  expenses: number;
  cash_withdrawals: number;
  cash_deposits: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  manager_notes: string | null;
  is_locked: boolean;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
};
