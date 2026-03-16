begin;

alter table public.storefront_orders
  add column if not exists phone text,
  add column if not exists phone_normalized text,
  add column if not exists customer_id integer,
  add column if not exists manychat_id text,
  add column if not exists whatsapp_wa_id text,
  add column if not exists whatsapp_phone text,
  add column if not exists source_channel text;

alter table public.storefront_orders
  alter column source_channel set default 'storefront_web';

update public.storefront_orders
set
  phone = coalesce(
    nullif(btrim(phone), ''),
    case
      when delivery_instructions is not null
        and btrim(delivery_instructions) ~ '^[+()0-9 .-]{8,20}$'
      then btrim(delivery_instructions)
      else null
    end
  ),
  source_channel = coalesce(nullif(btrim(source_channel), ''), 'storefront_web')
where
  phone is null
  or btrim(coalesce(phone, '')) = ''
  or source_channel is null
  or btrim(coalesce(source_channel, '')) = '';

update public.storefront_orders
set phone_normalized = nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
where
  phone is not null
  and (
    phone_normalized is null
    or btrim(phone_normalized) = ''
  );

update public.storefront_order_items
set availability_code = 'immediate'
where availability_code in ('in_stock', 'available_now');

with ranked_matches as (
  select
    orders.id as order_id,
    customers.id as customer_id,
    customers.manychat_id,
    customers.whatsapp_wa_id,
    customers.whatsapp_phone,
    row_number() over (
      partition by orders.id
      order by
        case
          when regexp_replace(coalesce(customers.whatsapp_wa_id, ''), '\D', '', 'g') = orders.phone_normalized then 1
          when regexp_replace(coalesce(customers.manychat_id, ''), '\D', '', 'g') = orders.phone_normalized then 2
          when regexp_replace(coalesce(customers.whatsapp_phone, ''), '\D', '', 'g') = orders.phone_normalized then 3
          when regexp_replace(coalesce(customers.phone, ''), '\D', '', 'g') = orders.phone_normalized then 4
          when regexp_replace(coalesce(customers.whatsapp_wa_id, ''), '\D', '', 'g') like '%' || orders.phone_normalized then 5
          when regexp_replace(coalesce(customers.manychat_id, ''), '\D', '', 'g') like '%' || orders.phone_normalized then 6
          when regexp_replace(coalesce(customers.whatsapp_phone, ''), '\D', '', 'g') like '%' || orders.phone_normalized then 7
          when regexp_replace(coalesce(customers.phone, ''), '\D', '', 'g') like '%' || orders.phone_normalized then 8
          else 99
        end,
        customers.id desc
    ) as rn
  from public.storefront_orders orders
  join public.customers customers
    on orders.phone_normalized is not null
   and orders.phone_normalized <> ''
   and (
     regexp_replace(coalesce(customers.whatsapp_wa_id, ''), '\D', '', 'g') = orders.phone_normalized
     or regexp_replace(coalesce(customers.manychat_id, ''), '\D', '', 'g') = orders.phone_normalized
     or regexp_replace(coalesce(customers.whatsapp_phone, ''), '\D', '', 'g') = orders.phone_normalized
     or regexp_replace(coalesce(customers.phone, ''), '\D', '', 'g') = orders.phone_normalized
     or regexp_replace(coalesce(customers.whatsapp_wa_id, ''), '\D', '', 'g') like '%' || orders.phone_normalized
     or regexp_replace(coalesce(customers.manychat_id, ''), '\D', '', 'g') like '%' || orders.phone_normalized
     or regexp_replace(coalesce(customers.whatsapp_phone, ''), '\D', '', 'g') like '%' || orders.phone_normalized
     or regexp_replace(coalesce(customers.phone, ''), '\D', '', 'g') like '%' || orders.phone_normalized
   )
  where
    orders.phone_normalized is not null
    and (
      orders.customer_id is null
      or orders.manychat_id is null
      or orders.whatsapp_wa_id is null
      or orders.whatsapp_phone is null
    )
),
best_matches as (
  select
    order_id,
    customer_id,
    manychat_id,
    whatsapp_wa_id,
    whatsapp_phone
  from ranked_matches
  where rn = 1
)
update public.storefront_orders as orders
set
  customer_id = best_matches.customer_id,
  manychat_id = coalesce(orders.manychat_id, best_matches.manychat_id),
  whatsapp_wa_id = coalesce(orders.whatsapp_wa_id, best_matches.whatsapp_wa_id),
  whatsapp_phone = coalesce(orders.whatsapp_phone, best_matches.whatsapp_phone)
from best_matches
where best_matches.order_id = orders.id;

create index if not exists idx_storefront_orders_phone_normalized
  on public.storefront_orders (phone_normalized);

create index if not exists idx_storefront_orders_customer_id
  on public.storefront_orders (customer_id);

create index if not exists idx_storefront_orders_manychat_id
  on public.storefront_orders (manychat_id);

create index if not exists idx_storefront_orders_whatsapp_wa_id
  on public.storefront_orders (whatsapp_wa_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'storefront_orders_customer_id_fkey'
      and conrelid = 'public.storefront_orders'::regclass
  ) then
    alter table public.storefront_orders
      add constraint storefront_orders_customer_id_fkey
      foreign key (customer_id)
      references public.customers (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'storefront_orders_phone_normalized_check'
      and conrelid = 'public.storefront_orders'::regclass
  ) then
    alter table public.storefront_orders
      add constraint storefront_orders_phone_normalized_check
      check (
        phone_normalized is null
        or phone_normalized ~ '^[0-9]{8,15}$'
      );
  end if;
end $$;

commit;
