# TechnoStore

TechnoStore is a Next.js app backed by Supabase with three active surfaces:

- public storefront and product detail pages
- protected admin for products, stock, purchases, CRM, orders, and settings
- n8n-based WhatsApp sales workflows, with `v17` as the current modular architecture

## Current Scope

The repo is no longer just a products admin.

- Public storefront: `/`
- Public product detail: `/productos/[slug]`
- Admin shell: `/admin`
- Admin orders: `/admin/orders`
- Admin stock: `/admin/stock`
- Admin purchases: `/admin/purchases`
- Admin CRM: `/admin/crm`
- Admin settings: `/admin/settings`
- Web checkout API: `/api/storefront/checkout`
- Workflow definitions: [n8n-automations](/Users/aldegol/Documents/Apps/techno-store/n8n-automations)

## Architecture

- App runtime: Next.js 14 + React 18
- Database/auth/storage: Supabase
- Public catalog source: `v_product_catalog`
- Store policy source: `v_store_context` + `store_settings`
- CRM source: `customers`, `conversations`, `crm_tag_definitions`, `v_customer_context`
- WhatsApp orchestration: n8n workflows in [n8n-automations](/Users/aldegol/Documents/Apps/techno-store/n8n-automations)
- Current workflow target: `v17`

Supporting docs:

- App/database notes: [DATABASE_SCHEMA.md](/Users/aldegol/Documents/Apps/techno-store/DATABASE_SCHEMA.md)
- `v17` architecture: [TECHNOSTORE_V17_ARCHITECTURE.md](/Users/aldegol/Documents/Apps/techno-store/docs/TECHNOSTORE_V17_ARCHITECTURE.md)

## Database Reality

The live Supabase project is the schema source of truth.

- Refresh local DB types with `npm run db:types:pull`
- Generated types live in [database.ts](/Users/aldegol/Documents/Apps/techno-store/src/types/database.ts)
- The repo does not yet contain a complete migration history for all live objects
- Before future schema work, export and check in the missing live storefront/order/accounting migrations

Checked-in SQL currently includes:

- [v17_workflow_foundation.sql](/Users/aldegol/Documents/Apps/techno-store/supabase/v17_workflow_foundation.sql)

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure `.env.local`

Required app env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional admin restriction:

- `ADMIN_EMAIL_ALLOWLIST=you@example.com,partner@example.com`

If you use checkout writes locally or in deploys, also set:

- `SUPABASE_SERVICE_ROLE_KEY`

If you use n8n workflows, configure the corresponding workflow envs in n8n, not here.

3. Configure Supabase Auth for admin access

- Enable email/password auth
- Add allowlist emails if you want a closed admin

4. Start dev server

```bash
npm run dev
```

## Workflows

Active repo workflow generation is centered on `v17`.

- Active `v17` files stay in [n8n-automations](/Users/aldegol/Documents/Apps/techno-store/n8n-automations)
- Older workflow generations are archived under `n8n-automations/archive`
- `v17` contracts live in [docs/technostore-v17](/Users/aldegol/Documents/Apps/techno-store/docs/technostore-v17)

## Operational Notes

- Store policy, warranties, payment methods, and website URL should come from `store_settings`, not hardcoded workflow prompts
- Exact product answers should be driven by deterministic Supabase candidate retrieval plus validation
- Do not treat the checked-in SQL as a complete bootstrap of production until the missing live migrations are exported
