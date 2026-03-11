BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.products_tiendanube_snapshot (
  product_id integer PRIMARY KEY,
  product_key text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  tiendanube_product_id text,
  tiendanube_primary_variant_id text,
  tiendanube_handle text,
  tiendanube_brand text,
  tiendanube_published boolean,
  tiendanube_free_shipping boolean,
  tiendanube_requires_shipping boolean,
  tiendanube_has_stock boolean,
  tiendanube_price_min numeric,
  tiendanube_price_max numeric,
  tiendanube_promotional_price_min numeric,
  tiendanube_description text,
  tiendanube_seo_title text,
  tiendanube_seo_description text,
  tiendanube_tags text,
  tiendanube_canonical_url text,
  tiendanube_video_url text,
  tiendanube_image_urls text[],
  tiendanube_attributes_json jsonb,
  tiendanube_categories_json jsonb,
  tiendanube_variants_json jsonb,
  tiendanube_raw_json jsonb,
  tiendanube_synced_at timestamptz,
  tiendanube_last_pushed_at timestamptz,
  tiendanube_sync_status text,
  tiendanube_sync_error text
);

INSERT INTO archive.products_tiendanube_snapshot (
  product_id,
  product_key,
  archived_at,
  tiendanube_product_id,
  tiendanube_primary_variant_id,
  tiendanube_handle,
  tiendanube_brand,
  tiendanube_published,
  tiendanube_free_shipping,
  tiendanube_requires_shipping,
  tiendanube_has_stock,
  tiendanube_price_min,
  tiendanube_price_max,
  tiendanube_promotional_price_min,
  tiendanube_description,
  tiendanube_seo_title,
  tiendanube_seo_description,
  tiendanube_tags,
  tiendanube_canonical_url,
  tiendanube_video_url,
  tiendanube_image_urls,
  tiendanube_attributes_json,
  tiendanube_categories_json,
  tiendanube_variants_json,
  tiendanube_raw_json,
  tiendanube_synced_at,
  tiendanube_last_pushed_at,
  tiendanube_sync_status,
  tiendanube_sync_error
)
SELECT
  p.id,
  p.product_key,
  now(),
  p.tiendanube_product_id,
  p.tiendanube_primary_variant_id,
  p.tiendanube_handle,
  p.tiendanube_brand,
  p.tiendanube_published,
  p.tiendanube_free_shipping,
  p.tiendanube_requires_shipping,
  p.tiendanube_has_stock,
  p.tiendanube_price_min,
  p.tiendanube_price_max,
  p.tiendanube_promotional_price_min,
  p.tiendanube_description,
  p.tiendanube_seo_title,
  p.tiendanube_seo_description,
  p.tiendanube_tags,
  p.tiendanube_canonical_url,
  p.tiendanube_video_url,
  p.tiendanube_image_urls,
  p.tiendanube_attributes_json::jsonb,
  p.tiendanube_categories_json::jsonb,
  p.tiendanube_variants_json::jsonb,
  p.tiendanube_raw_json::jsonb,
  p.tiendanube_synced_at,
  p.tiendanube_last_pushed_at,
  p.tiendanube_sync_status,
  p.tiendanube_sync_error
FROM public.products p
WHERE
  p.tiendanube_product_id IS NOT NULL OR
  p.tiendanube_primary_variant_id IS NOT NULL OR
  p.tiendanube_handle IS NOT NULL OR
  p.tiendanube_brand IS NOT NULL OR
  p.tiendanube_published IS NOT NULL OR
  p.tiendanube_free_shipping IS NOT NULL OR
  p.tiendanube_requires_shipping IS NOT NULL OR
  p.tiendanube_has_stock IS NOT NULL OR
  p.tiendanube_price_min IS NOT NULL OR
  p.tiendanube_price_max IS NOT NULL OR
  p.tiendanube_promotional_price_min IS NOT NULL OR
  p.tiendanube_description IS NOT NULL OR
  p.tiendanube_seo_title IS NOT NULL OR
  p.tiendanube_seo_description IS NOT NULL OR
  p.tiendanube_tags IS NOT NULL OR
  p.tiendanube_canonical_url IS NOT NULL OR
  p.tiendanube_video_url IS NOT NULL OR
  COALESCE(array_length(p.tiendanube_image_urls, 1), 0) > 0 OR
  p.tiendanube_attributes_json IS NOT NULL OR
  p.tiendanube_categories_json IS NOT NULL OR
  p.tiendanube_variants_json IS NOT NULL OR
  p.tiendanube_raw_json IS NOT NULL OR
  p.tiendanube_synced_at IS NOT NULL OR
  p.tiendanube_last_pushed_at IS NOT NULL OR
  p.tiendanube_sync_status IS NOT NULL OR
  p.tiendanube_sync_error IS NOT NULL
