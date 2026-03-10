BEGIN;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tiendanube_product_id text,
ADD COLUMN IF NOT EXISTS tiendanube_handle text,
ADD COLUMN IF NOT EXISTS tiendanube_brand text,
ADD COLUMN IF NOT EXISTS tiendanube_published boolean,
ADD COLUMN IF NOT EXISTS tiendanube_free_shipping boolean,
ADD COLUMN IF NOT EXISTS tiendanube_requires_shipping boolean,
ADD COLUMN IF NOT EXISTS tiendanube_has_stock boolean,
ADD COLUMN IF NOT EXISTS tiendanube_price_min numeric(12, 2),
ADD COLUMN IF NOT EXISTS tiendanube_price_max numeric(12, 2),
ADD COLUMN IF NOT EXISTS tiendanube_promotional_price_min numeric(12, 2),
ADD COLUMN IF NOT EXISTS tiendanube_description text,
ADD COLUMN IF NOT EXISTS tiendanube_seo_title text,
ADD COLUMN IF NOT EXISTS tiendanube_seo_description text,
ADD COLUMN IF NOT EXISTS tiendanube_tags text,
ADD COLUMN IF NOT EXISTS tiendanube_canonical_url text,
ADD COLUMN IF NOT EXISTS tiendanube_video_url text,
ADD COLUMN IF NOT EXISTS tiendanube_image_urls text[],
ADD COLUMN IF NOT EXISTS tiendanube_attributes_json jsonb,
ADD COLUMN IF NOT EXISTS tiendanube_categories_json jsonb,
ADD COLUMN IF NOT EXISTS tiendanube_variants_json jsonb,
ADD COLUMN IF NOT EXISTS tiendanube_raw_json jsonb,
ADD COLUMN IF NOT EXISTS tiendanube_synced_at timestamp with time zone;

COMMENT ON COLUMN public.products.tiendanube_product_id IS
'Linked Tienda Nube product id for catalog sync.';
COMMENT ON COLUMN public.products.tiendanube_handle IS
'Localized Tienda Nube handle used as external catalog key.';
COMMENT ON COLUMN public.products.tiendanube_raw_json IS
'Last raw Tienda Nube payload stored for audit/debug and future sync enrichment.';
COMMENT ON COLUMN public.products.tiendanube_synced_at IS
'Timestamp of the last Tienda Nube sync into this local product row.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tiendanube_product_id
ON public.products (tiendanube_product_id)
WHERE tiendanube_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_tiendanube_handle
ON public.products (tiendanube_handle);

INSERT INTO public.store_settings (key, value, description)
VALUES
  ('pricing_default_logistics_usd', '10', 'Default logistics USD added when deriving product pricing from cost.'),
  ('pricing_default_usd_rate', '1460', 'Default USD to ARS rate used for derived prices.'),
  ('pricing_default_cuotas_qty', '6', 'Default cuotas quantity used for financing calculations.'),
  ('pricing_bancarizada_interest', '0.50', 'Default bancarizada financing interest multiplier.'),
  ('pricing_macro_interest', '0.35', 'Default Macro financing interest multiplier.'),
  ('pricing_margin_band_1_max_cost_usd', '200', 'Maximum cost USD for margin band 1.'),
  ('pricing_margin_band_1_margin_pct', '0.30', 'Margin pct for cost band 1.'),
  ('pricing_margin_band_2_max_cost_usd', '400', 'Maximum cost USD for margin band 2.'),
  ('pricing_margin_band_2_margin_pct', '0.25', 'Margin pct for cost band 2.'),
  ('pricing_margin_band_3_max_cost_usd', '800', 'Maximum cost USD for margin band 3.'),
  ('pricing_margin_band_3_margin_pct', '0.20', 'Margin pct for cost band 3.'),
  ('pricing_margin_band_4_max_cost_usd', '999999', 'Maximum cost USD for margin band 4.'),
  ('pricing_margin_band_4_margin_pct', '0.15', 'Margin pct for cost band 4.'),
  ('tiendanube_sync_price_currency', 'USD', 'Currency assumed for Tienda Nube price_min/price_max when creating missing local products. Valid values: USD or ARS.')
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

COMMIT;
