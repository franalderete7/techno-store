# ManyChat Fields And Tags

This is the CRM taxonomy expected by `TechnoStore_v15_orchestrator.json`.

## Custom Fields

Create these ManyChat custom fields before relying on full sync:

| Field name | Type | Purpose |
| --- | --- | --- |
| `funnel_stage` | text | Current funnel stage: `new`, `browsing`, `interested`, `closing`, `human_handoff` |
| `brand` | text | Brand interest: `IPHONE`, `SAMSUNG`, `REDMI/POCO` |
| `city` | text | Latest explicit customer city |
| `is_salta` | text | `true`, `false`, or `unknown` |
| `budget_range` | text | `budget`, `mid`, `premium` |
| `payment_method` | text | Latest normalized payment mention |
| `payment_methods_mentioned` | text | Comma-separated normalized payment mentions |
| `last_intent` | text | Latest detected CRM intent |
| `interested_product` | text | Primary current `product_key` |
| `last_product_viewed` | text | Last product shown or discussed |
| `products_mentioned` | text | Comma-separated product keys mentioned recently |
| `lead_score` | number | Current lead score |
| `interaction_count` | number | Total interaction count |
| `location_source` | text | `explicit_city`, `phone_area_code`, `unknown` |
| `phone_area_code` | text | Phone area code hint, e.g. `387` |
| `phone_area_name` | text | Human-readable area hint, e.g. `Salta` |
| `phone_area_province` | text | Province/region hint from the phone |
| `is_human_active` | text | Human handoff flag used to pause the bot |

## Normalized Payment Values

Use these values consistently in Supabase, n8n metadata, and ManyChat fields/tags:

- `transferencia`
- `mercado_pago`
- `efectivo_ars`
- `efectivo_usd`
- `crypto`
- `bitcoin`
- `usdt`
- `naranja`
- `macro`
- `visa`
- `mastercard`
- `amex`
- `cabal`
- `subcredito`
- `cuotas`
- `tarjeta`

## Tags

The workflow now writes these operational tags:

- `contacted`
- `stage_new`
- `stage_browsing`
- `stage_interested`
- `stage_closing`
- `stage_human_handoff`
- `brand_iphone`
- `brand_samsung`
- `brand_redmi_poco`
- `intent_greeting`
- `intent_price_inquiry`
- `intent_stock_check`
- `intent_comparison`
- `intent_purchase_intent`
- `intent_reservation`
- `intent_cuotas_inquiry`
- `intent_shipping_inquiry`
- `intent_complaint`
- `intent_followup`
- `intent_ambiguous`
- `loc_salta_capital`
- `loc_interior`
- `phone_area_known`
- `prov_salta`
- `prov_jujuy`
- `prov_tucuman`
- `prov_catamarca`
- `prov_santiago_del_estero`
- `prov_la_rioja`
- `prov_corrientes`
- `prov_misiones`
- `prov_formosa`
- `prov_chaco`
- `prov_cordoba`
- `prov_mendoza`
- `prov_san_juan`
- `prov_san_luis`
- `prov_la_pampa`
- `prov_santa_fe`
- `prov_entre_rios`
- `prov_buenos_aires`
- `prov_caba`
- `prov_neuquen`
- `prov_rio_negro`
- `prov_chubut`
- `prov_santa_cruz`
- `prov_tierra_del_fuego`
- `pay_transferencia`
- `pay_mercado_pago`
- `pay_efectivo_ars`
- `pay_efectivo_usd`
- `pay_crypto`
- `pay_bitcoin`
- `pay_usdt`
- `pay_naranja`
- `pay_macro`
- `pay_visa`
- `pay_mastercard`
- `pay_amex`
- `pay_cabal`
- `pay_subcredito`
- `pay_cuotas`
- `pay_tarjeta`
- `behavior_audio_user`
- `product_tracked`
- `condition_seminuevo_interest`
- `needs_human`

## Rule

Supabase is the CRM source of truth. ManyChat fields and tags are a segmentation mirror, not the primary database.

The workflow emits `prov_*` tags from `phone_area_province` when that hint is available, so those tags should exist in ManyChat before production traffic uses the new phone-area enrichment.
