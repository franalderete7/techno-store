BEGIN;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS conversation_summary text NULL,
ADD COLUMN IF NOT EXISTS conversation_insights text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS lead_score_after integer NULL;

COMMENT ON COLUMN public.conversations.conversation_summary IS
'Compact one-line summary of what happened in that conversation turn.';

COMMENT ON COLUMN public.conversations.conversation_insights IS
'Structured insights captured for the turn, such as product, payment, budget, city, or funnel cues.';

COMMENT ON COLUMN public.conversations.lead_score_after IS
'Lead score snapshot immediately after processing that conversation turn.';

UPDATE public.conversations
SET
  conversation_summary = COALESCE(
    conversation_summary,
    NULLIF(
      LEFT(
        regexp_replace(
          COALESCE(audio_transcription, message, ''),
          '\s+',
          ' ',
          'g'
        ),
        220
      ),
      ''
    )
  ),
  conversation_insights = COALESCE(conversation_insights, '{}'::text[]);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_score_after
ON public.conversations (lead_score_after);

COMMIT;
