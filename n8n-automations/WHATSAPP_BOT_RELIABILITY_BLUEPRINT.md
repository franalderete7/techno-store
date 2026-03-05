# TechnoStore WhatsApp Bot - Reliability Blueprint (DB-Aware)

## Current State Assessment
Your base is good and already above average for SMB WhatsApp bots:
- Debounce + atomic latest-message RPC exists (`check_is_latest_message`).
- Customer upsert is centralized (`upsert_customer`).
- Product catalog includes image URLs and cuotas fields.
- You already added response safety logic and chunking.

Main production risk now is not "AI quality" but architecture coupling (too many responsibilities in one workflow).

## Recommended Architecture Split

### 1) `wf_inbound_gateway`
Responsibility:
- Webhook receive
- Normalize payload
- Idempotency key check
- Persist inbound raw event
- Trigger next workflow

### 2) `wf_debounce_and_turn_builder`
Responsibility:
- Wait window (8-10s)
- Call `check_is_latest_message`
- Merge burst user messages into one `user_turn`

### 3) `wf_context_builder`
Responsibility:
- Query `v_customer_context`
- Query recent conversation from `v_recent_conversations`
- Query products from `v_product_catalog`
- Attach fixed store policies

### 4) `wf_ai_orchestrator`
Responsibility:
- AI prompt + tool calls (`info_tienda`, `calcular_cuotas`)
- Strict output schema
- No internal IDs in user-facing text

### 5) `wf_delivery_guard`
Responsibility:
- Sanitize internal tokens
- Split by brand when full catalog requested
- Safe text chunking under WhatsApp/MChat limits
- Conditional image send (only if asked + image exists)
- Send with retry/backoff

### 6) `wf_post_actions`
Responsibility:
- Save bot message
- Update customer profile/funnel
- Backfill intent
- Emit analytics event

## DB-Specific Findings From Your Schema

### Good
- `v_product_catalog` has all fields needed for sales + images.
- `check_is_latest_message` is deterministic (`created_at desc, id desc`).
- `v_customer_context` exposes key routing fields (city, funnel, human_assigned).

### Must Fix
- `upsert_customer` currently updates `last_bot_interaction = now()` during inbound user processing.
- This is semantically wrong and distorts analytics/automations.

### Recommended SQL Changes
1. Add `last_user_interaction timestamptz` to `customers`.
2. Update `upsert_customer` to set `last_user_interaction = now()` instead of `last_bot_interaction`.
3. Keep `last_bot_interaction` updates only in bot-send/post-actions workflow.
4. Add idempotency table (`interaction_events`) with unique external event key.
5. Add outbound queue/dead-letter table for failed sends.

## Reliability Controls (Production)
- Idempotency key on inbound event.
- Correlation IDs across workflows: `subscriber_id`, `turn_id`, `run_id`.
- Retry policy for outbound send only on transient errors.
- Dead-letter + replay command for failed deliveries.
- Alerting on: send 4xx spike, send 5xx spike, AI timeout spike.

## Migration Plan (Low Risk)
1. Keep current workflow live.
2. Extract `wf_delivery_guard` first (highest incident impact).
3. Extract `wf_context_builder` second.
4. Extract `wf_ai_orchestrator` third.
5. Move side effects to `wf_post_actions` last.
6. After stable, reduce old monolith to thin orchestrator or deprecate it.

## Output Contract Between Workflows
Pass one canonical object (`turn envelope`):
- `turn_id`
- `subscriber_id`
- `customer_id`
- `user_text_raw`
- `user_text_merged`
- `context`
- `ai_result`
- `delivery_payload`
- `status`

## Optional Next Step
I can generate a concrete SQL migration file now for:
- `customers.last_user_interaction`
- `upsert_customer` patch
- `interaction_events` idempotency table
- `outbound_messages` + dead-letter support