ON CONFLICT (product_id) DO UPDATE
SET
  product_key = EXCLUDED.product_key,
  archived_at = EXCLUDED.archived_at,
  tiendanube_product_id = EXCLUDED.tiendanube_product_id,
  tiendanube_primary_variant_id = EXCLUDED.tiendanube_primary_variant_id,
  tiendanube_handle = EXCLUDED.tiendanube_handle,
  tiendanube_brand = EXCLUDED.tiendanube_brand,
  tiendanube_published = EXCLUDED.tiendanube_published,
  tiendanube_free_shipping = EXCLUDED.tiendanube_free_shipping,
  tiendanube_requires_shipping = EXCLUDED.tiendanube_requires_shipping,
  tiendanube_has_stock = EXCLUDED.tiendanube_has_stock,
  tiendanube_price_min = EXCLUDED.tiendanube_price_min,
  tiendanube_price_max = EXCLUDED.tiendanube_price_max,
  tiendanube_promotional_price_min = EXCLUDED.tiendanube_promotional_price_min,
  tiendanube_description = EXCLUDED.tiendanube_description,
  tiendanube_seo_title = EXCLUDED.tiendanube_seo_title,
  tiendanube_seo_description = EXCLUDED.tiendanube_seo_description,
  tiendanube_tags = EXCLUDED.tiendanube_tags,
  tiendanube_canonical_url = EXCLUDED.tiendanube_canonical_url,
  tiendanube_video_url = EXCLUDED.tiendanube_video_url,
  tiendanube_image_urls = EXCLUDED.tiendanube_image_urls,
  tiendanube_attributes_json = EXCLUDED.tiendanube_attributes_json,
  tiendanube_categories_json = EXCLUDED.tiendanube_categories_json,
  tiendanube_variants_json = EXCLUDED.tiendanube_variants_json,
  tiendanube_raw_json = EXCLUDED.tiendanube_raw_json,
  tiendanube_synced_at = EXCLUDED.tiendanube_synced_at,
  tiendanube_last_pushed_at = EXCLUDED.tiendanube_last_pushed_at,
  tiendanube_sync_status = EXCLUDED.tiendanube_sync_status,
  tiendanube_sync_error = EXCLUDED.tiendanube_sync_error;

UPDATE public.products
SET image_url = tiendanube_image_urls[1]
WHERE
  (image_url IS NULL OR btrim(image_url) = '')
  AND COALESCE(array_length(tiendanube_image_urls, 1), 0) > 0
  AND tiendanube_image_urls[1] IS NOT NULL
  AND btrim(tiendanube_image_urls[1]) <> '';

ALTER TABLE public.products
  DROP COLUMN IF EXISTS tiendanube_product_id,
  DROP COLUMN IF EXISTS tiendanube_primary_variant_id,
  DROP COLUMN IF EXISTS tiendanube_handle,
  DROP COLUMN IF EXISTS tiendanube_brand,
  DROP COLUMN IF EXISTS tiendanube_published,
  DROP COLUMN IF EXISTS tiendanube_free_shipping,
  DROP COLUMN IF EXISTS tiendanube_requires_shipping,
  DROP COLUMN IF EXISTS tiendanube_has_stock,
  DROP COLUMN IF EXISTS tiendanube_price_min,
  DROP COLUMN IF EXISTS tiendanube_price_max,
  DROP COLUMN IF EXISTS tiendanube_promotional_price_min,
  DROP COLUMN IF EXISTS tiendanube_description,
  DROP COLUMN IF EXISTS tiendanube_seo_title,
  DROP COLUMN IF EXISTS tiendanube_seo_description,
  DROP COLUMN IF EXISTS tiendanube_tags,
  DROP COLUMN IF EXISTS tiendanube_canonical_url,
  DROP COLUMN IF EXISTS tiendanube_video_url,
  DROP COLUMN IF EXISTS tiendanube_image_urls,
  DROP COLUMN IF EXISTS tiendanube_attributes_json,
  DROP COLUMN IF EXISTS tiendanube_categories_json,
  DROP COLUMN IF EXISTS tiendanube_variants_json,
  DROP COLUMN IF EXISTS tiendanube_raw_json,
  DROP COLUMN IF EXISTS tiendanube_synced_at,
  DROP COLUMN IF EXISTS tiendanube_last_pushed_at,
  DROP COLUMN IF EXISTS tiendanube_sync_status,
  DROP COLUMN IF EXISTS tiendanube_sync_error;

DELETE FROM public.store_settings
WHERE key IN (
  'tiendanube_base_url',
  'tiendanube_sync_price_currency',
  'tiendanube_image_target_width',
  'tiendanube_image_target_height',
  'tiendanube_image_background'
);

COMMIT;
