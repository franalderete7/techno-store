-- ============================================================
-- STOCK UNITS SALE DATE FIX
-- Run in Supabase SQL Editor on the existing database
-- ============================================================

BEGIN;

ALTER TABLE public.stock_units
  ADD COLUMN IF NOT EXISTS date_sold date,
  ADD COLUMN IF NOT EXISTS price_sold numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_stock_units_date_sold
  ON public.stock_units (date_sold DESC);

CREATE OR REPLACE FUNCTION public.sync_stock_unit_sale_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.date_sold IS NULL AND OLD.date_sold IS NOT NULL THEN
    NEW.date_sold := OLD.date_sold;
  END IF;

  IF NEW.status = 'sold' AND NEW.date_sold IS NULL THEN
    NEW.date_sold := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_units_sale_fields ON public.stock_units;

CREATE TRIGGER trg_stock_units_sale_fields
  BEFORE INSERT OR UPDATE OF status, date_sold ON public.stock_units
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_stock_unit_sale_fields();

UPDATE public.stock_units su
SET date_sold = COALESCE(su.date_sold, su.updated_at::date, su.created_at::date)
WHERE su.status = 'sold'
  AND su.date_sold IS NULL;

UPDATE public.stock_units su
SET price_sold = si.unit_price
FROM public.sale_items si
WHERE si.stock_unit_id = su.id
  AND si.unit_price IS NOT NULL
  AND su.price_sold IS NULL;

COMMIT;
