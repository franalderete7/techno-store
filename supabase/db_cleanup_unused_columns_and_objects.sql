-- Database cleanup plan for objects that are unused or legacy.
--
-- This file is intentionally split into two phases:
-- 1. Safe now: objects that do not have active app/workflow usage in this repo.
-- 2. Later: legacy mirror columns that should be dropped only after the app
--    stops reading/writing them.

begin;

-- ============================================================================
-- Phase 1: safe to remove now
-- ============================================================================

-- Unused helper/log tables and views that are present in the schema/types but
-- are not referenced by the current app or n8n workflows.
drop view if exists public.v_funnel_daily;
drop view if exists public.v_customer_timeline_events;
drop view if exists public.v_customer_stage_reached;
drop view if exists public.v_recent_purchases;
drop table if exists public.stock_errors_log;
drop table if exists public.crm_funnel_stages;

-- Storefront order follow-up flags are not used by the app or workflows.
alter table public.storefront_orders
  drop column if exists contacted,
  drop column if exists contacted_at;

commit;

-- ============================================================================
-- Phase 2: legacy compatibility columns, now safe after code cleanup
-- ============================================================================

begin;

-- Backfill old ARS-only sales before removing the legacy mirror field.
update public.stock_units
set
  sale_amount = coalesce(sale_amount, price_sold),
  sale_currency = coalesce(sale_currency, 'ARS'),
  sale_amount_ars = coalesce(sale_amount_ars, price_sold)
where price_sold is not null;

create or replace view public.v_realized_sales_daily as
select
  su.date_sold as sale_day,
  count(*)::int as units_sold,
  round(sum(coalesce(su.sale_amount_ars, 0))::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as cost_ars,
  round(sum(coalesce(su.sale_amount_ars, 0) - coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as profit_ars
from public.stock_units su
where su.status = 'sold'
  and su.date_sold is not null
  and su.sale_amount_ars is not null
group by su.date_sold
order by su.date_sold desc;

create or replace view public.v_realized_sales_monthly as
select
  date_trunc('month', su.date_sold)::date as sale_month,
  count(*)::int as units_sold,
  round(sum(coalesce(su.sale_amount_ars, 0))::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as cost_ars,
  round(sum(coalesce(su.sale_amount_ars, 0) - coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as profit_ars
from public.stock_units su
where su.status = 'sold'
  and su.date_sold is not null
  and su.sale_amount_ars is not null
group by date_trunc('month', su.date_sold)::date
order by sale_month desc;

create or replace view public.v_financier_profit_daily as
with ownership as (
  select
    pf.purchase_id,
    f.display_name as financier_name,
    pf.share_pct / 100.0 as share_ratio
  from public.purchase_financiers pf
  join public.financiers f on f.id = pf.financier_id

  union all

  select
    p.purchase_id,
    'Unassigned' as financier_name,
    1.0 as share_ratio
  from public.purchases p
  where not exists (
    select 1
    from public.purchase_financiers pf
    where pf.purchase_id = p.purchase_id
  )
)
select
  su.date_sold as sale_day,
  o.financier_name,
  round(sum(coalesce(su.sale_amount_ars, 0) * o.share_ratio)::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0) * o.share_ratio)::numeric, 2) as cost_ars,
  round(sum((coalesce(su.sale_amount_ars, 0) - coalesce(su.cost_ars_snapshot, 0)) * o.share_ratio)::numeric, 2) as profit_ars,
  round(sum(o.share_ratio)::numeric, 2) as equivalent_units_sold
from public.stock_units su
join ownership o on o.purchase_id = su.purchase_id
where su.status = 'sold'
  and su.date_sold is not null
  and su.sale_amount_ars is not null
group by su.date_sold, o.financier_name
order by su.date_sold desc, o.financier_name asc;

create or replace view public.v_financier_profit_monthly as
with ownership as (
  select
    pf.purchase_id,
    f.display_name as financier_name,
    pf.share_pct / 100.0 as share_ratio
  from public.purchase_financiers pf
  join public.financiers f on f.id = pf.financier_id

  union all

  select
    p.purchase_id,
    'Unassigned' as financier_name,
    1.0 as share_ratio
  from public.purchases p
  where not exists (
    select 1
    from public.purchase_financiers pf
    where pf.purchase_id = p.purchase_id
  )
)
select
  date_trunc('month', su.date_sold)::date as sale_month,
  o.financier_name,
  round(sum(coalesce(su.sale_amount_ars, 0) * o.share_ratio)::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0) * o.share_ratio)::numeric, 2) as cost_ars,
  round(sum((coalesce(su.sale_amount_ars, 0) - coalesce(su.cost_ars_snapshot, 0)) * o.share_ratio)::numeric, 2) as profit_ars,
  round(sum(o.share_ratio)::numeric, 2) as equivalent_units_sold
from public.stock_units su
join ownership o on o.purchase_id = su.purchase_id
where su.status = 'sold'
  and su.date_sold is not null
  and su.sale_amount_ars is not null
group by date_trunc('month', su.date_sold)::date, o.financier_name
order by sale_month desc, o.financier_name asc;

drop view if exists public.v_customer_context;

create view public.v_customer_context as
select
  c.id,
  c.manychat_id,
  c.phone,
  c.whatsapp_phone,
  c.first_name,
  c.last_name,
  c.timezone,
  c.city,
  c.is_salta_capital,
  c.location_source,
  c.phone_area_code,
  c.phone_area_name,
  c.phone_area_province,
  c.preferred_brand,
  c.preferred_budget,
  c.payment_method_last,
  c.payment_methods_mentioned,
  c.interested_product,
  c.products_mentioned,
  c.funnel_stage,
  c.last_funnel_change_at,
  c.last_intent,
  c.lead_score,
  c.tags,
  c.total_interactions,
  c.last_bot_interaction,
  c.last_human_interaction,
  c.human_assigned,
  c.manychat_tags,
  c.created_at,
  c.updated_at,
  c.brands_mentioned,
  c.topics_mentioned,
  c.browsing_at,
  c.interested_at,
  c.closing_at,
  c.human_handoff_at,
  c.first_seen_at,
  c.lead_source,
  c.whatsapp_wa_id
from public.customers c;

alter table public.stock_units
  drop column if exists price_sold;

alter table public.purchases
  drop column if exists funded_by,
  drop column if exists payment_method;

alter table public.customers
  drop column if exists payment_preference,
  drop column if exists lead_source_detail,
  drop column if exists manychat_subscribed_at;

commit;
--
-- ============================================================================
-- Optional simplification, only if you want fewer stored pricing mirrors
-- ============================================================================
--
-- These are not unused today, so they are NOT part of the cleanup above.
-- If you later decide to calculate them instead of storing them, migrate the
-- app first and then you can drop them.
--
-- alter table public.products
--   drop column if exists bancarizada_total,
--   drop column if exists macro_total;
--
-- If you enforce that every stock unit must belong to a purchase, you can also
-- consider removing the stock-level supplier fallback:
--
-- alter table public.stock_units
--   drop column if exists supplier_name;
