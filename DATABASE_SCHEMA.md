# Database Schema

**Last updated:** 2026-03-17

## Overview

This document describes the Supabase/PostgreSQL schema used by the Techno Store app.

## Source Of Truth

The live Supabase project is the schema source of truth.

- Refresh local TS types with `npm run db:types:pull`
- Generated schema types live in [database.ts](/Users/aldegol/Documents/Apps/techno-store/src/types/database.ts)
- The typed Supabase client uses those generated types in [supabase.ts](/Users/aldegol/Documents/Apps/techno-store/src/lib/supabase.ts)
- n8n should read store policy and CRM context from Supabase, not from hardcoded workflow text
- n8n storefront links should use `STOREFRONT_BASE_URL=https://puntotechno.com`

Current repo reality:

- The repo has generated types for more live objects than it has checked-in SQL migrations
- The app actively depends on storefront order tables and views that are present in the live project
- The only workflow-specific SQL currently checked in is [v17_workflow_foundation.sql](/Users/aldegol/Documents/Apps/techno-store/supabase/v17_workflow_foundation.sql)
- Before the next serious schema refactor, export the missing live migrations and make the repo reproducible again

## Public Objects

Known public tables used by the app and workflows:

- `conversations`
- `crm_tag_definitions`
- `customers`
- `financiers`
- `purchase_financiers`
- `purchase_payment_legs`
- `products`
- `purchases`
- `storefront_order_items`
- `storefront_order_unit_assignments`
- `storefront_orders`
- `stock_units`
- `stickers`
- `store_settings`
- `ai_workflow_turns`

Current public views:

- `v_conversation_signal_daily`
- `v_customer_context`
- `v_product_catalog`
- `v_recent_conversations`
- `v_stock_summary`
- `v_store_context`
- `v_ai_workflow_turn_daily`

## Lean Model

- `conversations`
- `crm_tag_definitions`
- `customers`
- `products`
- `purchases`
- `storefront_orders`
- `stock_units`
- `store_settings`

Workflow/observability objects:

- `conversations`
- `crm_tag_definitions`
- `ai_workflow_turns`
- `v_customer_context`
- `v_recent_conversations`
- `v_store_context`
- `v_ai_workflow_turn_daily`

## Data Split

Keep shared catalog facts in `products`:

- `product_key`
- `product_name`
- `category`
- `ram_gb`
- `storage_gb`
- `color`
- `battery_health`
- `network`
- `condition`
- `image_url`
- delivery fields
- pricing fields

In this app, `products.color` and `products.battery_health` are the storefront promise. Leave them `NULL` when the storefront offer is generic and does not guarantee an exact color/battery.

Keep per-physical-unit facts in `stock_units`:

- `imei1`
- `imei2`
- `product_key`
- `purchase_id`
- `cost_unit`
- `cost_currency`
- `color`
- `battery_health`
- `status`
- `date_received`
- `date_sold`
- `created_by_user_id`
- `sold_by_user_id`
- `proof_image_urls`
- `notes`

In this app, `stock_units.color` and `stock_units.battery_health` are the actual observed facts of the physical device. When a linked product specifies color and/or battery, the stock unit must match.

Keep per-turn CRM analytics in `conversations`:

- raw `message` / `audio_transcription`
- `intent_detected`
- `products_mentioned`
- `applied_tags`
- `payment_methods_detected`
- `brands_detected`
- `topics_detected`
- `funnel_stage_after`
- `conversation_summary`
- `conversation_insights`
- `lead_score_after`

## Enums

| Enum | Values |
|------|--------|
| `stock_status` | `in_stock`, `reserved`, `sold`, `warranty`, `returned` |
| `payment_status` | `pending`, `paid`, `partial` |
| `payment_method` | `transferencia`, `mercado_pago`, `efectivo_ars`, `efectivo_usd`, `crypto`, `bitcoin`, `usdt`, `tarjeta`, `naranja`, `visa`, `mastercard`, `amex`, `cabal`, `cuotas_bancarizada`, `cuotas_macro`, `otro` |
| `error_severity` | `low`, `medium`, `high` |

