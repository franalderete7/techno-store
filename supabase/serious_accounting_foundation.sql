begin;

create table if not exists public.financiers (
  id bigserial primary key,
  code text not null unique,
  display_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_financiers_updated'
  ) then
    create trigger trg_financiers_updated
    before update on public.financiers
    for each row execute function public.update_updated_at();
  end if;
end $$;

insert into public.financiers (code, display_name)
values
  ('aldegol', 'Aldegol'),
  ('chueco', 'Chueco'),
  ('doctora', 'Doctora')
on conflict (code) do update
set display_name = excluded.display_name,
    active = true;

insert into public.financiers (code, display_name)
select distinct
  regexp_replace(lower(trim(p.funded_by)), '[^a-z0-9]+', '-', 'g') as code,
  trim(p.funded_by) as display_name
from public.purchases p
where p.funded_by is not null
  and trim(p.funded_by) <> ''
on conflict (code) do update
set display_name = excluded.display_name,
    active = true;

create table if not exists public.purchase_financiers (
  id bigserial primary key,
  purchase_id text not null references public.purchases(purchase_id) on delete cascade,
  financier_id bigint not null references public.financiers(id) on delete restrict,
  share_pct numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_financiers_share_range check (share_pct > 0 and share_pct <= 100),
  constraint purchase_financiers_unique unique (purchase_id, financier_id)
);

create index if not exists idx_purchase_financiers_purchase_id
  on public.purchase_financiers (purchase_id);

create index if not exists idx_purchase_financiers_financier_id
  on public.purchase_financiers (financier_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_purchase_financiers_updated'
  ) then
    create trigger trg_purchase_financiers_updated
    before update on public.purchase_financiers
    for each row execute function public.update_updated_at();
  end if;
end $$;

insert into public.purchase_financiers (purchase_id, financier_id, share_pct)
select
  p.purchase_id,
  f.id,
  100
from public.purchases p
join public.financiers f
  on f.code = regexp_replace(lower(trim(p.funded_by)), '[^a-z0-9]+', '-', 'g')
where p.funded_by is not null
  and trim(p.funded_by) <> ''
  and not exists (
    select 1
    from public.purchase_financiers pf
    where pf.purchase_id = p.purchase_id
  );

alter table public.stock_units
  add column if not exists sale_amount numeric(12, 2),
  add column if not exists sale_currency text,
  add column if not exists sale_fx_rate numeric(12, 2),
  add column if not exists sale_amount_ars numeric(12, 2),
  add column if not exists cost_ars_snapshot numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_units_sale_currency_check'
  ) then
    alter table public.stock_units
      add constraint stock_units_sale_currency_check
      check (sale_currency is null or upper(sale_currency) in ('ARS', 'USD'));
  end if;
end $$;

update public.stock_units
set sale_amount = price_sold
where price_sold is not null
  and sale_amount is null;

update public.stock_units
set sale_currency = 'ARS'
where sale_amount is not null
  and sale_currency is null;

update public.stock_units su
set sale_amount_ars = case
  when upper(coalesce(su.sale_currency, 'ARS')) = 'USD'
    then round((coalesce(su.sale_amount, su.price_sold) * coalesce(su.sale_fx_rate, p.usd_rate, 1460))::numeric, 2)
  else coalesce(su.sale_amount, su.price_sold)
end
from public.products p
where p.product_key = su.product_key
  and coalesce(su.sale_amount, su.price_sold) is not null
  and su.sale_amount_ars is null;

update public.stock_units
set sale_amount_ars = coalesce(sale_amount, price_sold)
where coalesce(sale_amount, price_sold) is not null
  and sale_amount_ars is null;

update public.stock_units su
set cost_ars_snapshot = case
  when upper(coalesce(su.cost_currency, 'USD')) = 'ARS'
    then su.cost_unit
  else round((su.cost_unit * coalesce(su.sale_fx_rate, p.usd_rate, 1460))::numeric, 2)
end
from public.products p
where p.product_key = su.product_key
  and su.cost_unit is not null
  and su.cost_ars_snapshot is null;

update public.stock_units
set cost_ars_snapshot = cost_unit
where cost_unit is not null
  and upper(coalesce(cost_currency, 'USD')) = 'ARS'
  and cost_ars_snapshot is null;

create or replace view public.v_realized_sales_daily as
select
  su.date_sold as sale_day,
  count(*)::int as units_sold,
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0))::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as cost_ars,
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0) - coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as profit_ars
from public.stock_units su
where su.status = 'sold'
  and su.date_sold is not null
  and coalesce(su.sale_amount_ars, su.price_sold) is not null
group by su.date_sold
order by su.date_sold desc;

create or replace view public.v_realized_sales_monthly as
select
  date_trunc('month', su.date_sold)::date as sale_month,
  count(*)::int as units_sold,
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0))::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as cost_ars,
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0) - coalesce(su.cost_ars_snapshot, 0))::numeric, 2) as profit_ars
from public.stock_units su
where su.status = 'sold'
  and su.date_sold is not null
  and coalesce(su.sale_amount_ars, su.price_sold) is not null
group by date_trunc('month', su.date_sold)::date
order by sale_month desc;

create or replace view public.v_financier_profit_daily as
with ownership as (
  select
    p.purchase_id,
    f.display_name as financier_name,
    pf.share_pct / 100.0 as share_ratio
  from public.purchase_financiers pf
  join public.purchases p on p.purchase_id = pf.purchase_id
  join public.financiers f on f.id = pf.financier_id

  union all

  select
    p.purchase_id,
    coalesce(nullif(trim(p.funded_by), ''), 'Unassigned') as financier_name,
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
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0) * o.share_ratio)::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0) * o.share_ratio)::numeric, 2) as cost_ars,
  round(sum((coalesce(su.sale_amount_ars, su.price_sold, 0) - coalesce(su.cost_ars_snapshot, 0)) * o.share_ratio)::numeric, 2) as profit_ars,
  round(sum(o.share_ratio)::numeric, 2) as equivalent_units_sold
from public.stock_units su
join ownership o on o.purchase_id = su.purchase_id
where su.status = 'sold'
  and su.date_sold is not null
  and coalesce(su.sale_amount_ars, su.price_sold) is not null
group by su.date_sold, o.financier_name
order by su.date_sold desc, o.financier_name asc;

create or replace view public.v_financier_profit_monthly as
with ownership as (
  select
    p.purchase_id,
    f.display_name as financier_name,
    pf.share_pct / 100.0 as share_ratio
  from public.purchase_financiers pf
  join public.purchases p on p.purchase_id = pf.purchase_id
  join public.financiers f on f.id = pf.financier_id

  union all

  select
    p.purchase_id,
    coalesce(nullif(trim(p.funded_by), ''), 'Unassigned') as financier_name,
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
  round(sum(coalesce(su.sale_amount_ars, su.price_sold, 0) * o.share_ratio)::numeric, 2) as revenue_ars,
  round(sum(coalesce(su.cost_ars_snapshot, 0) * o.share_ratio)::numeric, 2) as cost_ars,
  round(sum((coalesce(su.sale_amount_ars, su.price_sold, 0) - coalesce(su.cost_ars_snapshot, 0)) * o.share_ratio)::numeric, 2) as profit_ars,
  round(sum(o.share_ratio)::numeric, 2) as equivalent_units_sold
from public.stock_units su
join ownership o on o.purchase_id = su.purchase_id
where su.status = 'sold'
  and su.date_sold is not null
  and coalesce(su.sale_amount_ars, su.price_sold) is not null
group by date_trunc('month', su.date_sold)::date, o.financier_name
order by sale_month desc, o.financier_name asc;

commit;
