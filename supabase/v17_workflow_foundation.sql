begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.v17_normalize_text(p_input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      lower(coalesce(extensions.unaccent(coalesce(p_input, '')), '')),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.v17_compose_search_text(
  p_product_key text,
  p_product_name text,
  p_category text,
  p_color text,
  p_condition text,
  p_network text,
  p_storage_gb integer
)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      coalesce(p_product_key, '')
      || ' ' || coalesce(p_product_name, '')
      || ' ' || coalesce(p_category, '')
      || ' ' || coalesce(p_color, '')
      || ' ' || coalesce(p_condition, '')
      || ' ' || coalesce(p_network, '')
      || ' ' || coalesce(p_storage_gb::text, ''),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.v17_focus_query_text(p_input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        public.v17_normalize_text(p_input),
        '(^| )(hola|buenas|buenos|quiero|quisiera|necesito|busco|precio|valor|costo|cotizacion|cotizar|info|informacion|cuanto|sale|tenes|tienen|hay|del|de|el|la|los|las|un|una|me|por|favor|sobre)( |$)',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.v17_brand_key(p_input text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when public.v17_normalize_text(p_input) ~ '(^| )(apple|iphone|ipad|macbook)( |$)' then 'apple'
    when public.v17_normalize_text(p_input) ~ '(^| )(samsung|galaxy)( |$)' then 'samsung'
    when public.v17_normalize_text(p_input) ~ '(^| )(motorola|moto)( |$)' then 'motorola'
    when public.v17_normalize_text(p_input) ~ '(^| )(xiaomi)( |$)' then 'xiaomi'
    when public.v17_normalize_text(p_input) ~ '(^| )(redmi)( |$)' then 'redmi'
    when public.v17_normalize_text(p_input) ~ '(^| )(poco)( |$)' then 'poco'
    when public.v17_normalize_text(p_input) ~ '(^| )(realme)( |$)' then 'realme'
    when public.v17_normalize_text(p_input) ~ '(^| )(google|pixel)( |$)' then 'google'
    when public.v17_normalize_text(p_input) ~ '(^| )(huawei)( |$)' then 'huawei'
    when public.v17_normalize_text(p_input) ~ '(^| )(oneplus)( |$)' then 'oneplus'
    else null
  end;
$$;

create or replace function public.v17_extract_brand_keys(p_input text)
returns text[]
language sql
immutable
parallel safe
as $$
  select array_remove(
    array[
      case when public.v17_normalize_text(p_input) ~ '(^| )(apple|iphone|ipad|macbook)( |$)' then 'apple' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(samsung|galaxy)( |$)' then 'samsung' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(motorola|moto)( |$)' then 'motorola' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(xiaomi)( |$)' then 'xiaomi' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(redmi)( |$)' then 'redmi' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(poco)( |$)' then 'poco' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(realme)( |$)' then 'realme' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(google|pixel)( |$)' then 'google' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(huawei)( |$)' then 'huawei' end,
      case when public.v17_normalize_text(p_input) ~ '(^| )(oneplus)( |$)' then 'oneplus' end
    ],
    null
  );
$$;

create or replace function public.v17_extract_storage_values(p_input text)
returns integer[]
language sql
immutable
parallel safe
as $$
  with matches as (
    select (regexp_matches(public.v17_normalize_text(p_input), '([0-9]{2,4}) ?gb', 'g'))[1]::integer as storage_gb
  )
  select coalesce(array_agg(distinct storage_gb order by storage_gb), '{}'::integer[])
  from matches;
$$;

create or replace function public.v17_extract_numeric_tokens(p_input text)
returns integer[]
language sql
immutable
parallel safe
as $$
  with matches as (
    select (regexp_matches(public.v17_normalize_text(p_input), '(^| )([0-9]{1,4})( |$)', 'g'))[2]::integer as numeric_token
  )
  select coalesce(array_agg(distinct numeric_token order by numeric_token), '{}'::integer[])
  from matches;
$$;

create or replace function public.v17_extract_condition_key(p_input text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when public.v17_normalize_text(p_input) ~ '(^| )(usado|usada|used|seminuevo|semi nuevo|semi nueva|segunda mano)( |$)' then 'used'
    when public.v17_normalize_text(p_input) ~ '(^| )(nuevo|nueva|new|sellado|sealed)( |$)' then 'new'
    else null
  end;
$$;

create or replace function public.v17_extract_model_family_number(p_input text)
returns integer
language sql
immutable
parallel safe
as $$
  with normalized as (
    select public.v17_normalize_text(p_input) as query_norm
  ),
  preferred_match as (
    select (regexp_matches(query_norm, '(iphone|galaxy|redmi|note|poco|moto|motorola|pixel|xiaomi)[ ]+([0-9]{1,3})', 'i'))[2]::integer as family_number
    from normalized
  ),
  fallback_match as (
    select (regexp_matches(query_norm, '(^| )([0-9]{1,3})( |$)', 'g'))[2]::integer as family_number
    from normalized
    limit 1
  )
  select coalesce(
    (select family_number from preferred_match limit 1),
    (select family_number from fallback_match limit 1)
  );
$$;

create index if not exists idx_products_v17_product_key
  on public.products (product_key);

create index if not exists idx_products_v17_search_document_trgm
  on public.products
  using gin (
    public.v17_normalize_text(
      public.v17_compose_search_text(
        product_key,
        product_name,
        category,
        color,
        condition,
        network,
        storage_gb
      )
    ) gin_trgm_ops
  );

create or replace view public.v17_product_search as
select
  catalog.id,
  catalog.product_key,
  catalog.product_name,
  catalog.category,
  catalog.price_ars,
  catalog.promo_price_ars,
  catalog.price_usd,
  catalog.bancarizada_total,
  catalog.bancarizada_cuota,
  catalog.macro_total,
  catalog.macro_cuota,
  catalog.cuotas_qty,
  catalog.in_stock,
  catalog.delivery_type,
  catalog.delivery_days,
  catalog.ram_gb,
  catalog.storage_gb,
  catalog.color,
  catalog.network,
  catalog.image_url,
  catalog.battery_health,
  catalog.condition,
  public.v17_brand_key(
    coalesce(catalog.product_key, '')
    || ' ' || coalesce(catalog.product_name, '')
    || ' ' || coalesce(catalog.category, '')
  ) as brand_key,
  public.v17_normalize_text(
    public.v17_compose_search_text(
      catalog.product_key,
      catalog.product_name,
      catalog.category,
      catalog.color,
      catalog.condition,
      catalog.network,
      catalog.storage_gb
    )
  ) as search_document,
  case
    when public.v17_normalize_text(catalog.condition) in ('nuevo', 'new', 'sealed') then 'new'
    when public.v17_normalize_text(catalog.condition) in (
      'usado',
      'used',
      'semi nuevo',
      'seminuevo',
      'semi nueva',
      'like new',
      'like_new',
      'refurbished',
      'reacondicionado'
    ) then 'used'
    when catalog.condition is null then null
    else public.v17_normalize_text(catalog.condition)
  end as condition_key,
  case
    when catalog.in_stock is true then 'in_stock'
    when catalog.delivery_days is not null then 'orderable'
    else 'unavailable'
  end as availability_code,
  case
    when catalog.in_stock is true then 3
    when catalog.delivery_days is not null then 2
    else 1
  end as availability_rank
from public.v_product_catalog as catalog;

create or replace function public.v17_find_candidate_products(
  p_query text,
  p_interested_product text default null,
  p_preferred_brand text default null,
  p_limit integer default 8
)
returns table (
  product_id integer,
  product_key text,
  product_name text,
  category text,
  brand_key text,
  condition text,
  storage_gb integer,
  color text,
  in_stock boolean,
  availability_code text,
  availability_rank integer,
  delivery_days integer,
  price_ars numeric,
  promo_price_ars numeric,
  price_usd numeric,
  image_url text,
  score double precision
)
language sql
stable
as $$
  with search_input as (
    select
      public.v17_normalize_text(concat_ws(' ', p_query, p_interested_product)) as query_norm,
      public.v17_focus_query_text(concat_ws(' ', p_query, p_interested_product)) as query_focus,
      public.v17_extract_brand_keys(concat_ws(' ', p_query, p_interested_product, p_preferred_brand)) as requested_brand_keys,
      public.v17_extract_storage_values(concat_ws(' ', p_query, p_interested_product)) as requested_storage_values,
      public.v17_extract_numeric_tokens(concat_ws(' ', p_query, p_interested_product)) as requested_numeric_tokens,
      public.v17_extract_condition_key(concat_ws(' ', p_query, p_interested_product)) as requested_condition_key,
      public.v17_extract_model_family_number(concat_ws(' ', p_query, p_interested_product)) as requested_family_number,
      public.v17_brand_key(p_preferred_brand) as preferred_brand_key,
      greatest(1, least(coalesce(p_limit, 8), 20)) as result_limit
  ),
  scored as (
    select
      product.id as product_id,
      product.product_key,
      product.product_name,
      product.category,
      product.brand_key,
      product.condition,
      product.storage_gb,
      product.color,
      product.in_stock,
      product.availability_code,
      product.availability_rank,
      product.delivery_days,
      product.price_ars,
      product.promo_price_ars,
      product.price_usd,
      product.image_url,
      (
        similarity(
          product.search_document,
          coalesce(nullif(input.query_focus, ''), input.query_norm)
        ) * 0.56
        + case
            when input.query_focus <> ''
             and product.search_document like '%' || input.query_focus || '%'
            then 0.24
            when input.query_norm <> ''
             and product.search_document like '%' || input.query_norm || '%'
            then 0.12
            else 0
          end
        + case
            when input.preferred_brand_key is not null
             and product.brand_key = input.preferred_brand_key
            then 0.08
            else 0
          end
        + case
            when array_length(input.requested_brand_keys, 1) is not null
             and product.brand_key = any(input.requested_brand_keys)
            then 0.10
            else 0
          end
        + case
            when array_length(input.requested_storage_values, 1) is not null
             and product.storage_gb = any(input.requested_storage_values)
            then 0.08
            else 0
          end
        + case
            when input.requested_condition_key is null then 0
            when product.condition_key = input.requested_condition_key then 0.14
            when input.requested_condition_key = 'used'
             and product.condition_key is null then -0.08
            when input.requested_condition_key = 'new'
             and product.condition_key = 'used' then -0.18
            else -0.10
          end
        + case
            when input.requested_family_number is null then 0
            when product.search_document ~ ('(^| )' || input.requested_family_number::text || '( |$)') then 0.24
            when product.brand_key = 'apple'
             and input.requested_family_number between 11 and 20 then -0.26
            when product.brand_key = any(array['samsung', 'xiaomi', 'redmi', 'motorola', 'google', 'huawei', 'oneplus'])
             and input.requested_family_number between 1 and 30 then -0.20
            else -0.10
          end
        + case
            when array_length(input.requested_numeric_tokens, 1) is null then 0
            when not exists (
              select 1
              from unnest(input.requested_numeric_tokens) as token
              where product.search_document !~ ('(^| )' || token::text || '( |$)')
            ) then 0.18
            when exists (
              select 1
              from unnest(input.requested_numeric_tokens) as token
              where product.search_document ~ ('(^| )' || token::text || '( |$)')
            ) then 0.04
            else -0.14
          end
        + case
            when product.availability_code = 'in_stock' then 0.06
            when product.availability_code = 'orderable' then 0.03
            else 0
          end
      )::double precision as score
    from public.v17_product_search as product
    cross join search_input as input
    where input.query_norm <> ''
      and (
        array_length(input.requested_brand_keys, 1) is null
        or product.brand_key = any(input.requested_brand_keys)
      )
      and (
        similarity(
          product.search_document,
          coalesce(nullif(input.query_focus, ''), input.query_norm)
        ) >= 0.08
        or (
          input.query_focus <> ''
          and product.search_document like '%' || input.query_focus || '%'
        )
        or product.search_document like '%' || input.query_norm || '%'
        or (
          array_length(input.requested_brand_keys, 1) is not null
          and product.brand_key = any(input.requested_brand_keys)
        )
      )
  )
  select
    scored.product_id,
    scored.product_key,
    scored.product_name,
    scored.category,
    scored.brand_key,
    scored.condition,
    scored.storage_gb,
    scored.color,
    scored.in_stock,
    scored.availability_code,
    scored.availability_rank,
    scored.delivery_days,
    scored.price_ars,
    scored.promo_price_ars,
    scored.price_usd,
    scored.image_url,
    scored.score
  from scored
  order by
    scored.score desc,
    scored.availability_rank desc,
    scored.promo_price_ars nulls last,
    scored.price_ars nulls last,
    scored.product_key
  limit (select result_limit from search_input);
$$;

create or replace function public.v17_validate_storefront_handoff(
  p_order_id integer,
  p_token text
)
returns jsonb
language sql
stable
as $$
  with matched_order as (
    select order_row.*
    from public.storefront_orders as order_row
    where order_row.id = p_order_id
      and order_row.whatsapp_handoff_token = p_token
    limit 1
  ),
  item_rows as (
    select
      item.id,
      item.order_id,
      item.sort_order,
      item.product_key,
      item.product_name,
      item.image_url,
      item.unit_price_ars,
      item.quantity,
      item.line_total_ars,
      item.availability_code
    from public.storefront_order_items as item
    where item.order_id = p_order_id
    order by item.sort_order, item.id
  )
  select
    case
      when p_order_id is null or p_token is null or btrim(p_token) = '' then
        jsonb_build_object(
          'ok', false,
          'reason', 'missing_handoff_credentials',
          'order', null
        )
      when not exists (select 1 from matched_order) then
        jsonb_build_object(
          'ok', false,
          'reason', 'order_not_found_or_token_invalid',
          'order', null
        )
      when (select status from matched_order) in ('completed', 'cancelled') then
        jsonb_build_object(
          'ok', false,
          'reason', 'order_not_active_for_whatsapp',
          'order', null
        )
      else
        jsonb_build_object(
          'ok', true,
          'reason', null,
          'order', (
            select jsonb_build_object(
              'id', order_row.id,
              'status', order_row.status,
              'created_at', order_row.created_at,
              'first_name', order_row.first_name,
              'last_name', order_row.last_name,
              'email', order_row.email,
              'phone', order_row.phone,
              'city', order_row.city,
              'province', order_row.province,
              'address', order_row.address,
              'payment_method', order_row.payment_method,
              'currency', order_row.currency,
              'subtotal', order_row.subtotal,
              'item_count', order_row.item_count,
              'transfer_aliases', to_jsonb(coalesce(order_row.transfer_aliases, '{}'::text[])),
              'payment_proof_urls', to_jsonb(coalesce(order_row.payment_proof_urls, '{}'::text[])),
              'items', coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', item_rows.id,
                      'product_key', item_rows.product_key,
                      'product_name', item_rows.product_name,
                      'image_url', item_rows.image_url,
                      'unit_price_ars', item_rows.unit_price_ars,
                      'quantity', item_rows.quantity,
                      'line_total_ars', item_rows.line_total_ars,
                      'availability_code', item_rows.availability_code
                    )
                    order by item_rows.sort_order, item_rows.id
                  )
                  from item_rows
                ),
                '[]'::jsonb
              )
            )
            from matched_order as order_row
          )
        )
    end;
