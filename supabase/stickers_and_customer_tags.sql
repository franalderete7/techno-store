BEGIN;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS tags text[];

ALTER TABLE public.customers
ALTER COLUMN tags SET DEFAULT '{}'::text[];

UPDATE public.customers
SET tags = '{}'::text[]
WHERE tags IS NULL;

COMMENT ON COLUMN public.customers.tags IS
'Operational CRM tags owned by Supabase/n8n. Replaces ManyChat as the source of truth for funnel segmentation.';

CREATE TABLE IF NOT EXISTS public.stickers (
  id serial PRIMARY KEY,
  sticker_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NULL,
  media_id text NULL,
  sticker_url text NULL,
  enabled boolean NOT NULL DEFAULT true,
  intents text[] NOT NULL DEFAULT '{}'::text[],
  funnel_stages text[] NOT NULL DEFAULT '{}'::text[],
  required_tags text[] NOT NULL DEFAULT '{}'::text[],
  excluded_tags text[] NOT NULL DEFAULT '{}'::text[],
  priority integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stickers_source_check CHECK (
    media_id IS NULL
    OR length(trim(media_id)) > 0
    OR (sticker_url IS NOT NULL AND length(trim(sticker_url)) > 0)
  )
);

COMMENT ON TABLE public.stickers IS
'Sticker catalog for WhatsApp Cloud replies. Rows can be matched by intent, funnel stage, and CRM tags.';

COMMENT ON COLUMN public.stickers.sticker_key IS
'Stable key used by workflows when selecting a sticker.';

COMMENT ON COLUMN public.stickers.media_id IS
'Meta/WhatsApp Cloud uploaded media id. Preferred over sticker_url.';

COMMENT ON COLUMN public.stickers.sticker_url IS
'Public fallback URL for the sticker asset when media_id is not available.';

COMMENT ON COLUMN public.stickers.intents IS
'Conversation intents that this sticker fits, for example greeting, followup, price_inquiry.';

COMMENT ON COLUMN public.stickers.funnel_stages IS
'Funnel stages where this sticker is allowed, for example new, browsing, interested.';

COMMENT ON COLUMN public.stickers.required_tags IS
'CRM tags that must already exist on the customer or message context.';

COMMENT ON COLUMN public.stickers.excluded_tags IS
'CRM tags that block this sticker, for example complaint or human_handoff.';

COMMENT ON COLUMN public.stickers.priority IS
'Lower values win when multiple stickers match.';

CREATE INDEX IF NOT EXISTS idx_stickers_enabled_priority
ON public.stickers (enabled, priority, sticker_key);

CREATE INDEX IF NOT EXISTS idx_stickers_intents
ON public.stickers USING gin (intents);

CREATE INDEX IF NOT EXISTS idx_stickers_funnel_stages
ON public.stickers USING gin (funnel_stages);

CREATE INDEX IF NOT EXISTS idx_stickers_required_tags
ON public.stickers USING gin (required_tags);

CREATE INDEX IF NOT EXISTS idx_stickers_excluded_tags
ON public.stickers USING gin (excluded_tags);

COMMIT;
