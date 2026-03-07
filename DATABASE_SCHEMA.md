# Database Schema

**Last updated:** 2026-03-05

## Overview

This document describes the Supabase/PostgreSQL schema used by the Techno Store app.

## Enums

| Enum | Values |
|------|--------|
| `stock_status` | `in_stock`, `reserved`, `sold`, `warranty`, `returned` |
| `sale_status` | `incomplete`, `confirmed`, `cancelled` |
| `payment_status` | `pending`, `paid`, `partial` |
| `reservation_status` | `interested`, `pending_deposit`, `deposit_paid`, `cancelled`, `delivered` |
| `payment_method` | `transferencia`, `efectivo_ars`, `efectivo_usd`, `crypto`, `tarjeta`, `cuotas_bancarizada`, `cuotas_macro`, `otro` |
| `error_severity` | `low`, `medium`, `high` |

## Tables

### products

Product catalog with pricing, logistics, and delivery info. This is the **price list**, not physical inventory.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| product_key | text | NO | - | Unique product identifier |
| category | text | NO | - | Product category |
| product_name | text | NO | - | Display name |
| cost_usd | numeric(10, 2) | YES | - | Cost in USD |
| logistics_usd | numeric(10, 2) | YES | 10 | Logistics cost in USD |
| total_cost_usd | numeric(10, 2) | YES | - | Total cost in USD |
| margin_pct | numeric(4, 2) | YES | - | Margin percentage |
| price_usd | numeric(10, 2) | NO | - | Price in USD |
| price_ars | numeric(12, 2) | NO | - | Price in ARS |
| promo_price_ars | numeric(12, 2) | YES | - | Promotional price in ARS |
| bancarizada_total | numeric(12, 2) | YES | - | Bancarizada total |
| bancarizada_cuota | numeric(12, 2) | YES | - | Bancarizada cuota |
| bancarizada_interest | numeric(4, 2) | YES | 0.50 | Bancarizada interest % |
| macro_total | numeric(12, 2) | YES | - | Macro total |
| macro_cuota | numeric(12, 2) | YES | - | Macro cuota |
| macro_interest | numeric(4, 2) | YES | 0.35 | Macro interest % |
| cuotas_qty | integer | YES | 6 | Number of installments |
| in_stock | boolean | YES | true | Whether product is in stock |
| delivery_type | text | YES | 'immediate' | Delivery type (immediate, scheduled, pickup) |
| delivery_days | integer | YES | 0 | Days until delivery |
| usd_rate | numeric(10, 2) | YES | 1460 | USD exchange rate |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |
| ram_gb | integer | YES | - | RAM in GB |
| storage_gb | integer | YES | - | Storage in GB |
| color | text | YES | - | Product color |
| network | text | YES | - | Network type |
| image_url | text | YES | - | Image URL (managed separately) |
| battery_health | integer | YES | - | Battery health percentage |
| condition | text | NO | 'new' | Product condition: new, like_new, used, or refurbished |

**Constraints:**
- Primary key: `id`
- Unique: `product_key`

**Indexes:**
- `idx_products_category` on `category`
- `idx_products_product_key` on `product_key`
- `idx_products_in_stock` on `in_stock`
- `idx_products_condition` on `condition`
- `idx_products_battery_health` on `battery_health`

**Triggers:**
- `trg_products_updated` – updates `updated_at` on row update (uses `update_updated_at()`)

---

### stock_units

Physical inventory — 1 row = 1 phone unit identified by IMEI1.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| imei1 | text | NO | - | IMEI1 (unique, 15 digits) |
| imei2 | text | YES | - | IMEI2 (informational only) |
| product_key | text | NO | - | FK → products.product_key |
| purchase_id | text | YES | - | FK → purchases.purchase_id |
| supplier_name | text | YES | - | Supplier name |
| cost_unit | numeric(10, 2) | YES | - | Unit cost |
| cost_currency | text | YES | 'USD' | ARS or USD |
| date_received | date | YES | - | Date received into stock |
| status | stock_status | NO | 'in_stock' | Current unit status |
| reserved_for_phone | text | YES | - | Phone of person who reserved |
| reserved_for_customer_id | integer | YES | - | FK → customers.id |
| reserved_until | timestamptz | YES | - | Reservation expiry |
| reservation_id | integer | YES | - | FK → reservations.id |
| sale_id | integer | YES | - | FK → sales.id |
| date_sold | date | YES | - | Date sold |
| price_sold | numeric(12, 2) | YES | - | Sale price in ARS |
| notes | text | YES | - | Notes |
| proof_image_urls | text[] | YES | '{}' | URLs of proof images (IMEI photos) in Supabase Storage |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Storage:** Proof images are stored in bucket `stock-proof-images` at path `{imei1}/{imei1}_{product_key}_proof_{i}.jpg`.