## Tables

### products

Product catalog with pricing, logistics, and delivery info. This is the **price list**, not physical inventory. `products` is the storefront pricing source of truth. Product cost and sell price are edited here; stock-unit cost does not reprice the catalog.

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
| macro_interest | numeric(4, 2) | YES | 0.40 | Macro interest % |
| cuotas_qty | integer | YES | 6 | Number of installments |
| in_stock | boolean | YES | true | Whether product is in stock |
| delivery_type | text | YES | 'immediate' | Delivery type (immediate, scheduled, pickup) |
| delivery_days | integer | YES | 0 | Days until delivery |
| usd_rate | numeric(10, 2) | YES | 1460 | USD exchange rate |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |
| ram_gb | integer | YES | - | RAM in GB |
| storage_gb | integer | YES | - | Storage in GB |
| color | text | YES | - | Customer-facing guaranteed color for this product variant |
| battery_health | integer | YES | - | Customer-facing guaranteed battery health for this product variant |
| network | text | YES | - | Network type |
| image_url | text | YES | - | Image URL (managed separately) |
| condition | text | NO | 'new' | Product condition: new, like_new, used, or refurbished |
**Constraints:**
- Primary key: `id`
- Unique: `product_key`

**Indexes:**
- `idx_products_category` on `category`
- `idx_products_product_key` on `product_key`
- `idx_products_in_stock` on `in_stock`
- `idx_products_condition` on `condition`

**Triggers:**
- `trg_products_updated` – updates `updated_at` on row update (uses `update_updated_at()`)

---

### stock_units

Physical inventory — 1 row = 1 phone unit identified by IMEI1. The Stock page AI scan can auto-fill unit fields from uploaded images. If the linked product fixes a catalog color and/or battery health, this row must match.

Note: after the lean-schema cleanup, dedicated `reservations`, `sales`, and `sale_items` tables are retired and the old reservation/sale link columns were removed from `stock_units`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| imei1 | text | NO | - | IMEI1 (unique, 15 digits) |
| imei2 | text | YES | - | IMEI2 (informational only) |
| product_key | text | NO | - | FK → products.product_key |
| color | text | YES | - | Color of the individual stock unit |
| purchase_id | text | YES | - | FK → purchases.purchase_id |
| supplier_name | text | YES | - | Supplier name |
| cost_unit | numeric(10, 2) | YES | - | Unit cost |
| cost_currency | text | YES | 'USD' | ARS or USD |
| date_received | date | YES | - | Date received into stock |
| status | stock_status | NO | 'in_stock' | Current unit status |
| date_sold | date | YES | - | Date sold |
| sale_amount | numeric(12, 2) | YES | - | Real sale amount in its original currency |
| sale_currency | text | YES | - | `ARS` or `USD` |
| sale_fx_rate | numeric(12, 2) | YES | - | FX rate used to freeze ARS revenue for USD sales |
| sale_amount_ars | numeric(12, 2) | YES | - | Realized revenue snapshot in ARS |
| cost_ars_snapshot | numeric(12, 2) | YES | - | Realized cost snapshot in ARS |
| notes | text | YES | - | Notes |
| created_by_user_id | uuid | YES | `auth.uid()` | Auth user that registered the stock unit |
| sold_by_user_id | uuid | YES | - | Auth user that marked the stock unit as sold |
| proof_image_urls | text[] | YES | '{}' | URLs of proof images (IMEI photos) in Supabase Storage |
| battery_health | integer | YES | - | Battery health of the individual stock unit |
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
- `idx_stock_units_date_sold` on `date_sold DESC`
- `idx_stock_units_created_by_user_id` on `created_by_user_id`
- `idx_stock_units_sold_by_user_id` on `sold_by_user_id`

**Triggers:**
- `trg_stock_units_updated` – updates `updated_at` on row update
- `trg_stock_units_sale_fields` – auto-fills `date_sold` when a unit is marked as sold
- `trg_sync_products_from_stock_units` – syncs `products.in_stock`; stock cost changes no longer reprice products
- `trg_validate_stock_unit_catalog_variant` – rejects stock rows whose color/battery do not match the linked product variant
- `trg_stock_units_audit_user_ids` – fills `created_by_user_id` on insert and `sold_by_user_id` when a unit is first marked as sold

