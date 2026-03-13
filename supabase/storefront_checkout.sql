BEGIN;

CREATE TABLE IF NOT EXISTS public.storefront_orders (
  id bigserial PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  address text NULL,
  zip_code text NULL,
  city text NULL,
  province text NULL,
  delivery_instructions text NULL,
  payment_method text NOT NULL DEFAULT 'transferencia',
  currency text NOT NULL DEFAULT 'ARS',
  subtotal numeric(12,2) NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  transfer_aliases text[] NOT NULL DEFAULT ARRAY['technostore.celu', 'tucelualmejorprecio'],
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_orders_email_check
    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  CONSTRAINT storefront_orders_payment_method_check
    CHECK (payment_method = 'transferencia')
);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_created_at
  ON public.storefront_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_email
  ON public.storefront_orders (email);

COMMIT;
