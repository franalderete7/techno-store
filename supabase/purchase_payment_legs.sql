begin;

-- Run this after serious_accounting_foundation.sql.

create table if not exists public.purchase_payment_legs (
  id bigserial primary key,
  purchase_id text not null references public.purchases(purchase_id) on delete cascade,
  financier_id bigint not null references public.financiers(id) on delete restrict,
  payment_method public.payment_method not null default 'transferencia'::public.payment_method,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  fx_rate_to_ars numeric(12, 2),
  amount_ars numeric(14, 2),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_payment_legs_amount_positive check (amount > 0),
  constraint purchase_payment_legs_currency_check check (upper(currency) in ('ARS', 'USD', 'USDT', 'BTC'))
);

create index if not exists idx_purchase_payment_legs_purchase_id
  on public.purchase_payment_legs (purchase_id);

create index if not exists idx_purchase_payment_legs_financier_id
  on public.purchase_payment_legs (financier_id);

create index if not exists idx_purchase_payment_legs_paid_at
  on public.purchase_payment_legs (paid_at desc nulls last);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_purchase_payment_legs_updated'
  ) then
    create trigger trg_purchase_payment_legs_updated
    before update on public.purchase_payment_legs
    for each row execute function public.update_updated_at();
  end if;
end $$;

with ownership as (
  select
    pf.purchase_id,
    pf.financier_id,
    pf.share_pct / 100.0 as share_ratio
  from public.purchase_financiers pf

  union all

  select
    p.purchase_id,
    f.id as financier_id,
    1.0 as share_ratio
  from public.purchases p
  join public.financiers f
    on f.code = regexp_replace(lower(trim(p.funded_by)), '[^a-z0-9]+', '-', 'g')
  where not exists (
    select 1
    from public.purchase_financiers pf
    where pf.purchase_id = p.purchase_id
  )
),
rows_to_insert as (
  select
    p.purchase_id,
    o.financier_id,
    coalesce(p.payment_method, 'transferencia'::public.payment_method) as payment_method,
    round((p.total_cost * o.share_ratio)::numeric, 2) as amount,
    upper(coalesce(p.currency, 'USD')) as currency,
    null::numeric as fx_rate_to_ars,
    case
      when upper(coalesce(p.currency, 'USD')) = 'ARS'
        then round((p.total_cost * o.share_ratio)::numeric, 2)
      else null
    end as amount_ars,
    p.date_purchase as paid_at,
    'Backfilled from legacy purchase payment fields'::text as notes
  from public.purchases p
  join ownership o on o.purchase_id = p.purchase_id
  where p.total_cost is not null
    and p.total_cost > 0
    and not exists (
      select 1
      from public.purchase_payment_legs ppl
      where ppl.purchase_id = p.purchase_id
    )
)
insert into public.purchase_payment_legs (
  purchase_id,
  financier_id,
  payment_method,
  amount,
  currency,
  fx_rate_to_ars,
  amount_ars,
  paid_at,
  notes
)
select
  purchase_id,
  financier_id,
  payment_method,
  amount,
  currency,
  fx_rate_to_ars,
  amount_ars,
  paid_at,
  notes
from rows_to_insert;

update public.purchase_payment_legs
set amount_ars = case
  when upper(currency) = 'ARS' then amount
  when fx_rate_to_ars is not null and fx_rate_to_ars > 0 then round((amount * fx_rate_to_ars)::numeric, 2)
  else amount_ars
end
where amount_ars is null;

commit;
