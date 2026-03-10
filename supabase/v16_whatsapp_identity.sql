BEGIN;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS whatsapp_wa_id text;

COMMENT ON COLUMN public.customers.whatsapp_wa_id IS
'WhatsApp Cloud API contact identifier (wa_id / from) for direct WhatsApp conversations.';

UPDATE public.customers
SET whatsapp_wa_id = COALESCE(NULLIF(whatsapp_phone, ''), NULLIF(phone, ''))
WHERE whatsapp_wa_id IS NULL
  AND COALESCE(NULLIF(whatsapp_phone, ''), NULLIF(phone, '')) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_whatsapp_wa_id
ON public.customers (whatsapp_wa_id)
WHERE whatsapp_wa_id IS NOT NULL;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS channel text,
ADD COLUMN IF NOT EXISTS external_message_id text,
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text;

COMMENT ON COLUMN public.conversations.channel IS
'Conversation channel, for example manychat or whatsapp_cloud.';

COMMENT ON COLUMN public.conversations.external_message_id IS
'Provider message id used for tracing and deduplication.';

COMMENT ON COLUMN public.conversations.whatsapp_phone_number_id IS
'WhatsApp Cloud API business phone_number_id that received or sent the message.';

ALTER TABLE public.conversations
ALTER COLUMN channel SET DEFAULT 'manychat';

UPDATE public.conversations
SET channel = COALESCE(channel, 'manychat')
WHERE channel IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_channel
ON public.conversations (channel);

DELETE FROM public.conversations a
USING public.conversations b
WHERE a.id > b.id
  AND a.channel = b.channel
  AND a.external_message_id = b.external_message_id
  AND a.external_message_id IS NOT NULL;

DROP INDEX IF EXISTS idx_conversations_channel_external_message_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_external_message_id
ON public.conversations (channel, external_message_id);

COMMIT;
