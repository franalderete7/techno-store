BEGIN;

UPDATE public.customers
SET
  tags = '{}'::text[],
  manychat_tags = '{}'::text[];

UPDATE public.conversations
SET applied_tags = '{}'::text[];

COMMIT;