**Constraints:**
- Primary key: `id`
- Unique: `imei1`
- Check: `imei1 ~ '^\d{15}$'`
- Check: `imei2 IS NULL OR imei2 ~ '^\d{15}$'`

**Indexes:**
- `idx_stock_units_product_key` on `product_key`
- `idx_stock_units_status` on `status`
- `idx_stock_units_purchase_id` on `purchase_id`
- `idx_stock_units_sale_id` on `sale_id`
- `idx_stock_units_reserved_customer` on `reserved_for_customer_id`

**Triggers:**
- `trg_stock_units_updated` – updates `updated_at` on row update

---

### purchases

Purchase orders from suppliers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| purchase_id | text | NO | - | Unique purchase identifier (e.g. PUR-2026-00031) |
| date_purchase | date | NO | CURRENT_DATE | Purchase date |
| supplier_name | text | NO | - | Supplier name |
| payment_method | payment_method | YES | 'transferencia' | How supplier was paid |
| payment_status | payment_status | YES | 'pending' | Payment status |
| total_cost | numeric(12, 2) | YES | - | Total cost of purchase |
| currency | text | YES | 'USD' | ARS or USD |
| funded_by | text | YES | 'own' | Capital source (e.g. own, partner name) |
| notes | text | YES | - | Notes |
| created_by | text | YES | - | Who created this record |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `purchase_id`

**Indexes:**
- `idx_purchases_supplier` on `supplier_name`
- `idx_purchases_date` on `date_purchase DESC`

**Triggers:**
- `trg_purchases_updated` – updates `updated_at` on row update

---

### sales

