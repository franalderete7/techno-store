-- ============================================================
-- Sync product pricing and availability from stock unit costs
-- Run in Supabase SQL Editor after stock_system.sql
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pricing_source_stock_unit_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_pricing_source_stock_unit_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_pricing_source_stock_unit_id_fkey
      FOREIGN KEY (pricing_source_stock_unit_id)
      REFERENCES public.stock_units(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.products.pricing_source_stock_unit_id IS
  'Stock unit whose last saved cost currently drives the automatic product pricing.';

CREATE OR REPLACE FUNCTION public.get_margin_pct_for_cost(p_cost_usd numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_cost_usd IS NULL OR p_cost_usd <= 0 THEN
    RETURN NULL;
  ELSIF p_cost_usd <= 200 THEN
    RETURN 0.30;
  ELSIF p_cost_usd <= 400 THEN
    RETURN 0.25;
  ELSIF p_cost_usd <= 800 THEN
    RETURN 0.20;
  END IF;

  RETURN 0.15;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_stock_cost_to_usd(
  p_cost_unit numeric,
  p_cost_currency text,
  p_usd_rate numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_usd_rate numeric := COALESCE(NULLIF(p_usd_rate, 0), 1460);
BEGIN
  IF p_cost_unit IS NULL OR p_cost_unit <= 0 THEN
    RETURN NULL;
  END IF;

  IF UPPER(COALESCE(p_cost_currency, 'USD')) = 'ARS' THEN
    RETURN ROUND(p_cost_unit / v_usd_rate, 2);
  END IF;

  RETURN ROUND(p_cost_unit, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_in_stock_flag(p_product_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_stock boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.stock_units
    WHERE product_key = p_product_key
      AND status = 'in_stock'
  )
  INTO v_has_stock;

  UPDATE public.products
  SET in_stock = v_has_stock
  WHERE product_key = p_product_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_product_pricing_from_stock_cost(
  p_product_key text,
  p_cost_unit numeric,
  p_cost_currency text,
  p_source_stock_unit_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_cost_usd numeric;
  v_total_cost_usd numeric;
  v_margin_pct numeric;
  v_price_usd numeric;
  v_price_ars numeric;
  v_bancarizada_total numeric;
  v_macro_total numeric;
  v_logistics_usd numeric;
  v_usd_rate numeric;
  v_bancarizada_interest numeric;
  v_macro_interest numeric;
  v_cuotas_qty integer;
  v_has_stock boolean;
BEGIN
  SELECT *
  INTO v_product
  FROM public.products
  WHERE product_key = p_product_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_logistics_usd := COALESCE(v_product.logistics_usd, 10);
  v_usd_rate := COALESCE(NULLIF(v_product.usd_rate, 0), 1460);
  v_bancarizada_interest := COALESCE(v_product.bancarizada_interest, 0.50);
  v_macro_interest := COALESCE(v_product.macro_interest, 0.35);
  v_cuotas_qty := GREATEST(COALESCE(v_product.cuotas_qty, 6), 1);
  v_cost_usd := public.normalize_stock_cost_to_usd(p_cost_unit, p_cost_currency, v_usd_rate);

  IF v_cost_usd IS NULL THEN
    PERFORM public.sync_product_in_stock_flag(p_product_key);
    RETURN;
  END IF;

  v_margin_pct := public.get_margin_pct_for_cost(v_cost_usd);
  v_total_cost_usd := ROUND(v_cost_usd + v_logistics_usd, 2);
  v_price_usd := ROUND(v_total_cost_usd * (1 + v_margin_pct), 2);
  v_price_ars := ROUND(v_price_usd * v_usd_rate);
  v_bancarizada_total := ROUND(v_price_ars * (1 + v_bancarizada_interest));
  v_macro_total := ROUND(v_price_ars * (1 + v_macro_interest));

  SELECT EXISTS (
    SELECT 1
    FROM public.stock_units
    WHERE product_key = p_product_key
      AND status = 'in_stock'
  )
  INTO v_has_stock;

  UPDATE public.products
  SET cost_usd = v_cost_usd,
      total_cost_usd = v_total_cost_usd,
      margin_pct = v_margin_pct,
      price_usd = v_price_usd,
      price_ars = v_price_ars,
      bancarizada_total = v_bancarizada_total,
      bancarizada_cuota = ROUND(v_bancarizada_total / v_cuotas_qty),
      macro_total = v_macro_total,
      macro_cuota = ROUND(v_macro_total / v_cuotas_qty),
      in_stock = v_has_stock,
      pricing_source_stock_unit_id = p_source_stock_unit_id
  WHERE product_key = p_product_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_from_latest_stock_cost(p_product_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_unit public.stock_units%ROWTYPE;
BEGIN
  SELECT *
  INTO v_stock_unit
  FROM public.stock_units
  WHERE product_key = p_product_key
    AND cost_unit IS NOT NULL
    AND cost_unit > 0
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF FOUND THEN
    PERFORM public.apply_product_pricing_from_stock_cost(
      p_product_key,
      v_stock_unit.cost_unit,
      v_stock_unit.cost_currency,
      v_stock_unit.id
    );
    RETURN;
  END IF;

  UPDATE public.products
  SET pricing_source_stock_unit_id = NULL
  WHERE product_key = p_product_key;

  PERFORM public.sync_product_in_stock_flag(p_product_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_from_stock_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_was_source boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT pricing_source_stock_unit_id = OLD.id
    INTO v_old_was_source
    FROM public.products
    WHERE product_key = OLD.product_key;

    v_old_was_source := COALESCE(v_old_was_source, false);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cost_unit IS NOT NULL AND NEW.cost_unit > 0 THEN
      PERFORM public.apply_product_pricing_from_stock_cost(
        NEW.product_key,
        NEW.cost_unit,
        NEW.cost_currency,
        NEW.id
      );
    ELSE
      PERFORM public.sync_product_in_stock_flag(NEW.product_key);
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.product_key IS DISTINCT FROM NEW.product_key THEN
      IF v_old_was_source THEN
        PERFORM public.sync_product_from_latest_stock_cost(OLD.product_key);
      ELSE
        PERFORM public.sync_product_in_stock_flag(OLD.product_key);
      END IF;

      IF NEW.cost_unit IS NOT NULL AND NEW.cost_unit > 0 THEN
        PERFORM public.apply_product_pricing_from_stock_cost(
          NEW.product_key,
          NEW.cost_unit,
          NEW.cost_currency,
          NEW.id
        );
      ELSE
        PERFORM public.sync_product_in_stock_flag(NEW.product_key);
      END IF;

      RETURN NEW;
    END IF;

    IF NEW.cost_unit IS DISTINCT FROM OLD.cost_unit
       OR NEW.cost_currency IS DISTINCT FROM OLD.cost_currency THEN
      IF NEW.cost_unit IS NOT NULL AND NEW.cost_unit > 0 THEN
        PERFORM public.apply_product_pricing_from_stock_cost(
          NEW.product_key,
          NEW.cost_unit,
          NEW.cost_currency,
          NEW.id
        );
      ELSIF v_old_was_source THEN
        PERFORM public.sync_product_from_latest_stock_cost(NEW.product_key);
      ELSE
        PERFORM public.sync_product_in_stock_flag(NEW.product_key);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.sync_product_in_stock_flag(NEW.product_key);
    END IF;

    RETURN NEW;
  END IF;

  IF v_old_was_source THEN
    PERFORM public.sync_product_from_latest_stock_cost(OLD.product_key);
  ELSE
    PERFORM public.sync_product_in_stock_flag(OLD.product_key);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_products_from_stock_units ON public.stock_units;

CREATE TRIGGER trg_sync_products_from_stock_units
AFTER INSERT OR DELETE OR UPDATE OF product_key, cost_unit, cost_currency, status
ON public.stock_units
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_from_stock_unit_change();

DO $$
DECLARE
  v_product record;
BEGIN
  FOR v_product IN
    SELECT product_key
    FROM public.products
  LOOP
    PERFORM public.sync_product_from_latest_stock_cost(v_product.product_key);
  END LOOP;
END;
$$;
