begin;

alter table public.storefront_orders
  add column if not exists status text,
  add column if not exists whatsapp_handoff_token text,
  add column if not exists whatsapp_handoff_started_at timestamptz;

alter table public.storefront_orders
  alter column status set default 'pending_whatsapp';

update public.storefront_orders
set status = coalesce(nullif(btrim(status), ''), 'pending_whatsapp')
where status is null or btrim(status) = '';

update public.storefront_orders
set whatsapp_handoff_token = substring(
  md5(coalesce(created_at::text, clock_timestamp()::text) || '-' || id::text || '-' || random()::text),
  1,
  18
)
where whatsapp_handoff_token is null or btrim(whatsapp_handoff_token) = '';

create unique index if not exists idx_storefront_orders_whatsapp_handoff_token
  on public.storefront_orders (whatsapp_handoff_token)
  where whatsapp_handoff_token is not null;

create index if not exists idx_storefront_orders_status
  on public.storefront_orders (status);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'storefront_orders_status_check'
      and conrelid = 'public.storefront_orders'::regclass
  ) then
    alter table public.storefront_orders
      add constraint storefront_orders_status_check
      check (
        status is null
        or status in (
          'pending_whatsapp',
          'whatsapp_started',
          'awaiting_payment_proof',
          'payment_under_review',
          'ready_for_dispatch',
          'completed',
          'cancelled'
        )
      );
  end if;
end $$;

commit;