**Pricing sync rule:** store settings refresh financing defaults (`usd_rate`, interests, cuotas), but stock cost changes do not overwrite product sell price or product cost. `products` remains the source of truth for catalog pricing and product-level cost.

---

### purchases

Purchase orders from suppliers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| purchase_id | text | NO | - | Unique purchase identifier (e.g. PUR-2026-00031) |
| date_purchase | date | NO | CURRENT_DATE | Purchase date |
| supplier_name | text | NO | - | Supplier name |
| payment_status | payment_status | YES | 'pending' | Payment status |
| total_cost | numeric(12, 2) | YES | - | Base purchase total in supplier currency |
| currency | text | YES | 'USD' | Base purchase currency, usually USD |
| notes | text | YES | - | Notes |
| created_by_user_id | uuid | YES | `auth.uid()` | Auth user that created this purchase |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `purchase_id`

**Indexes:**
- `idx_purchases_supplier` on `supplier_name`
- `idx_purchases_date` on `date_purchase DESC`
- `idx_purchases_created_by_user_id` on `created_by_user_id`

**Triggers:**
- `trg_purchases_updated` – updates `updated_at` on row update
- `trg_purchases_created_by_user_id` – fills `created_by_user_id` from the authenticated Supabase user on insert

---

### financiers

Structured list of people or entities that can finance purchases.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | bigserial | NO | - | Primary key |
| code | text | NO | - | Stable unique code |
| display_name | text | NO | - | Human label shown in admin |
| active | boolean | NO | true | Whether the financier is selectable |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `code`
- Unique: `display_name`

**Triggers:**
- `trg_financiers_updated` – updates `updated_at` on row update

---

### purchase_financiers

Ownership split per purchase. This is the source of truth for per-person profit attribution.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | bigserial | NO | - | Primary key |
| purchase_id | text | NO | - | FK → purchases.purchase_id |
| financier_id | bigint | NO | - | FK → financiers.id |
| share_pct | numeric(5, 2) | NO | - | Ownership share percentage |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `(purchase_id, financier_id)`
- Check: `share_pct > 0 AND share_pct <= 100`

**Indexes:**
- `idx_purchase_financiers_purchase_id` on `purchase_id`
- `idx_purchase_financiers_financier_id` on `financier_id`

**Triggers:**
- `trg_purchase_financiers_updated` – updates `updated_at` on row update

---

### purchase_payment_legs

Actual supplier settlement legs per purchase. Use one row per real payment movement, such as USD cash, ARS transfer, USDT, or BTC. This is separate from ownership and allows mixed-currency settlement while keeping a simple base purchase total on `purchases`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | bigserial | NO | - | Primary key |
| purchase_id | text | NO | - | FK → purchases.purchase_id |
| financier_id | bigint | NO | - | FK → financiers.id |
| payment_method | payment_method | NO | 'transferencia' | Actual method used for this leg |
| amount | numeric(12, 2) | NO | - | Amount in the original leg currency |
| currency | text | NO | 'USD' | `ARS`, `USD`, `USDT`, or `BTC` |
| fx_rate_to_ars | numeric(12, 2) | YES | - | FX rate used to freeze an ARS snapshot for non-ARS legs |
| amount_ars | numeric(14, 2) | YES | - | Frozen ARS value of this payment leg |
| paid_at | date | YES | - | Date this payment leg was made |
| notes | text | YES | - | Optional leg-specific note |
| created_at | timestamptz | YES | now() | Created timestamp |
| updated_at | timestamptz | YES | now() | Updated timestamp |

**Constraints:**
- Primary key: `id`
- Check: `amount > 0`
- Check: `currency IN ('ARS', 'USD', 'USDT', 'BTC')`

**Indexes:**
- `idx_purchase_payment_legs_purchase_id` on `purchase_id`
- `idx_purchase_payment_legs_financier_id` on `financier_id`
- `idx_purchase_payment_legs_paid_at` on `paid_at DESC NULLS LAST`

