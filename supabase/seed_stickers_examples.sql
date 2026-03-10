INSERT INTO public.stickers (
  sticker_key,
  label,
  description,
  enabled,
  intents,
  funnel_stages,
  required_tags,
  excluded_tags,
  priority
) VALUES
  (
    'greeting_warm',
    'Greeting Warm',
    'Friendly opener for first-contact or light browsing chats.',
    false,
    ARRAY['greeting', 'followup'],
    ARRAY['new', 'browsing'],
    ARRAY[]::text[],
    ARRAY['intent_complaint', 'stage_human_handoff'],
    20
  ),
  (
    'voice_note_ack',
    'Voice Note Ack',
    'Warm acknowledgement when the user sends an audio message.',
    false,
    ARRAY['followup', 'stock_check', 'price_inquiry'],
    ARRAY['browsing', 'interested'],
    ARRAY['behavior_audio_user'],
    ARRAY['intent_complaint', 'stage_human_handoff'],
    15
  ),
  (
    'photo_share',
    'Photo Share',
    'Sticker for chats where the bot is sending product photos.',
    false,
    ARRAY['stock_check', 'price_inquiry', 'followup'],
    ARRAY['browsing', 'interested'],
    ARRAY['product_tracked'],
    ARRAY['intent_complaint', 'stage_human_handoff'],
    10
  ),
  (
    'closing_hype',
    'Closing Hype',
    'Positive sticker when the lead is close to buying.',
    false,
    ARRAY['purchase_intent', 'reservation'],
    ARRAY['interested', 'closing'],
    ARRAY[]::text[],
    ARRAY['intent_complaint', 'stage_human_handoff'],
    12
  ),
  (
    'salta_local',
    'Salta Local',
    'Sticker reserved for Salta Capital conversations.',
    false,
    ARRAY['shipping_inquiry', 'followup'],
    ARRAY['browsing', 'interested'],
    ARRAY['loc_salta_capital'],
    ARRAY['intent_complaint', 'stage_human_handoff'],
    30
  ),
  (
    'human_handoff_soft',
    'Human Handoff Soft',
    'Very soft sticker for handoff moments if you decide to use one.',
    false,
    ARRAY['reservation', 'followup'],
    ARRAY['closing', 'human_handoff'],
    ARRAY[]::text[],
    ARRAY['intent_complaint'],
    80
  )
ON CONFLICT (sticker_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  intents = EXCLUDED.intents,
  funnel_stages = EXCLUDED.funnel_stages,
  required_tags = EXCLUDED.required_tags,
  excluded_tags = EXCLUDED.excluded_tags,
  priority = EXCLUDED.priority;
