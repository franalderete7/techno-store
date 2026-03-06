-- ============================================================
-- CRM UPGRADE - Run in Supabase SQL Editor
-- ============================================================

-- 1. Recreate v_customer_context with ALL CRM columns
DROP VIEW IF EXISTS v_customer_context;
CREATE VIEW v_customer_context AS
SELECT
  c.id,
  c.manychat_id,
  c.phone,
  c.whatsapp_phone,
  c.first_name,
  c.last_name,
  c.timezone,
  c.city,
  c.is_salta_capital,
  c.preferred_brand,
  c.preferred_budget,
  c.payment_preference,
  c.interested_product,
  c.funnel_stage,
  c.lead_score,
  c.tags,
  c.total_interactions,
  c.last_bot_interaction,
  c.last_human_interaction,
  c.human_assigned,
  c.manychat_subscribed_at,
  c.manychat_tags,
  c.created_at,
  c.updated_at
FROM customers c;

-- 2. Recreate v_recent_conversations
DROP VIEW IF EXISTS v_recent_conversations;
CREATE VIEW v_recent_conversations AS
SELECT
  cv.id,
  cv.customer_id,
  cv.manychat_id,
  cv.role,
  cv.message,
  cv.message_type,
  cv.intent_detected,
  cv.products_mentioned,
  cv.triggered_human,
  cv.was_audio,
  cv.audio_transcription,
  cv.created_at
FROM conversations cv;

-- 3. Recreate v_product_catalog
DROP VIEW IF EXISTS v_product_catalog;
CREATE VIEW v_product_catalog AS
SELECT
  p.id,
  p.product_key,
  p.category,
  p.product_name,
  p.price_usd,
  p.price_ars,
  p.promo_price_ars,
  p.bancarizada_total,
  p.bancarizada_cuota,
  p.macro_total,
  p.macro_cuota,
  p.cuotas_qty,
  p.in_stock,
  p.delivery_type,
  p.delivery_days,
  p.ram_gb,
  p.storage_gb,
  p.color,
  p.network,
  p.image_url,
  p.battery_health,
  p.condition
FROM products p;

-- 4. Atomic interaction counter
CREATE OR REPLACE FUNCTION increment_interaction(p_manychat_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE customers
  SET total_interactions = COALESCE(total_interactions, 0) + 1,
      updated_at = now()
  WHERE manychat_id = p_manychat_id
  RETURNING total_interactions INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;