**Triggers:**
- `trg_purchase_payment_legs_updated` – updates `updated_at` on row update

---

### stickers

WhatsApp sticker catalog used by v16. Sticker selection is driven by Supabase instead of ManyChat.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | serial | NO | - | Primary key |
| sticker_key | text | NO | - | Unique stable key for workflow selection |
| label | text | NO | - | Human label |
| description | text | YES | - | What the sticker conveys |
| media_id | text | YES | - | WhatsApp/Meta media id |
| sticker_url | text | YES | - | Public sticker URL fallback |
| enabled | boolean | NO | true | Whether the sticker can be used |
| intents | text[] | NO | '{}' | Matching conversation intents |
| funnel_stages | text[] | NO | '{}' | Allowed funnel stages |
| required_tags | text[] | NO | '{}' | Tags that must already exist |
| excluded_tags | text[] | NO | '{}' | Tags that block the sticker |
| priority | integer | NO | 100 | Lower values win |
| created_at | timestamptz | NO | now() | Created timestamp |
| updated_at | timestamptz | NO | now() | Updated timestamp |

---

## Active Functions

These are the functions actively used by the app and automation after the lean-schema cleanup.

| Function | Returns | Description |
|----------|---------|-------------|
| `update_updated_at()` | trigger | Sets `updated_at = now()` on row update |
| `get_margin_pct_for_cost(p_cost_usd)` | numeric | Returns the default margin band for a USD cost |
| `normalize_stock_cost_to_usd(p_cost_unit, p_cost_currency, p_usd_rate)` | numeric | Converts a stock unit cost to USD using the product USD rate |
| `sync_product_in_stock_flag(p_product_key)` | void | Updates `products.in_stock` from current stock units |
| `apply_product_pricing_from_stock_cost(p_product_key, p_cost_unit, p_cost_currency, p_source_stock_unit_id)` | void | Legacy compatibility no-op; stock cost changes no longer mutate products |
| `sync_product_from_latest_stock_cost(p_product_key)` | void | Rebuilds product pricing from the latest remaining stock unit with cost |
| `sync_products_from_store_settings_pricing()` | void | Rebuilds product financing fields from pricing-related `store_settings` defaults |
| `validate_stock_unit_catalog_variant()` | trigger | Ensures `stock_units.color` / `battery_health` match the linked product variant when the product specifies them |
| `get_stock_count(p_product_key)` | integer | Returns count of in_stock units for a product |
| `increment_interaction(p_manychat_id)` | integer | Atomically increments customer interaction count |

## Views

| View | Description |
|------|-------------|
| `v_stock_summary` | Stock counts per product (in_stock, reserved, sold, total) joined with product info |
| `v_realized_sales_daily` | Daily realized revenue, cost, and profit from sold stock units |
| `v_realized_sales_monthly` | Monthly realized revenue, cost, and profit from sold stock units |
| `v_financier_profit_daily` | Daily realized revenue/cost/profit split by financier ownership |
| `v_financier_profit_monthly` | Monthly realized revenue/cost/profit split by financier ownership |
| `v_customer_context` | Full customer profile for bot context |
| `v_recent_conversations` | Conversation history |
| `v_product_catalog` | Customer-facing catalog with pricing/specs plus guaranteed `color` and `battery_health` read directly from `products` |
| `v_store_context` | Flattened store policy/settings used by the automation prompt |

## Storage Buckets

| Bucket | Public | Description |
|--------|--------|-------------|
| `stock-proof-images` | yes | Proof images (IMEI photos) uploaded when adding stock. Path: `{imei1}/{imei1}_{product_key}_proof_{i}.jpg` |

## Access Model

Public tables are currently unrestricted in the live Supabase project, matching the temporary admin-only setup used by the app and n8n.

| Table | Access |
|-------|--------|
| `conversations` | unrestricted |
| `customers` | unrestricted |
| `products` | unrestricted |
| `purchases` | unrestricted |
| `stock_units` | unrestricted |
| `store_settings` | unrestricted |
