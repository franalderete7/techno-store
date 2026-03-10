BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_funnel_stages (
  stage_key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL,
  color_hex text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_funnel_stages IS
'Canonical TechnoStore funnel stages used by workflows and analytics.';

CREATE TABLE IF NOT EXISTS public.crm_tag_definitions (
  tag_key text PRIMARY KEY,
  tag_group text NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  color_hex text NULL,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT crm_tag_definitions_group_check CHECK (
    tag_group = ANY (
      ARRAY[
        'stage'::text,
        'intent'::text,
        'brand'::text,
        'payment'::text,
        'topic'::text,
        'location'::text,
        'behavior'::text,
        'lifecycle'::text
      ]
    )
  )
);

COMMENT ON TABLE public.crm_tag_definitions IS
'Canonical CRM tag catalog for Supabase-first funnel segmentation and analytics.';

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS brands_mentioned text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS topics_mentioned text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS first_seen_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS lead_source text NULL,
ADD COLUMN IF NOT EXISTS lead_source_detail text NULL,
ADD COLUMN IF NOT EXISTS browsing_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS interested_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS closing_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS human_handoff_at timestamp with time zone NULL;

UPDATE public.customers
SET
  tags = COALESCE(tags, '{}'::text[]),
  payment_methods_mentioned = COALESCE(payment_methods_mentioned, '{}'::text[]),
  products_mentioned = COALESCE(products_mentioned, '{}'::text[]),
  brands_mentioned = COALESCE(brands_mentioned, '{}'::text[]),
  topics_mentioned = COALESCE(topics_mentioned, '{}'::text[]),
  first_seen_at = COALESCE(first_seen_at, created_at, updated_at, now()),
  browsing_at = CASE
    WHEN funnel_stage = 'browsing' AND browsing_at IS NULL
      THEN COALESCE(last_funnel_change_at, updated_at, created_at, now())
    ELSE browsing_at
  END,
  interested_at = CASE
    WHEN funnel_stage = 'interested' AND interested_at IS NULL
      THEN COALESCE(last_funnel_change_at, updated_at, created_at, now())
    ELSE interested_at
  END,
  closing_at = CASE
    WHEN funnel_stage = 'closing' AND closing_at IS NULL
      THEN COALESCE(last_funnel_change_at, updated_at, created_at, now())
    ELSE closing_at
  END,
  human_handoff_at = CASE
    WHEN funnel_stage = 'human_handoff' AND human_handoff_at IS NULL
      THEN COALESCE(last_funnel_change_at, updated_at, created_at, now())
    ELSE human_handoff_at
  END;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS applied_tags text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS payment_methods_detected text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS brands_detected text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS topics_detected text[] NOT NULL DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS funnel_stage_after text NULL;

UPDATE public.conversations
SET
  products_mentioned = COALESCE(products_mentioned, '{}'::text[]),
  applied_tags = COALESCE(applied_tags, '{}'::text[]),
  payment_methods_detected = COALESCE(payment_methods_detected, '{}'::text[]),
  brands_detected = COALESCE(brands_detected, '{}'::text[]),
  topics_detected = COALESCE(topics_detected, '{}'::text[]);

CREATE INDEX IF NOT EXISTS idx_customers_tags_gin
ON public.customers USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_customers_products_mentioned_gin
ON public.customers USING gin (products_mentioned);

CREATE INDEX IF NOT EXISTS idx_customers_payment_methods_mentioned_gin
ON public.customers USING gin (payment_methods_mentioned);

CREATE INDEX IF NOT EXISTS idx_customers_brands_mentioned_gin
ON public.customers USING gin (brands_mentioned);

CREATE INDEX IF NOT EXISTS idx_customers_topics_mentioned_gin
ON public.customers USING gin (topics_mentioned);

CREATE INDEX IF NOT EXISTS idx_customers_funnel_stage
ON public.customers (funnel_stage);

CREATE INDEX IF NOT EXISTS idx_customers_last_funnel_change_at
ON public.customers (last_funnel_change_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_applied_tags_gin
ON public.conversations USING gin (applied_tags);

CREATE INDEX IF NOT EXISTS idx_conversations_products_mentioned_gin
ON public.conversations USING gin (products_mentioned);

CREATE INDEX IF NOT EXISTS idx_conversations_payment_methods_detected_gin
ON public.conversations USING gin (payment_methods_detected);

CREATE INDEX IF NOT EXISTS idx_conversations_brands_detected_gin
ON public.conversations USING gin (brands_detected);

CREATE INDEX IF NOT EXISTS idx_conversations_topics_detected_gin
ON public.conversations USING gin (topics_detected);

CREATE INDEX IF NOT EXISTS idx_conversations_funnel_stage_after
ON public.conversations (funnel_stage_after);

INSERT INTO public.crm_funnel_stages (
  stage_key,
  label,
  description,
  sort_order,
  color_hex,
  is_terminal
)
VALUES
  ('new', 'Nuevo', 'Primer contacto o saludo inicial sin contexto suficiente.', 10, '#64748b', false),
  ('browsing', 'Explorando', 'Ya pregunta por productos, stock, precios o compara opciones.', 20, '#38bdf8', false),
  ('interested', 'Interesado', 'Existe interes concreto por una marca, modelo o variante.', 30, '#f59e0b', false),
  ('closing', 'Cierre', 'Pregunta por pago, envio, senia, retiro o pasos finales para comprar.', 40, '#22c55e', false),
  ('human_handoff', 'Asesor', 'La conversacion necesita seguimiento humano.', 50, '#ef4444', false),
  ('won', 'Ganado', 'Venta concretada.', 60, '#16a34a', true),
  ('lost', 'Perdido', 'Lead perdido o descartado.', 70, '#6b7280', true)
ON CONFLICT (stage_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  color_hex = EXCLUDED.color_hex,
  is_terminal = EXCLUDED.is_terminal,
  updated_at = now();

INSERT INTO public.crm_tag_definitions (
  tag_key,
  tag_group,
  label,
  description,
  color_hex,
  sort_order
)
VALUES
  ('stage_new', 'stage', 'Nuevo', 'Lead en primera interaccion.', '#64748b', 10),
  ('stage_browsing', 'stage', 'Explorando', 'Lead comparando opciones o consultando disponibilidad.', '#38bdf8', 20),
  ('stage_interested', 'stage', 'Interesado', 'Lead con interes claro por un producto.', '#f59e0b', 30),
  ('stage_closing', 'stage', 'Cierre', 'Lead preguntando como pagar, enviar o cerrar.', '#22c55e', 40),
  ('stage_human_handoff', 'stage', 'Asesor', 'Lead derivado a una persona.', '#ef4444', 50),
  ('intent_greeting', 'intent', 'Saludo', 'Primer saludo o contacto informal.', '#c084fc', 100),
  ('intent_price_inquiry', 'intent', 'Pregunta Precio', 'Consulta de precio o promo.', '#60a5fa', 110),
  ('intent_stock_check', 'intent', 'Pregunta Stock', 'Consulta de disponibilidad o entrega.', '#34d399', 120),
  ('intent_comparison', 'intent', 'Comparacion', 'Compara modelos, marcas o variantes.', '#f59e0b', 130),
  ('intent_purchase_intent', 'intent', 'Intencion Compra', 'Quiere comprar o avanzar fuerte.', '#22c55e', 140),
  ('intent_reservation', 'intent', 'Reserva', 'Quiere reservar, senar o encargar.', '#10b981', 150),
  ('intent_cuotas_inquiry', 'intent', 'Consulta Cuotas', 'Pregunta por financiacion o cuotas.', '#0ea5e9', 160),
  ('intent_shipping_inquiry', 'intent', 'Consulta Envio', 'Pregunta por envio o despacho.', '#f97316', 170),
  ('intent_complaint', 'intent', 'Reclamo', 'Reclamo o problema postventa.', '#ef4444', 180),
  ('intent_followup', 'intent', 'Seguimiento', 'Continuidad de una charla ya abierta.', '#a78bfa', 190),
  ('brand_iphone', 'brand', 'iPhone', 'Interes por Apple / iPhone.', '#111827', 200),
  ('brand_samsung', 'brand', 'Samsung', 'Interes por Samsung.', '#1d4ed8', 210),
  ('brand_redmi_poco', 'brand', 'Redmi / POCO', 'Interes por Xiaomi, Redmi o POCO.', '#ea580c', 220),
  ('pay_transferencia', 'payment', 'Transferencia', 'Menciono transferencia bancaria.', '#0ea5e9', 300),
  ('pay_mercado_pago', 'payment', 'Mercado Pago', 'Menciono Mercado Pago.', '#2563eb', 310),
  ('pay_efectivo_ars', 'payment', 'Efectivo ARS', 'Menciono efectivo en pesos.', '#16a34a', 320),
  ('pay_efectivo_usd', 'payment', 'Efectivo USD', 'Menciono efectivo en dolares.', '#15803d', 330),
  ('pay_crypto', 'payment', 'Crypto', 'Menciono cripto de forma general.', '#7c3aed', 340),
  ('pay_bitcoin', 'payment', 'Bitcoin', 'Menciono Bitcoin.', '#f59e0b', 350),
  ('pay_usdt', 'payment', 'USDT', 'Menciono USDT / TRC20.', '#14b8a6', 360),
  ('pay_tarjeta', 'payment', 'Tarjeta', 'Menciono tarjeta sin marca concreta.', '#8b5cf6', 370),
  ('pay_naranja', 'payment', 'Naranja', 'Menciono tarjeta Naranja.', '#f97316', 380),
  ('pay_macro', 'payment', 'Macro', 'Menciono Macro.', '#e11d48', 390),
  ('pay_visa', 'payment', 'Visa', 'Menciono Visa.', '#2563eb', 400),
  ('pay_mastercard', 'payment', 'Mastercard', 'Menciono Mastercard.', '#dc2626', 410),
  ('pay_amex', 'payment', 'Amex', 'Menciono American Express.', '#0f766e', 420),
  ('pay_cabal', 'payment', 'Cabal', 'Menciono Cabal.', '#7c2d12', 430),
  ('pay_subcredito', 'payment', 'SubCredito', 'Menciono SubCredito.', '#b91c1c', 440),
  ('pay_cuotas', 'payment', 'Cuotas', 'Menciono cuotas o financiacion.', '#22c55e', 450),
  ('topic_precio', 'topic', 'Precio', 'Tema de precios o promos.', '#60a5fa', 500),
  ('topic_stock', 'topic', 'Stock', 'Tema de disponibilidad.', '#34d399', 510),
  ('topic_imagenes', 'topic', 'Imagenes', 'Pidio fotos o ver el equipo.', '#f472b6', 520),
  ('topic_envio', 'topic', 'Envio', 'Pidio informacion de envio o despacho.', '#fb923c', 530),
  ('topic_cuotas', 'topic', 'Cuotas', 'Pidio financiacion o cuotas.', '#0ea5e9', 540),
  ('topic_pago', 'topic', 'Pago', 'Hablo de forma de pago.', '#16a34a', 550),
  ('topic_garantia', 'topic', 'Garantia', 'Pregunto por garantia.', '#a855f7', 560),
  ('topic_ubicacion', 'topic', 'Ubicacion', 'Pregunto direccion, mapa o sucursal.', '#f43f5e', 570),
  ('topic_reserva', 'topic', 'Reserva', 'Quiere reservar, senar o encargar.', '#22c55e', 580),
  ('topic_comparacion', 'topic', 'Comparacion', 'Compara opciones.', '#f59e0b', 590),
  ('topic_trade_in', 'topic', 'Toma usado', 'Pregunta por entregar otro equipo o permuta.', '#6d28d9', 600),
  ('loc_salta_capital', 'location', 'Salta Capital', 'Ubicacion confirmada en Salta Capital.', '#ef4444', 700),
  ('loc_interior', 'location', 'Interior', 'Ubicacion fuera de Salta Capital.', '#f97316', 710),
  ('phone_area_known', 'location', 'Indicativo Conocido', 'Se pudo inferir provincia o zona por telefono.', '#38bdf8', 720),
  ('prov_salta', 'location', 'Provincia Salta', 'Telefono asociado a la provincia de Salta.', '#dc2626', 730),
  ('prov_jujuy', 'location', 'Provincia Jujuy', 'Telefono asociado a Jujuy.', '#f59e0b', 731),
  ('prov_tucuman', 'location', 'Provincia Tucuman', 'Telefono asociado a Tucuman.', '#2563eb', 732),
  ('prov_catamarca', 'location', 'Provincia Catamarca', 'Telefono asociado a Catamarca.', '#7c3aed', 733),
  ('prov_santiago_del_estero', 'location', 'Provincia Santiago del Estero', 'Telefono asociado a Santiago del Estero.', '#0ea5e9', 734),
  ('prov_la_rioja', 'location', 'Provincia La Rioja', 'Telefono asociado a La Rioja.', '#fb7185', 735),
  ('prov_corrientes', 'location', 'Provincia Corrientes', 'Telefono asociado a Corrientes.', '#10b981', 736),
  ('prov_misiones', 'location', 'Provincia Misiones', 'Telefono asociado a Misiones.', '#059669', 737),
  ('prov_formosa', 'location', 'Provincia Formosa', 'Telefono asociado a Formosa.', '#0f766e', 738),
  ('prov_chaco', 'location', 'Provincia Chaco', 'Telefono asociado a Chaco.', '#b45309', 739),
  ('prov_cordoba', 'location', 'Provincia Cordoba', 'Telefono asociado a Cordoba.', '#2563eb', 740),
  ('prov_mendoza', 'location', 'Provincia Mendoza', 'Telefono asociado a Mendoza.', '#dc2626', 741),
  ('prov_san_juan', 'location', 'Provincia San Juan', 'Telefono asociado a San Juan.', '#0f766e', 742),
  ('prov_san_luis', 'location', 'Provincia San Luis', 'Telefono asociado a San Luis.', '#7c2d12', 743),
  ('prov_la_pampa', 'location', 'Provincia La Pampa', 'Telefono asociado a La Pampa.', '#65a30d', 744),
  ('prov_santa_fe', 'location', 'Provincia Santa Fe', 'Telefono asociado a Santa Fe.', '#0284c7', 745),
  ('prov_entre_rios', 'location', 'Provincia Entre Rios', 'Telefono asociado a Entre Rios.', '#0891b2', 746),
  ('prov_buenos_aires', 'location', 'Provincia Buenos Aires', 'Telefono asociado a Buenos Aires.', '#1d4ed8', 747),
  ('prov_caba', 'location', 'CABA', 'Telefono asociado a CABA / AMBA.', '#111827', 748),
  ('prov_neuquen', 'location', 'Provincia Neuquen', 'Telefono asociado a Neuquen.', '#2563eb', 749),
  ('prov_rio_negro', 'location', 'Provincia Rio Negro', 'Telefono asociado a Rio Negro.', '#16a34a', 750),
  ('prov_chubut', 'location', 'Provincia Chubut', 'Telefono asociado a Chubut.', '#0ea5e9', 751),
  ('prov_santa_cruz', 'location', 'Provincia Santa Cruz', 'Telefono asociado a Santa Cruz.', '#6d28d9', 752),
  ('prov_tierra_del_fuego', 'location', 'Provincia Tierra del Fuego', 'Telefono asociado a Tierra del Fuego.', '#0f766e', 753),
  ('behavior_audio_user', 'behavior', 'Usuario Audio', 'El usuario envio una nota de voz.', '#a855f7', 800),
  ('behavior_image_user', 'behavior', 'Usuario Imagen', 'El usuario envio una imagen.', '#f472b6', 810),
  ('product_tracked', 'behavior', 'Producto Trackeado', 'Hay al menos un producto concreto asociado a la charla.', '#f59e0b', 820),
  ('needs_human', 'lifecycle', 'Necesita Asesor', 'La charla requiere seguimiento humano.', '#ef4444', 900)
ON CONFLICT (tag_key) DO UPDATE
SET
  tag_group = EXCLUDED.tag_group,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  color_hex = EXCLUDED.color_hex,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

INSERT INTO public.store_settings (key, value, description)
VALUES
  ('store_location_name', 'TechnoStore Salta', 'Display name used for WhatsApp location pin replies.'),
  ('store_latitude', '-24.7891289', 'Latitude used for WhatsApp location pin replies.'),
  ('store_longitude', '-65.4214185', 'Longitude used for WhatsApp location pin replies.')
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE VIEW public.v_customer_context AS
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
  c.location_source,
  c.phone_area_code,
  c.phone_area_name,
  c.phone_area_province,
  c.preferred_brand,
  c.preferred_budget,
  c.payment_preference,
  c.payment_method_last,
  COALESCE(c.payment_methods_mentioned, '{}'::text[]) AS payment_methods_mentioned,
  c.interested_product,
  COALESCE(c.products_mentioned, '{}'::text[]) AS products_mentioned,
  c.funnel_stage,
  c.last_funnel_change_at,
  c.last_intent,
  c.lead_score,
  COALESCE(c.tags, '{}'::text[]) AS tags,
  c.total_interactions,
  c.last_bot_interaction,
  c.last_human_interaction,
  c.human_assigned,
  c.manychat_subscribed_at,
  COALESCE(c.manychat_tags, '{}'::text[]) AS manychat_tags,
  c.created_at,
  c.updated_at,
  COALESCE(c.brands_mentioned, '{}'::text[]) AS brands_mentioned,
  COALESCE(c.topics_mentioned, '{}'::text[]) AS topics_mentioned,
  c.browsing_at,
  c.interested_at,
  c.closing_at,
  c.human_handoff_at,
  c.first_seen_at,
  c.lead_source,
  c.lead_source_detail,
  c.whatsapp_wa_id
FROM public.customers c;

CREATE OR REPLACE VIEW public.v_store_context AS
SELECT
  max(value) FILTER (WHERE key = 'store_address') AS store_address,
  max(value) FILTER (WHERE key = 'store_hours') AS store_hours,
  max(value) FILTER (WHERE key = 'store_payment_methods') AS store_payment_methods,
  max(value) FILTER (WHERE key = 'store_credit_policy') AS store_credit_policy,
  max(value) FILTER (WHERE key = 'store_shipping_policy') AS store_shipping_policy,
  max(value) FILTER (WHERE key = 'store_warranty_new') AS store_warranty_new,
  max(value) FILTER (WHERE key = 'store_warranty_used') AS store_warranty_used,
  max(value) FILTER (WHERE key = 'store_social_instagram') AS store_social_instagram,
  max(value) FILTER (WHERE key = 'store_social_facebook') AS store_social_facebook,
  max(value) FILTER (WHERE key = 'customer_cards_supported') AS customer_cards_supported,
  max(value) FILTER (WHERE key = 'customer_cards_blocked') AS customer_cards_blocked,
  max(value) FILTER (WHERE key = 'customer_payment_mentions_supported') AS customer_payment_mentions_supported,
  max(value) FILTER (WHERE key = 'store_financing_scope') AS store_financing_scope,
  max(value) FILTER (WHERE key = 'usd_to_ars') AS usd_to_ars,
  max(value) FILTER (WHERE key = 'store_location_name') AS store_location_name,
  max(value) FILTER (WHERE key = 'store_latitude') AS store_latitude,
  max(value) FILTER (WHERE key = 'store_longitude') AS store_longitude
FROM public.store_settings;

CREATE OR REPLACE VIEW public.v_customer_stage_reached AS
SELECT
  c.id AS customer_id,
  c.manychat_id,
  'new'::text AS funnel_stage,
  COALESCE(c.first_seen_at, c.created_at, c.updated_at) AS reached_at
FROM public.customers c
WHERE COALESCE(c.first_seen_at, c.created_at, c.updated_at) IS NOT NULL
UNION ALL
SELECT c.id, c.manychat_id, 'browsing'::text, c.browsing_at
FROM public.customers c
WHERE c.browsing_at IS NOT NULL
UNION ALL
SELECT c.id, c.manychat_id, 'interested'::text, c.interested_at
FROM public.customers c
WHERE c.interested_at IS NOT NULL
UNION ALL
SELECT c.id, c.manychat_id, 'closing'::text, c.closing_at
FROM public.customers c
WHERE c.closing_at IS NOT NULL
UNION ALL
SELECT c.id, c.manychat_id, 'human_handoff'::text, c.human_handoff_at
FROM public.customers c
WHERE c.human_handoff_at IS NOT NULL;

CREATE OR REPLACE VIEW public.v_funnel_daily AS
SELECT
  date(v.reached_at) AS activity_date,
  v.funnel_stage,
  s.label AS stage_label,
  s.sort_order,
  s.color_hex,
  count(DISTINCT v.customer_id) AS customers_reached
FROM public.v_customer_stage_reached v
JOIN public.crm_funnel_stages s
  ON s.stage_key = v.funnel_stage
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.v_conversation_signal_daily AS
SELECT
  date(c.created_at) AS activity_date,
  'tag'::text AS signal_type,
  tag_key AS signal_key,
  count(*) AS mentions,
  count(DISTINCT COALESCE(c.customer_id, -c.id)) AS unique_customers
FROM public.conversations c
CROSS JOIN LATERAL unnest(COALESCE(c.applied_tags, '{}'::text[])) tag_key
WHERE c.created_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  date(c.created_at) AS activity_date,
  'payment'::text AS signal_type,
  payment_key AS signal_key,
  count(*) AS mentions,
  count(DISTINCT COALESCE(c.customer_id, -c.id)) AS unique_customers
FROM public.conversations c
CROSS JOIN LATERAL unnest(COALESCE(c.payment_methods_detected, '{}'::text[])) payment_key
WHERE c.created_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  date(c.created_at) AS activity_date,
  'brand'::text AS signal_type,
  brand_key AS signal_key,
  count(*) AS mentions,
  count(DISTINCT COALESCE(c.customer_id, -c.id)) AS unique_customers
FROM public.conversations c
CROSS JOIN LATERAL unnest(COALESCE(c.brands_detected, '{}'::text[])) brand_key
WHERE c.created_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  date(c.created_at) AS activity_date,
  'topic'::text AS signal_type,
  topic_key AS signal_key,
  count(*) AS mentions,
  count(DISTINCT COALESCE(c.customer_id, -c.id)) AS unique_customers
FROM public.conversations c
CROSS JOIN LATERAL unnest(COALESCE(c.topics_detected, '{}'::text[])) topic_key
WHERE c.created_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  date(c.created_at) AS activity_date,
  'product'::text AS signal_type,
  product_key AS signal_key,
  count(*) AS mentions,
  count(DISTINCT COALESCE(c.customer_id, -c.id)) AS unique_customers
FROM public.conversations c
CROSS JOIN LATERAL unnest(COALESCE(c.products_mentioned, '{}'::text[])) product_key
WHERE c.created_at IS NOT NULL
GROUP BY 1, 2, 3;

COMMIT;
