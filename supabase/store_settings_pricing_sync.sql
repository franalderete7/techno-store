begin;

create or replace function public.get_store_setting_numeric(
  p_keys text[],
  p_default numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  raw_value text;
begin
  select s.value
    into raw_value
  from public.store_settings s
  where s.key = any(p_keys)
  order by array_position(p_keys, s.key), s.updated_at desc nulls last
  limit 1;

  if raw_value is null or btrim(raw_value) = '' then
    return p_default;
  end if;

  if btrim(raw_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return btrim(raw_value)::numeric;
  end if;

  return p_default;
end;
$$;

create or replace function public.sync_products_from_store_settings_pricing()
returns void
language plpgsql
as $$
declare
  v_usd_rate numeric := public.get_store_setting_numeric(array['pricing_default_usd_rate', 'usd_to_ars'], 1460);
  v_cuotas_qty integer := greatest(1, round(public.get_store_setting_numeric(array['pricing_default_cuotas_qty', 'cuotas_qty'], 6))::integer);
  v_bancarizada_interest numeric := public.get_store_setting_numeric(array['pricing_bancarizada_interest', 'bancarizada_interest'], 0.50);
  v_macro_interest numeric := public.get_store_setting_numeric(array['pricing_macro_interest', 'macro_interest'], 0.40);
begin
  with recalculated as (
    select
      p.id,
      v_usd_rate as next_usd_rate,
      v_cuotas_qty as next_cuotas_qty,
      v_bancarizada_interest as next_bancarizada_interest,
      v_macro_interest as next_macro_interest,
      case
        when p.price_usd is not null then round((p.price_usd * v_usd_rate)::numeric, 0)
        else p.price_ars
      end as next_price_ars
    from public.products p
  )
  update public.products p
  set
    usd_rate = r.next_usd_rate,
    cuotas_qty = r.next_cuotas_qty,
    bancarizada_interest = r.next_bancarizada_interest,
    macro_interest = r.next_macro_interest,
    price_ars = r.next_price_ars,
    bancarizada_total = case
      when r.next_price_ars is not null then round((r.next_price_ars * (1 + r.next_bancarizada_interest))::numeric, 0)
      else null
    end,
    bancarizada_cuota = case
      when r.next_price_ars is not null then round(((r.next_price_ars * (1 + r.next_bancarizada_interest)) / r.next_cuotas_qty)::numeric, 0)
      else null
    end,
    macro_total = case
      when r.next_price_ars is not null then round((r.next_price_ars * (1 + r.next_macro_interest))::numeric, 0)
      else null
    end,
    macro_cuota = case
      when r.next_price_ars is not null then round(((r.next_price_ars * (1 + r.next_macro_interest)) / r.next_cuotas_qty)::numeric, 0)
      else null
    end
  from recalculated r
  where r.id = p.id;
end;
$$;

create or replace function public.handle_store_settings_pricing_sync()
returns trigger
language plpgsql
as $$
declare
  affected_key text := coalesce(new.key, old.key);
begin
  if affected_key = any (array[
    'pricing_default_usd_rate',
    'usd_to_ars',
    'pricing_default_cuotas_qty',
    'cuotas_qty',
    'pricing_bancarizada_interest',
    'bancarizada_interest',
    'pricing_macro_interest',
    'macro_interest'
  ]) then
    perform public.sync_products_from_store_settings_pricing();
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_store_settings_pricing_sync on public.store_settings;

create trigger trg_store_settings_pricing_sync
after insert or update or delete on public.store_settings
for each row
execute function public.handle_store_settings_pricing_sync();

select public.sync_products_from_store_settings_pricing();

commit;
