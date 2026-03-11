-- Relax storefront_orders email constraint to allow more valid email formats
-- (accents, plus signs, etc. in local part; longer TLDs)
-- Run this if checkout fails with "email inválido" for valid addresses

ALTER TABLE public.storefront_orders
  DROP CONSTRAINT IF EXISTS storefront_orders_email_check;

ALTER TABLE public.storefront_orders
  ADD CONSTRAINT storefront_orders_email_check
  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');
