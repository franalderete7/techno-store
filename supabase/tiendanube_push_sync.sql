BEGIN;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tiendanube_primary_variant_id text,
ADD COLUMN IF NOT EXISTS tiendanube_last_pushed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS tiendanube_sync_status text,
ADD COLUMN IF NOT EXISTS tiendanube_sync_error text;

COMMENT ON COLUMN public.products.tiendanube_primary_variant_id IS
'Primary Tienda Nube variant id linked to this local product for price and stock push sync.';

COMMENT ON COLUMN public.products.tiendanube_last_pushed_at IS
'Timestamp of the last successful local product push into Tienda Nube.';

COMMENT ON COLUMN public.products.tiendanube_sync_status IS
'Last Tienda Nube sync status for this local product. Examples: linked, push_ok, push_error.';

COMMENT ON COLUMN public.products.tiendanube_sync_error IS
'Most recent Tienda Nube push/pull error message saved for troubleshooting.';

UPDATE public.products
SET tiendanube_primary_variant_id = COALESCE(
  tiendanube_primary_variant_id,
  (
    SELECT variant_elem->>'id'
    FROM jsonb_array_elements(COALESCE(tiendanube_variants_json, '[]'::jsonb)) AS variant_elem
    WHERE COALESCE(variant_elem->>'sku', '') = public.products.product_key
    LIMIT 1
  ),
  CASE
    WHEN jsonb_typeof(COALESCE(tiendanube_variants_json, '[]'::jsonb)) = 'array'
      AND jsonb_array_length(COALESCE(tiendanube_variants_json, '[]'::jsonb)) = 1
    THEN COALESCE(tiendanube_variants_json, '[]'::jsonb)->0->>'id'
    ELSE NULL
  END
)
WHERE tiendanube_product_id IS NOT NULL;

UPDATE public.products
SET
  tiendanube_sync_status = COALESCE(tiendanube_sync_status, 'linked'),
  tiendanube_sync_error = NULL
WHERE tiendanube_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_tiendanube_primary_variant_id
ON public.products (tiendanube_primary_variant_id)
WHERE tiendanube_primary_variant_id IS NOT NULL;

COMMIT;
