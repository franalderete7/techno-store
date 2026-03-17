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

alter table public.products
  drop constraint if exists chk_products_pricing_mode;

alter table public.products
  drop constraint if exists products_pricing_source_stock_unit_id_fkey;

alter table public.products
  drop column if exists pricing_source_stock_unit_id,
  drop column if exists pricing_mode;

create or replace function public.get_product_margin_pct_for_cost(
  p_total_cost_usd numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  v_band_1_max numeric := public.get_store_setting_numeric(array['pricing_margin_band_1_max_cost_usd'], 200);
  v_band_2_max numeric := public.get_store_setting_numeric(array['pricing_margin_band_2_max_cost_usd'], 400);
  v_band_3_max numeric := public.get_store_setting_numeric(array['pricing_margin_band_3_max_cost_usd'], 800);
  v_band_1_margin numeric := public.get_store_setting_numeric(array['pricing_margin_band_1_margin_pct'], 0.30);
  v_band_2_margin numeric := public.get_store_setting_numeric(array['pricing_margin_band_2_margin_pct'], 0.25);
  v_band_3_margin numeric := public.get_store_setting_numeric(array['pricing_margin_band_3_margin_pct'], 0.20);
  v_band_4_margin numeric := public.get_store_setting_numeric(array['pricing_margin_band_4_margin_pct'], 0.15);
begin
  if p_total_cost_usd is null then
    return v_band_3_margin;
  end if;

  if p_total_cost_usd <= v_band_1_max then
    return v_band_1_margin;
  end if;

  if p_total_cost_usd <= v_band_2_max then
    return v_band_2_margin;
  end if;

  if p_total_cost_usd <= v_band_3_max then
    return v_band_3_margin;
  end if;

  return v_band_4_margin;
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
      coalesce(
        p.price_ars,
        case
          when p.price_usd is not null then round((p.price_usd * v_usd_rate)::numeric, 0)
          else null
        end
      ) as effective_price_ars
    from public.products p
  )
  update public.products p
  set
    usd_rate = v_usd_rate,
    cuotas_qty = v_cuotas_qty,
    bancarizada_interest = v_bancarizada_interest,
    macro_interest = v_macro_interest,
    bancarizada_total = case
      when r.effective_price_ars is not null then round((r.effective_price_ars * (1 + v_bancarizada_interest))::numeric, 0)
      else null
    end,
    bancarizada_cuota = case
      when r.effective_price_ars is not null then round(((r.effective_price_ars * (1 + v_bancarizada_interest)) / v_cuotas_qty)::numeric, 0)
      else null
    end,
    macro_total = case
      when r.effective_price_ars is not null then round((r.effective_price_ars * (1 + v_macro_interest))::numeric, 0)
      else null
    end,
    macro_cuota = case
      when r.effective_price_ars is not null then round(((r.effective_price_ars * (1 + v_macro_interest)) / v_cuotas_qty)::numeric, 0)
      else null
    end
  from recalculated r
  where r.id = p.id;
end;
$$;

create or replace function public.apply_product_pricing_from_stock_cost(
  p_product_key text,
  p_cost_unit numeric,
  p_cost_currency text,
  p_source_stock_unit_id integer
)
returns void
language plpgsql
as $$
begin
  -- Product pricing and product cost are controlled from the catalog (`products`).
  -- Stock-unit cost changes must not mutate product pricing fields.
  return;
end;
$$;

select public.sync_products_from_store_settings_pricing();

commit;
