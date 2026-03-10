BEGIN;

DELETE FROM public.crm_tag_definitions
WHERE tag_key IN ('loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest');

UPDATE public.customers
SET
  tags = (
    SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
    FROM (
      SELECT DISTINCT tag
      FROM unnest(COALESCE(public.customers.tags, '{}'::text[])) AS tag
      WHERE tag <> ALL (ARRAY['loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest']::text[])
    ) cleaned
  ),
  manychat_tags = (
    SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
    FROM (
      SELECT DISTINCT tag
      FROM unnest(COALESCE(public.customers.manychat_tags, '{}'::text[])) AS tag
      WHERE tag <> ALL (ARRAY['loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest']::text[])
    ) cleaned
  );

UPDATE public.conversations
SET applied_tags = (
  SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
  FROM (
    SELECT DISTINCT tag
    FROM unnest(COALESCE(public.conversations.applied_tags, '{}'::text[])) AS tag
    WHERE tag <> ALL (ARRAY['loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest']::text[])
  ) cleaned
);

UPDATE public.stickers
SET
  required_tags = (
    SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
    FROM (
      SELECT DISTINCT tag
      FROM unnest(COALESCE(public.stickers.required_tags, '{}'::text[])) AS tag
      WHERE tag <> ALL (ARRAY['loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest']::text[])
    ) cleaned
  ),
  excluded_tags = (
    SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
    FROM (
      SELECT DISTINCT tag
      FROM unnest(COALESCE(public.stickers.excluded_tags, '{}'::text[])) AS tag
      WHERE tag <> ALL (ARRAY['loc_interior', 'product_tracked', 'contacted', 'condition_seminuevo_interest']::text[])
    ) cleaned
  );

UPDATE public.stickers
SET required_tags = ARRAY['topic_imagenes']::text[]
WHERE sticker_key = 'photo_share';

COMMIT;
