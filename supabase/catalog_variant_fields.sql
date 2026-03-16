begin;

alter table public.products
  add column if not exists color text,
  add column if not exists battery_health integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_products_battery_health'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint chk_products_battery_health
      check (battery_health is null or battery_health between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_products_catalog_variant'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint chk_products_catalog_variant
      check (
        (condition = 'new' and battery_health is null)
        or (condition <> 'new' and battery_health is not null)
      ) not valid;
  end if;
end $$;

update public.products as products
set
  color = coalesce(products.color, catalog.color),
  battery_health = coalesce(products.battery_health, catalog.battery_health)
from public.v_product_catalog as catalog
where catalog.product_key = products.product_key
  and products.condition <> 'new';

create or replace function public.validate_stock_unit_catalog_variant()
returns trigger
language plpgsql
as $$
declare
  product_color text;
  product_battery integer;
begin
  select color, battery_health
    into product_color, product_battery
  from public.products
  where product_key = new.product_key;

  if product_color is not null then
    if new.color is null or btrim(new.color) = '' then
      raise exception 'Stock unit color is required for product_key %.', new.product_key;
    end if;

    if lower(btrim(new.color)) <> lower(btrim(product_color)) then
      raise exception 'Stock unit color % does not match product color % for product_key %.', new.color, product_color, new.product_key;
    end if;
  end if;

  if product_battery is not null then
    if new.battery_health is null then
      raise exception 'Stock unit battery_health is required for product_key %.', new.product_key;
    end if;

    if new.battery_health <> product_battery then
      raise exception 'Stock unit battery_health % does not match product battery_health % for product_key %.', new.battery_health, product_battery, new.product_key;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_stock_unit_catalog_variant on public.stock_units;

create trigger trg_validate_stock_unit_catalog_variant
before insert or update on public.stock_units
for each row
execute function public.validate_stock_unit_catalog_variant();

create or replace view public.v_product_catalog as
select
  products.id,
  products.product_key,
  products.category,
  products.product_name,
  products.price_usd,
  products.price_ars,
  products.promo_price_ars,
  products.bancarizada_total,
  products.bancarizada_cuota,
  products.macro_total,
  products.macro_cuota,
  products.cuotas_qty,
  products.in_stock,
  products.delivery_type,
  products.delivery_days,
  products.ram_gb,
  products.storage_gb,
  products.color,
  products.network,
  products.image_url,
  products.battery_health,
  products.condition
from public.products;

commit;
