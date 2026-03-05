# Database Schema

**Last updated:** 2026-03-03

## Overview

This document describes the Supabase/PostgreSQL schema used by the Techno Store app.

## Tables

### products

Product catalog with pricing, logistics, and delivery info.

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
