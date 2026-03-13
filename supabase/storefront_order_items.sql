begin;

create table if not exists public.storefront_order_items (
  id bigserial primary key,
  order_id bigint not null references public.storefront_orders(id) on delete cascade,
  sort_order integer not null default 0,
  product_id bigint null,
  product_key text not null,
  product_name text not null,
  image_url text null,
  unit_price_ars numeric(12, 2) not null,
  quantity integer not null,
  line_total_ars numeric(12, 2) not null,
  availability_code text null,
  created_at timestamptz not null default now(),
  constraint storefront_order_items_quantity_positive check (quantity > 0),
  constraint storefront_order_items_unit_price_nonnegative check (unit_price_ars >= 0),
  constraint storefront_order_items_line_total_nonnegative check (line_total_ars >= 0)
);

create index if not exists idx_storefront_order_items_order_id
  on public.storefront_order_items (order_id);

create index if not exists idx_storefront_order_items_product_key
  on public.storefront_order_items (product_key);

create unique index if not exists idx_storefront_order_items_order_sort
  on public.storefront_order_items (order_id, sort_order);

insert into public.storefront_order_items (
  order_id,
  sort_order,
  product_id,
  product_key,
  product_name,
  image_url,
  unit_price_ars,
  quantity,
  line_total_ars,
  availability_code
)
select
  o.id as order_id,
  greatest(item_ordinality - 1, 0)::integer as sort_order,
  nullif(item ->> 'id', '')::bigint as product_id,
  coalesce(item ->> 'product_key', 'unknown') as product_key,
  coalesce(item ->> 'product_name', 'Unknown product') as product_name,
  nullif(item ->> 'image_url', '') as image_url,
  coalesce((item ->> 'unit_price')::numeric, 0)::numeric(12, 2) as unit_price_ars,
  greatest(coalesce((item ->> 'quantity')::integer, 1), 1) as quantity,
  coalesce((item ->> 'line_total')::numeric, 0)::numeric(12, 2) as line_total_ars,
  nullif(item ->> 'availability', '') as availability_code
from public.storefront_orders o
cross join lateral jsonb_array_elements(o.items) with ordinality as item_rows(item, item_ordinality)
where not exists (
  select 1
  from public.storefront_order_items soi
  where soi.order_id = o.id
);

commit;