$$;

create or replace function public.v17_build_turn_context(
  p_manychat_id text,
  p_user_message text,
  p_recent_limit integer default 6,
  p_candidate_limit integer default 8,
  p_storefront_order_id integer default null,
  p_storefront_order_token text default null
)
returns jsonb
language sql
stable
as $$
  with customer_row as (
    select customer_context.*
    from public.v_customer_context as customer_context
    where customer_context.manychat_id = p_manychat_id
    limit 1
  ),
  store_row as (
    select store_context.*
    from public.v_store_context as store_context
    limit 1
  ),
  store_website_row as (
    select nullif(btrim(setting.value), '') as store_website_url
    from public.store_settings as setting
    where setting.key = 'store_website_url'
    limit 1
  ),
  history_rows as (
    select
      history.role,
      history.message,
      history.created_at,
      history.intent_detected
    from public.v_recent_conversations as history
    where history.manychat_id = p_manychat_id
    order by history.created_at desc nulls last, history.id desc
    limit greatest(1, least(coalesce(p_recent_limit, 6), 8))
  ),
  candidate_rows as (
    select candidate.*
    from public.v17_find_candidate_products(
      p_query => p_user_message,
      p_interested_product => (select interested_product from customer_row),
      p_preferred_brand => (select preferred_brand from customer_row),
      p_limit => greatest(1, least(coalesce(p_candidate_limit, 8), 8))
    ) as candidate
  ),
  storefront_handoff as (
    select case
      when p_storefront_order_id is null and (p_storefront_order_token is null or btrim(p_storefront_order_token) = '') then null::jsonb
      else public.v17_validate_storefront_handoff(p_storefront_order_id, p_storefront_order_token)
    end as payload
  )
  select jsonb_build_object(
    'context_version', 'v17',
    'generated_at', to_jsonb(now()),
    'manychat_id', p_manychat_id,
    'user_message', p_user_message,
    'customer', coalesce(
      (
        select jsonb_build_object(
          'customer_id', customer_row.id,
          'first_name', customer_row.first_name,
          'preferred_brand', customer_row.preferred_brand,
          'preferred_budget', customer_row.preferred_budget,
          'interested_product', customer_row.interested_product,
          'funnel_stage', customer_row.funnel_stage,
          'last_intent', customer_row.last_intent,
          'lead_score', customer_row.lead_score,
          'human_assigned', customer_row.human_assigned,
          'tags', to_jsonb(coalesce(customer_row.tags, '{}'::text[])),
          'brands_mentioned', to_jsonb(coalesce(customer_row.brands_mentioned, '{}'::text[])),
          'topics_mentioned', to_jsonb(coalesce(customer_row.topics_mentioned, '{}'::text[]))
        )
        from customer_row
      ),
      jsonb_build_object(
        'customer_id', null,
        'first_name', null,
        'preferred_brand', null,
        'preferred_budget', null,
        'interested_product', null,
        'funnel_stage', null,
        'last_intent', null,
        'lead_score', null,
        'human_assigned', null,
        'tags', '[]'::jsonb,
        'brands_mentioned', '[]'::jsonb,
        'topics_mentioned', '[]'::jsonb
      )
    ),
    'store', coalesce(
      (
        select jsonb_build_object(
          'store_website_url', coalesce((select store_website_url from store_website_row), 'https://puntotechno.com'),
          'store_location_name', store_row.store_location_name,
          'store_address', store_row.store_address,
          'store_hours', store_row.store_hours,
          'store_payment_methods', store_row.store_payment_methods,
          'store_shipping_policy', store_row.store_shipping_policy,
          'store_warranty_new', store_row.store_warranty_new,
          'store_warranty_used', store_row.store_warranty_used
        )
        from store_row
      ),
      jsonb_build_object(
        'store_website_url', 'https://puntotechno.com',
        'store_location_name', null,
        'store_address', null,
        'store_hours', null,
        'store_payment_methods', null,
        'store_shipping_policy', null,
        'store_warranty_new', null,
        'store_warranty_used', null
      )
    ),
    'recent_messages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'role', history_rows.role,
            'message', history_rows.message,
            'created_at', history_rows.created_at,
            'intent_detected', history_rows.intent_detected
          )
          order by history_rows.created_at desc nulls last
        )
        from history_rows
      ),
      '[]'::jsonb
    ),
    'candidate_products', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_key', candidate_rows.product_key,
            'product_name', candidate_rows.product_name,
            'category', candidate_rows.category,
            'brand_key', candidate_rows.brand_key,
            'condition', candidate_rows.condition,
            'storage_gb', candidate_rows.storage_gb,
            'color', candidate_rows.color,
            'in_stock', candidate_rows.in_stock,
            'availability_code', candidate_rows.availability_code,
            'delivery_days', candidate_rows.delivery_days,
            'price_ars', candidate_rows.price_ars,
            'promo_price_ars', candidate_rows.promo_price_ars,
            'price_usd', candidate_rows.price_usd,
            'image_url', candidate_rows.image_url,
            'score', candidate_rows.score
          )
          order by candidate_rows.score desc, candidate_rows.availability_rank desc
        )
        from candidate_rows
      ),
      '[]'::jsonb
    ),
    'storefront_handoff', (select payload from storefront_handoff)
  );