Sales to customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| date_sale | date | NO | CURRENT_DATE | Sale date |
| customer_id | integer | YES | - | FK → customers.id |
| customer_name | text | YES | - | Customer name |
| customer_phone | text | YES | - | Customer phone |
| customer_dni | text | YES | - | Customer DNI |
| payment_method | payment_method | YES | 'transferencia' | Payment method |
| amount_total | numeric(12, 2) | YES | - | Total sale amount |
| currency | text | YES | 'ARS' | ARS or USD |
| seller | text | YES | - | Seller name |
| channel | text | YES | 'whatsapp' | Channel (whatsapp, presencial, web, otro) |
| status | sale_status | NO | 'incomplete' | Sale status |
| notes | text | YES | - | Notes |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`

**Indexes:**
- `idx_sales_customer_id` on `customer_id`
- `idx_sales_date` on `date_sale DESC`
- `idx_sales_status` on `status`

**Triggers:**
- `trg_sales_updated` – updates `updated_at` on row update

---

### sale_items

Links a sale to stock units by IMEI.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| sale_id | integer | NO | - | FK → sales.id (CASCADE) |
| stock_unit_id | integer | NO | - | FK → stock_units.id |
| imei1 | text | NO | - | IMEI1 of sold unit |
| product_key | text | NO | - | Product key |
| unit_price | numeric(12, 2) | YES | - | Price per unit |
| created_at | timestamptz | YES | now() | Created timestamp |

**Indexes:**
- `idx_sale_items_sale_id` on `sale_id`
- `idx_sale_items_imei1` on `imei1`

---

### reservations

Leads, deposits (señas), and waiting list.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| customer_id | integer | YES | - | FK → customers.id |
| manychat_id | text | YES | - | ManyChat subscriber ID |
| customer_name | text | YES | - | Customer name |
| customer_phone | text | YES | - | Customer phone |
| product_key | text | NO | - | FK → products.product_key |
| requested_color | text | YES | - | Preferred color |
| status | reservation_status | NO | 'interested' | Reservation status |
| deposit_amount | numeric(12, 2) | YES | - | Deposit amount paid |
| deposit_date | date | YES | - | Date deposit was paid |
| deposit_method | payment_method | YES | - | How deposit was paid |
| balance_due | numeric(12, 2) | YES | - | Remaining balance |
| stock_unit_id | integer | YES | - | FK → stock_units.id (reserved unit) |
| source | text | YES | 'whatsapp' | Source (whatsapp, presencial, web, n8n) |
| notes | text | YES | - | Notes |
| last_contact_at | timestamptz | YES | - | Last contact timestamp |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Partial unique index: `idx_unique_active_reservation` on `(customer_phone, product_key)` WHERE status NOT IN ('cancelled', 'delivered')

**Indexes:**
- `idx_reservations_customer_id` on `customer_id`
- `idx_reservations_manychat_id` on `manychat_id`
- `idx_reservations_product_key` on `product_key`
- `idx_reservations_status` on `status`

**Triggers:**
- `trg_reservations_updated` – updates `updated_at` on row update

---

### stock_errors_log

Error tracking for stock operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| event | text | NO | - | Event that caused the error |
| severity | error_severity | NO | 'medium' | low, medium, high |
| error_code | text | NO | - | Error code (e.g. DUPLICATE_IMEI1) |
| message | text | YES | - | Human-readable message |
| payload | jsonb | YES | - | Full context as JSON |
| resolved | boolean | YES | false | Whether resolved |
| resolved_at | timestamptz | YES | - | Resolution timestamp |
| resolved_by | text | YES | - | Who resolved it |
| created_at | timestamptz | YES | now() | Created timestamp |

**Error codes:**
- `DUPLICATE_IMEI1` – IMEI already exists
- `INVALID_IMEI1_FORMAT` – Not 15 digits
- `SALE_WITHOUT_STOCK` – IMEI not in stock
- `SALE_IMEI_ALREADY_SOLD` – IMEI already sold
- `MISSING_REQUIRED_FIELDS` – Required fields missing

**Indexes:**
- `idx_stock_errors_code` on `error_code`
- `idx_stock_errors_resolved` on `resolved`

## Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `update_updated_at()` | trigger | Sets `updated_at = now()` on row update |
| `sell_unit_by_imei(p_imei1, p_sale_id)` | jsonb | Atomically sells a unit by IMEI1; validates status; logs errors |
| `reserve_unit(p_imei1, p_customer_phone, p_customer_id, p_reservation_id, p_hours)` | jsonb | Reserves a unit for a customer with expiry window |
| `get_stock_count(p_product_key)` | integer | Returns count of in_stock units for a product |
| `increment_interaction(p_manychat_id)` | integer | Atomically increments customer interaction count |

## Views

| View | Description |
|------|-------------|
| `v_stock_summary` | Stock counts per product (in_stock, reserved, sold, total) joined with product info |
| `v_active_reservations` | Active reservations with product name and available stock count |
| `v_recent_purchases` | Purchase orders with unit count |
| `v_customer_context` | Full customer profile for bot context |
| `v_recent_conversations` | Conversation history |
| `v_product_catalog` | Product catalog with all pricing and specs |

## Storage Buckets

| Bucket | Public | Description |
|--------|--------|-------------|
| `stock-proof-images` | yes | Proof images (IMEI photos) uploaded when adding stock. Path: `{imei1}/{imei1}_{product_key}_proof_{i}.jpg` |

## RLS Policies

All stock-related tables have RLS enabled. `service_role` (web admin + n8n) has full access. Anon key has no access to stock tables.

| Table | Policy |
|-------|--------|
| `stock_units` | `service_role_all` – full access |
| `purchases` | `service_role_all` – full access |
| `sales` | `service_role_all` – full access |
| `sale_items` | `service_role_all` – full access |
| `reservations` | `service_role_all` – full access |
| `stock_errors_log` | `service_role_all` – full access |
