BEGIN;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS address text NULL;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS zip_code text NULL;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS city text NULL;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS province text NULL;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS delivery_instructions text NULL;

COMMIT;