$$;

create table if not exists public.ai_workflow_turns (
  id bigserial primary key,
  workflow_version text not null,
  provider_name text not null,
  model_name text not null,
  manychat_id text not null,
  customer_id integer references public.customers(id) on delete set null,
  route_key text not null check (
    route_key in (
      'storefront_order',
      'exact_product_quote',
      'brand_catalog',
      'generic_sales',
      'store_info'
    )
  ),
  user_message text not null,
  context_payload jsonb not null default '{}'::jsonb,
  router_payload jsonb not null default '{}'::jsonb,
  responder_payload jsonb not null default '{}'::jsonb,
  validator_payload jsonb not null default '{}'::jsonb,
  state_delta jsonb not null default '{}'::jsonb,
  selected_product_keys text[] not null default '{}'::text[],
  validation_errors text[] not null default '{}'::text[],
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  success boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_workflow_turns_manychat_created
  on public.ai_workflow_turns (manychat_id, created_at desc);

create index if not exists idx_ai_workflow_turns_route_created
  on public.ai_workflow_turns (route_key, created_at desc);

create index if not exists idx_ai_workflow_turns_success_created
  on public.ai_workflow_turns (success, created_at desc);

create or replace function public.v17_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_workflow_turns_updated_at on public.ai_workflow_turns;

create trigger trg_ai_workflow_turns_updated_at
before update on public.ai_workflow_turns
for each row
execute function public.v17_touch_updated_at();

create or replace view public.v_ai_workflow_turn_daily as
select
  date_trunc('day', created_at)::date as turn_day,
  workflow_version,
  provider_name,
  model_name,
  route_key,
  count(*) as total_turns,
  count(*) filter (where success) as successful_turns,
  count(*) filter (where not success) as failed_turns,
  avg(latency_ms)::numeric(12, 2) as avg_latency_ms,
  avg(estimated_cost_usd)::numeric(12, 6) as avg_cost_usd,
  sum(estimated_cost_usd)::numeric(12, 6) as total_cost_usd
from public.ai_workflow_turns
group by
  date_trunc('day', created_at)::date,
  workflow_version,
  provider_name,
  model_name,
  route_key;

commit;
