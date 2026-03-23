import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join(process.cwd(), 'n8n-automations');

function stableId(seed) {
  const hex = createHash('md5').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function workflowBase(name, nodes, connections) {
  return {
    name,
    active: false,
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
    },
    tags: [],
  };
}

function triggerNode(seed, position) {
  return {
    parameters: {},
    id: stableId(`${seed}:trigger`),
    name: 'When Executed by Another Workflow',
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1,
    position,
  };
}

function webhookNode(seed, position, pathValue) {
  return {
    parameters: {
      httpMethod: 'POST',
      path: pathValue,
      options: {},
    },
    id: stableId(`${seed}:webhook`),
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position,
    webhookId: pathValue,
  };
}

function codeNode(seed, name, position, jsCode, extra = {}) {
  return {
    parameters: {
      jsCode,
    },
    id: stableId(`${seed}:${name}`),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
    ...extra,
  };
}

function ifNode(seed, name, position, leftValue) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: stableId(`${seed}:${name}:condition`),
            leftValue,
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'equals',
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id: stableId(`${seed}:${name}`),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function supabaseHeaders(includePrefer = false) {
  const headers = [
    {
      name: 'apikey',
      value: '={{ $env.SUPABASE_KEY }}',
    },
    {
      name: 'Authorization',
      value: '=Bearer {{ $env.SUPABASE_KEY }}',
    },
    {
      name: 'Content-Type',
      value: 'application/json',
    },
  ];

  if (includePrefer) {
    headers.push({
      name: 'Prefer',
      value: 'return=representation',
    });
  }

  return {
    parameters: headers,
  };
}

function httpNode(seed, name, position, parameters, extra = {}) {
  return {
    parameters,
    id: stableId(`${seed}:${name}`),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    ...extra,
  };
}

function executeWorkflowNode(seed, name, position, cachedResultName, workflowIdValue, inputMap, schema, extra = {}) {
  return {
    parameters: {
      workflowId: {
        __rl: true,
        value: workflowIdValue,
        mode: 'list',
        cachedResultName,
      },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: inputMap,
        matchingColumns: [],
        schema,
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: {},
    },
    id: stableId(`${seed}:${name}`),
    name,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.2,
    position,
    ...extra,
  };
}

function writeWorkflow(fileName, workflow) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(workflow, null, 2)}\n`);
}

const contextBuilderSeed = 'techno-v17-context-builder';
writeWorkflow(
  'TechnoStore_v17_context_builder.json',
  workflowBase(
    'TechnoStore - v17 Context Builder',
    [
      triggerNode(contextBuilderSeed, [260, 300]),
      codeNode(
        contextBuilderSeed,
        'Normalize Input',
        [520, 300],
        `const input = $input.first().json || {};
const userMessage = String(input.user_message || input.raw_message || '').trim();

return [{
  json: {
    ...input,
    user_message: userMessage || '(vacío)',
    channel: String(input.channel || 'manychat'),
  }
}];`,
      ),
      httpNode(
        contextBuilderSeed,
        'Fetch Turn Context',
        [800, 300],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/rpc/v17_build_turn_context',
          sendHeaders: true,
          headerParameters: supabaseHeaders(false),
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ p_manychat_id: $json.subscriber_id, p_user_message: $json.user_message, p_recent_limit: 6, p_candidate_limit: 8, p_storefront_order_id: $json.storefront_order_id || null, p_storefront_order_token: $json.storefront_order_token || null }) }}',
          options: {
            timeout: 10000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      codeNode(
        contextBuilderSeed,
        'Normalize Context',
        [1080, 300],
        `const base = $('Normalize Input').first().json || {};
const raw = $input.first().json || {};
const context = raw.v17_build_turn_context || raw || {};

if (!context.store || typeof context.store !== 'object') {
  context.store = {};
}

context.store.store_website_url = context.store.store_website_url || 'https://puntotechno.com';

return [{
  json: {
    ...base,
    context,
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Normalize Input', type: 'main', index: 0 }]],
      },
      'Normalize Input': {
        main: [[{ node: 'Fetch Turn Context', type: 'main', index: 0 }]],
      },
      'Fetch Turn Context': {
        main: [[{ node: 'Normalize Context', type: 'main', index: 0 }]],
      },
    },
  ),
);

const routerSeed = 'techno-v17-router';
writeWorkflow(
  'TechnoStore_v17_router.json',
  workflowBase(
    'TechnoStore - v17 Router',
    [
      triggerNode(routerSeed, [260, 300]),
      codeNode(
        routerSeed,
        'Route Turn',
        [560, 300],
        `const data = $input.first().json || {};
const context = data.context || {};
const message = String(data.user_message || '').trim();
const normalized = message
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^a-z0-9\\s]/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();

const recentMessages = Array.isArray(context.recent_messages) ? context.recent_messages : [];
const candidateProducts = Array.isArray(context.candidate_products) ? context.candidate_products : [];
const storefrontHandoff = context.storefront_handoff;

const unique = (values) => [...new Set(values.filter(Boolean))];
const extractBrands = (text) => {
  const brands = [];
  if (/(^| )(iphone|apple|ipad|macbook)( |$)/.test(text)) brands.push('apple');
  if (/(^| )(samsung|galaxy)( |$)/.test(text)) brands.push('samsung');
  if (/(^| )(motorola|moto)( |$)/.test(text)) brands.push('motorola');
  if (/(^| )(xiaomi)( |$)/.test(text)) brands.push('xiaomi');
  if (/(^| )(redmi)( |$)/.test(text)) brands.push('redmi');
  if (/(^| )(poco)( |$)/.test(text)) brands.push('redmi');
  if (/(^| )(google|pixel)( |$)/.test(text)) brands.push('google');
  return unique(brands);
};

const extractTier = (text) => {
  if (/(^| )(pro max|promax)( |$)/.test(text)) return 'pro_max';
  if (/(^| )(ultra)( |$)/.test(text)) return 'ultra';
  if (/(^| )(pro)( |$)/.test(text)) return 'pro';
  if (/(^| )(plus)( |$)/.test(text)) return 'plus';
  return null;
};

const brandKeys = extractBrands(normalized);
const tierKey = extractTier(normalized);
const familyMatch = normalized.match(/(?:iphone|galaxy|redmi|note|poco|moto|motorola|pixel|xiaomi)\\s+([0-9]{1,3})/i);
const familyNumber = familyMatch ? Number(familyMatch[1]) : null;
const storageMatch = normalized.match(/\\b(64|128|256|512|1024)\\b(?:\\s*gb)?\\b/);
const storageValue = storageMatch ? Number(storageMatch[1]) : null;
const modelVariantMatch = normalized.match(/\\b(?:a\\d{1,3}|s\\d{1,3}|g\\d{1,3}|x\\d{1,3}|z\\s?flip\\s?\\d|z\\s?fold\\s?\\d|edge\\s?\\d{1,3}|note\\s?\\d{1,3}|reno\\s?\\d{1,3}|find\\s?x\\d{1,2})\\b/i);
const hasModelVariantToken = Boolean(modelVariantMatch);
const asksPriceDirectly = /(precio|cuanto sale|cu[aá]nto sale|valor|costo|cotizacion|cotizaci[oó]n)/.test(normalized);

const wantsStoreInfo = /(ubicacion|ubicacion|direccion|direccion|sucursal|horario|abren|cierran|medios de pago|medio de pago|envio|envios|warranty|garantia|garantia|como llego|donde estan|donde quedan|retiro)/.test(normalized);

const isFirstContact = recentMessages.length <= 1;
const topCandidateKeys = candidateProducts.slice(0, 3).map((product) => product.product_key).filter(Boolean);

let route_key = 'generic_sales';
let retrieval_scope = 'catalog_broad';
let search_mode = 'brand_browse';
let should_offer_store_url = isFirstContact;
let confidence = 0.72;
let rationale = 'Consulta amplia de ventas.';
let use_info_responder = false;

if (storefrontHandoff && storefrontHandoff.ok === true) {
  route_key = 'storefront_order';
  retrieval_scope = 'storefront_handoff';
  search_mode = 'storefront_handoff';
  confidence = 0.99;
  rationale = 'Se detectó un handoff de pedido web válido.';
  use_info_responder = true;
  should_offer_store_url = false;
} else if (wantsStoreInfo) {
  route_key = 'store_info';
  retrieval_scope = 'store_info';
  search_mode = 'info';
  confidence = 0.9;
  rationale = 'La consulta es sobre ubicación, horarios, pagos, envíos o garantía.';
  use_info_responder = true;
  should_offer_store_url = isFirstContact;
} else if (brandKeys.length > 0 && (familyNumber !== null || storageValue !== null || tierKey !== null || hasModelVariantToken || asksPriceDirectly && candidateProducts.length > 0)) {
  route_key = 'exact_product_quote';
  retrieval_scope = 'catalog_narrow';
  search_mode = 'exact';
  confidence = candidateProducts.length > 0 ? 0.9 : 0.78;
  rationale = 'Consulta con marca y detalles de modelo suficientes para cotización puntual.';
  should_offer_store_url = false;
} else if (brandKeys.length > 0 || tierKey !== null) {
  route_key = 'brand_catalog';
  retrieval_scope = 'catalog_broad';
  search_mode = tierKey ? 'tier_browse' : 'brand_browse';
  confidence = 0.82;
  rationale = 'Consulta de catálogo por marca o línea premium.';
  should_offer_store_url = true;
} else {
  route_key = 'generic_sales';
  retrieval_scope = 'catalog_broad';
  search_mode = 'brand_browse';
  confidence = 0.7;
  rationale = 'Consulta comercial amplia sin producto exacto.';
  should_offer_store_url = isFirstContact;
}

return [{
  json: {
    ...data,
    use_info_responder,
    router_output: {
      route_key,
      confidence,
      retrieval_scope,
      search_mode,
      should_offer_store_url,
      selected_candidate_product_keys: topCandidateKeys,
      rationale,
    },
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Route Turn', type: 'main', index: 0 }]],
      },
    },
  ),
);

const salesResponderSeed = 'techno-v17-sales-responder';
writeWorkflow(
  'TechnoStore_v17_sales_responder.json',
  workflowBase(
    'TechnoStore - v17 Sales Responder',
    [
      triggerNode(salesResponderSeed, [240, 300]),
      codeNode(
        salesResponderSeed,
        'Build Sales Prompt',
        [540, 300],
        `const data = $input.first().json || {};
const context = data.context || {};
const router = data.router_output || {};
const store = context.store || {};
const website = String(store.store_website_url || 'https://puntotechno.com').trim();
const recentMessages = Array.isArray(context.recent_messages) ? context.recent_messages : [];
const candidateProducts = Array.isArray(context.candidate_products) ? context.candidate_products : [];

const curatedCandidates = candidateProducts.slice(0, router.route_key === 'exact_product_quote' ? 3 : 4).map((product) => ({
  product_key: product.product_key,
  product_name: product.product_name,
  condition: product.condition,
  storage_gb: product.storage_gb,
  color: product.color,
  in_stock: product.in_stock,
  delivery_days: product.delivery_days,
  price_ars: product.price_ars,
  promo_price_ars: product.promo_price_ars,
  price_usd: product.price_usd,
  image_url: product.image_url,
}));

const promptPayload = {
  route_key: router.route_key,
  search_mode: router.search_mode,
  should_offer_store_url: router.should_offer_store_url === true,
  first_interaction: recentMessages.length <= 1,
  user_message: String(data.user_message || ''),
  customer: context.customer || {},
  store: {
    store_location_name: store.store_location_name || 'TechnoStore Salta',
    store_address: store.store_address || '',
    store_payment_methods: store.store_payment_methods || '',
    store_shipping_policy: store.store_shipping_policy || '',
    store_warranty_new: store.store_warranty_new || '',
    store_warranty_used: store.store_warranty_used || '',
    store_website_url: website,
  },
  candidate_products: curatedCandidates,
};

const prompt = [
  'Respondé al siguiente turno comercial usando SOLO los datos provistos.',
  'Devolvé SOLO JSON válido.',
  'Esquema esperado:',
  JSON.stringify({
    reply_text: 'string',
    selected_product_keys: ['string'],
    actions: ['attach_store_url'],
    state_delta: {
      intent_key: 'price_inquiry',
      funnel_stage: 'interested',
      lead_score_delta: 8,
      share_store_location: false,
      selected_product_keys: ['string'],
      tags_to_add: ['catalog_interest'],
      tags_to_remove: [],
      payment_method_key: null,
      summary: 'string',
    },
  }),
  'Datos del turno:',
  JSON.stringify(promptPayload, null, 2),
].join('\\n\\n');

return [{
  json: {
    ...data,
    responder_model_name: String($env.GEMINI_MODEL_SALES || 'models/gemini-2.5-flash'),
    chatInput: prompt,
  }
}];`,
      ),
      {
        parameters: {
          options: {
            systemMessage: [
              'Sos el vendedor de WhatsApp de TechnoStore Salta.',
              'Respondé en español natural, humano, breve y comercial. Sin markdown, sin viñetas.',
              'No inventes stock, precios, cuotas, links ni modelos. Usá únicamente los hechos provistos.',
              'Si la consulta es amplia o de primer contacto y should_offer_store_url es true, podés mencionar puntotechno.com una sola vez de forma natural.',
              'Si el usuario pidió un modelo exacto, respondé primero sobre ese modelo. El sitio es secundario.',
              'Cerrá con una sola pregunta concreta si ayuda a avanzar la venta.',
              'Devolvé SOLO JSON válido con las claves: reply_text, selected_product_keys, actions, state_delta.',
              'No agregues explicaciones fuera del JSON.',
            ].join(' '),
            maxIterations: 1,
          },
          promptType: 'define',
          text: '={{ $json.chatInput }}',
        },
        id: stableId(`${salesResponderSeed}:agent`),
        name: 'AI Agent (Sales)',
        type: '@n8n/n8n-nodes-langchain.agent',
        typeVersion: 1.7,
        position: [860, 300],
      },
      {
        parameters: {
          modelName: '={{ $json.responder_model_name || "models/gemini-2.5-flash" }}',
          options: {
            temperature: 0.35,
          },
        },
        id: stableId(`${salesResponderSeed}:gemini-model`),
        name: 'Google Gemini Chat Model',
        type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
        typeVersion: 1,
        position: [860, 520],
        credentials: {
          googlePalmApi: {
            id: 'kaLPLSecsHfc5vlx',
            name: 'Google Gemini(PaLM) Api account',
          },
        },
      },
      codeNode(
        salesResponderSeed,
        'Normalize Sales Response',
        [1160, 300],
        `const base = $('Build Sales Prompt').first().json || {};
const raw = $input.first().json || {};

const fallbackExactCandidate = Array.isArray(base.context?.candidate_products) ? base.context.candidate_products[0] : null;
const rawText = String(raw.output || raw.text || '').trim();

let parsed = null;
try {
  parsed = JSON.parse(rawText);
} catch (error) {
  const match = rawText.match(/\\{[\\s\\S]*\\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch (innerError) {
      parsed = null;
    }
  }
}

const fallbackReply = (() => {
  if (base.router_output?.route_key === 'exact_product_quote' && fallbackExactCandidate) {
    const priceArs = fallbackExactCandidate.promo_price_ars || fallbackExactCandidate.price_ars;
    return 'Sí, tengo ' + fallbackExactCandidate.product_name + '. Queda en ARS ' + priceArs + '. Si querés, te confirmo disponibilidad y te digo cuál te conviene más.';
  }
  return 'Sí, te ayudo por acá. Si querés también podés mirar todo el catálogo en https://puntotechno.com. ¿Qué modelo o presupuesto tenés en mente?';
})();

const selected = Array.isArray(parsed?.selected_product_keys) ? parsed.selected_product_keys : [];
const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
const stateDelta = parsed?.state_delta && typeof parsed.state_delta === 'object' ? parsed.state_delta : {};
const replyText = String(parsed?.reply_text || fallbackReply).replace(/\\s+/g, ' ').trim();

return [{
  json: {
    ...base,
    responder_output: {
      route_key: base.router_output?.route_key || 'generic_sales',
      reply_text: replyText,
      selected_product_keys: selected,
      actions,
      state_delta: stateDelta,
    },
    responder_provider_name: 'google',
    responder_model_name: base.responder_model_name || 'gemini-2.5-flash',
    responder_raw_text: rawText,
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Build Sales Prompt', type: 'main', index: 0 }]],
      },
      'Build Sales Prompt': {
        main: [[{ node: 'AI Agent (Sales)', type: 'main', index: 0 }]],
      },
      'AI Agent (Sales)': {
        main: [[{ node: 'Normalize Sales Response', type: 'main', index: 0 }]],
      },
      'Google Gemini Chat Model': {
        ai_languageModel: [[{ node: 'AI Agent (Sales)', type: 'ai_languageModel', index: 0 }]],
      },
    },
  ),
);

const infoResponderSeed = 'techno-v17-info-responder';
writeWorkflow(
  'TechnoStore_v17_info_responder.json',
  workflowBase(
    'TechnoStore - v17 Info Responder',
    [
      triggerNode(infoResponderSeed, [240, 300]),
      codeNode(
        infoResponderSeed,
        'Build Info Response',
        [560, 300],
        `const data = $input.first().json || {};
const context = data.context || {};
const router = data.router_output || {};
const store = context.store || {};
const website = String(store.store_website_url || 'https://puntotechno.com').trim();
const message = String(data.user_message || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^a-z0-9\\s]/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();

const wantsLocation = /(ubicacion|direccion|sucursal|como llego|donde estan|donde quedan|mapa)/.test(message);
const wantsHours = /(horario|abren|cierran|hora)/.test(message);
const wantsPayments = /(pago|pagos|cuotas|tarjeta|transferencia|efectivo|crypto|mercado pago)/.test(message);
const wantsShipping = /(envio|envios|despacho|retiro)/.test(message);
const wantsWarranty = /(garantia|warranty)/.test(message);

const formatArs = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount);
};

let replyText = '';
let actions = [];
let stateDelta = {
  intent_key: 'store_info',
  funnel_stage: 'browsing',
  lead_score_delta: 2,
  share_store_location: false,
  selected_product_keys: [],
  tags_to_add: [],
  tags_to_remove: [],
  payment_method_key: null,
  summary: 'Respuesta de información general.',
};

switch (router.route_key) {
  case 'storefront_order': {
    const order = context.storefront_handoff?.order;
    if (order) {
      const totalText = formatArs(order.subtotal);
      replyText = 'Perfecto, ya tomé tu pedido web #' + order.id + '. Veo ' + (order.item_count || 0) + ' producto(s)' + (totalText ? ' por ARS ' + totalText : '') + '. Seguimos por acá con la gestión. Si ya hiciste el pago, mandame el comprobante por este chat.';
    } else {
      replyText = 'Perfecto, seguimos con tu pedido web por acá. Si querés, pasame el número de pedido o el comprobante y lo revisamos.';
    }
    stateDelta.intent_key = 'storefront_order';
    stateDelta.funnel_stage = 'closing';
    stateDelta.lead_score_delta = 10;
    stateDelta.summary = 'Seguimiento de pedido web por WhatsApp.';
    break;
  }
  case 'store_info':
  default: {
    const parts = [];
    if (wantsLocation || (!wantsHours && !wantsPayments && !wantsShipping && !wantsWarranty)) {
      if (store.store_address) parts.push('Estamos en ' + store.store_address + '.');
      stateDelta.share_store_location = wantsLocation;
    }
    if (wantsHours && store.store_hours) parts.push('Horario: ' + store.store_hours);
    if (wantsPayments && store.store_payment_methods) parts.push('Medios de pago: ' + store.store_payment_methods);
    if (wantsShipping && store.store_shipping_policy) parts.push('Envíos: ' + store.store_shipping_policy);
    if (wantsWarranty) {
      if (store.store_warranty_new) parts.push('Nuevos: ' + store.store_warranty_new);
      if (store.store_warranty_used) parts.push('Usados: ' + store.store_warranty_used);
    }
    if (router.should_offer_store_url) {
      parts.push('Si querés ver todo el catálogo, también lo tenés en ' + website + '.');
      actions = ['attach_store_url'];
    }
    parts.push('Si querés, decime qué modelo buscás y te oriento por acá.');
    replyText = parts.join(' ');
    stateDelta.intent_key = 'store_info';
    stateDelta.funnel_stage = 'browsing';
    stateDelta.lead_score_delta = 2;
    stateDelta.summary = 'Respuesta de información general de la tienda.';
    break;
  }
}

return [{
  json: {
    ...data,
    responder_output: {
      route_key: router.route_key || 'store_info',
      reply_text: replyText,
      selected_product_keys: [],
      actions,
      state_delta: stateDelta,
    },
    responder_provider_name: 'deterministic',
    responder_model_name: 'deterministic-info',
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Build Info Response', type: 'main', index: 0 }]],
      },
    },
  ),
);

const validatorSeed = 'techno-v17-validator';
writeWorkflow(
  'TechnoStore_v17_validator.json',
  workflowBase(
    'TechnoStore - v17 Validator',
    [
      triggerNode(validatorSeed, [260, 300]),
      codeNode(
        validatorSeed,
        'Validate Response',
        [620, 300],
        `const data = $input.first().json || {};
const context = data.context || {};
const router = data.router_output || {};
const responder = data.responder_output || {};

const candidateProducts = Array.isArray(context.candidate_products) ? context.candidate_products : [];
const candidateMap = new Map(candidateProducts.map((product) => [product.product_key, product]));
const website = String(context.store?.store_website_url || 'https://puntotechno.com').trim();

const unique = (values) => [...new Set(values.filter(Boolean))];
const allowedActions = new Set([
  'attach_store_url',
  'attach_product_images',
  'share_store_location',
  'no_reply',
]);

const stripUnexpectedUrls = (text, allowedUrl) =>
  String(text || '')
    .replace(/https?:\\/\\/\\S+/gi, (url) => {
      if (!allowedUrl) return '';
      return url.includes(allowedUrl.replace(/^https?:\\/\\//, '')) ? url : '';
    })
    .replace(/\\s+/g, ' ')
    .trim();

let selectedProductKeys = unique(Array.isArray(responder.selected_product_keys) ? responder.selected_product_keys : []).filter((key) => candidateMap.has(key));
if (router.route_key === 'exact_product_quote' && selectedProductKeys.length === 0 && candidateProducts[0]?.product_key) {
  selectedProductKeys = [candidateProducts[0].product_key];
}

const actionList = unique(Array.isArray(responder.actions) ? responder.actions : []).filter((action) => allowedActions.has(action));
const defaultIntentByRoute = {
  storefront_order: 'storefront_order',
  exact_product_quote: 'price_inquiry',
  brand_catalog: 'catalog_browse',
  generic_sales: 'greeting',
  store_info: 'store_info',
};

const defaultStageByRoute = {
  storefront_order: 'closing',
  exact_product_quote: 'interested',
  brand_catalog: 'browsing',
  generic_sales: 'browsing',
  store_info: 'browsing',
};

const stateDelta = responder.state_delta && typeof responder.state_delta === 'object' ? responder.state_delta : {};
const finalStateDelta = {
  intent_key: String(stateDelta.intent_key || defaultIntentByRoute[router.route_key] || 'unknown'),
  funnel_stage: String(stateDelta.funnel_stage || defaultStageByRoute[router.route_key] || 'browsing'),
  lead_score_delta: Number.isFinite(Number(stateDelta.lead_score_delta)) ? Number(stateDelta.lead_score_delta) : 0,
  share_store_location: stateDelta.share_store_location === true,
  selected_product_keys: unique(Array.isArray(stateDelta.selected_product_keys) ? stateDelta.selected_product_keys : []).filter((key) => candidateMap.has(key)),
  tags_to_add: unique(Array.isArray(stateDelta.tags_to_add) ? stateDelta.tags_to_add : []),
  tags_to_remove: unique(Array.isArray(stateDelta.tags_to_remove) ? stateDelta.tags_to_remove : []),
  payment_method_key: stateDelta.payment_method_key ?? null,
  summary: String(stateDelta.summary || router.rationale || 'Turno procesado').slice(0, 240),
};

if (selectedProductKeys.length > 0 && finalStateDelta.selected_product_keys.length === 0) {
  finalStateDelta.selected_product_keys = [...selectedProductKeys];
}

const allowStoreUrlInReply = ['brand_catalog', 'generic_sales', 'store_info'].includes(router.route_key);
let replyText = stripUnexpectedUrls(responder.reply_text || '', allowStoreUrlInReply ? website : '');
const validationErrors = [];
const validationWarnings = [];

if (!replyText) {
  validationWarnings.push({
    code: 'empty_reply_text',
    message: 'La respuesta del responder llegó vacía y se aplicó un fallback.',
    field: 'reply_text',
  });

  if (router.route_key === 'exact_product_quote' && candidateProducts[0]) {
    const product = candidateProducts[0];
    const priceArs = product.promo_price_ars || product.price_ars;
    replyText = 'Sí, tengo ' + product.product_name + '. Queda en ARS ' + priceArs + '. Si querés, te confirmo disponibilidad y vemos cuál te conviene más.';
  } else if (router.route_key === 'store_info') {
    replyText = 'Sí, te ayudo por acá. Si querés mirar todo el catálogo, lo tenés en ' + website + '. ¿Qué modelo buscás?';
  } else {
    replyText = 'Sí, te ayudo por acá. Contame qué modelo o presupuesto tenés en mente y lo vemos juntos.';
  }
}

const shouldOfferStoreUrl = router.should_offer_store_url === true && ['brand_catalog', 'generic_sales', 'store_info'].includes(router.route_key);
if (shouldOfferStoreUrl && !/puntotechno\\.com/i.test(replyText)) {
  const appendText = router.route_key === 'generic_sales'
    ? ' Si querés mirar todo el catálogo, también lo tenés en ' + website + '.'
    : ' También podés ver todo el catálogo en ' + website + '.';
  replyText = (replyText + appendText).replace(/\\s+/g, ' ').trim();
}

if (router.route_key === 'exact_product_quote') {
  replyText = replyText
    .replace(/(?:si queres|si querés)?\\s*tambien pod[eé]s ver todo el cat[aá]logo en\\s*https?:\\/\\/[^\\s]+\\.?/gi, '')
    .replace(/(?:si queres|si querés)?\\s*pod[eé]s mirar todo el cat[aá]logo en\\s*https?:\\/\\/[^\\s]+\\.?/gi, '')
    .replace(/https?:\\/\\/[^\\s]+/gi, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

replyText = replyText.slice(0, 1100).trim();

const replyMessages = [{ type: 'text', text: replyText }];
const shouldSend = !actionList.includes('no_reply');

return [{
  json: {
    ...data,
    bot_message_text: replyText,
    should_send: shouldSend,
    wa_messages: replyMessages,
    validator_output: {
      approved: validationErrors.length === 0,
      reply_messages: replyMessages,
      selected_product_keys: selectedProductKeys,
      actions: actionList,
      final_state_delta: finalStateDelta,
      validation_errors: validationErrors,
      validation_warnings: validationWarnings,
      fallback_reason: validationWarnings.length > 0 ? validationWarnings[0].code : null,
    },
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Validate Response', type: 'main', index: 0 }]],
      },
    },
  ),
);

const stateUpdateSeed = 'techno-v17-state-update';
writeWorkflow(
  'TechnoStore_v17_state_update.json',
  workflowBase(
    'TechnoStore - v17 State Update',
    [
      triggerNode(stateUpdateSeed, [240, 320]),
      codeNode(
        stateUpdateSeed,
        'Build Update Payload',
        [560, 320],
        `const data = $input.first().json || {};
const context = data.context || {};
const router = data.router_output || {};
const validator = data.validator_output || {};
const state = validator.final_state_delta || {};

const now = new Date().toISOString();
const currentTags = Array.isArray(context.customer?.tags) ? context.customer.tags : [];
const unique = (values) => [...new Set(values.filter(Boolean))];
const mergedTags = unique([
  ...currentTags,
  ...(Array.isArray(state.tags_to_add) ? state.tags_to_add : []),
]).filter((tag) => !(Array.isArray(state.tags_to_remove) ? state.tags_to_remove : []).includes(tag));

const currentLeadScore = Number(context.customer?.lead_score || 0);
const nextLeadScore = Math.max(0, Math.min(100, currentLeadScore + Number(state.lead_score_delta || 0)));
const selectedProductKeys = Array.isArray(validator.selected_product_keys) ? validator.selected_product_keys : [];

const updates = {
  last_bot_interaction: now,
  updated_at: now,
  last_intent: state.intent_key || null,
  funnel_stage: state.funnel_stage || null,
  lead_score: nextLeadScore,
  tags: mergedTags,
};

if (selectedProductKeys[0]) {
  updates.interested_product = selectedProductKeys[0];
}

if (state.payment_method_key) {
  updates.payment_method_last = state.payment_method_key;
}

const brandList = unique(selectedProductKeys
  .map((key) => {
    const product = (Array.isArray(context.candidate_products) ? context.candidate_products : []).find((item) => item.product_key === key);
    return product?.brand_key || null;
  })
  .filter(Boolean));

if (brandList.length > 0) {
  const currentBrands = Array.isArray(context.customer?.brands_mentioned) ? context.customer.brands_mentioned : [];
  updates.brands_mentioned = unique([...brandList, ...currentBrands]).slice(0, 10);
}

const conversationSummary = String(state.summary || router.rationale || 'Turno procesado').slice(0, 220);
const conversationInsights = unique([
  'Ruta ' + String(router.route_key || 'unknown'),
  ...selectedProductKeys.slice(0, 3).map((key) => 'Producto ' + key),
]).slice(0, 8);

const botMessageRow = data.should_send === true ? {
  manychat_id: data.subscriber_id,
  customer_id: context.customer?.customer_id || null,
  role: 'bot',
  message: data.bot_message_text || '',
  message_type: 'text',
  intent_detected: state.intent_key || null,
  products_mentioned: selectedProductKeys,
  triggered_human: false,
  was_audio: false,
  channel: 'manychat',
  external_message_id: null,
  whatsapp_phone_number_id: null,
  applied_tags: Array.isArray(state.tags_to_add) ? state.tags_to_add : [],
  payment_methods_detected: state.payment_method_key ? [state.payment_method_key] : [],
  brands_detected: brandList,
  topics_detected: [String(router.route_key || 'generic_sales')],
  funnel_stage_after: state.funnel_stage || null,
  conversation_summary: conversationSummary,
  conversation_insights: conversationInsights,
  lead_score_after: nextLeadScore,
} : null;

const turnRow = {
  workflow_version: 'v17',
  provider_name: data.responder_provider_name || 'deterministic',
  model_name: data.responder_model_name || 'deterministic',
  manychat_id: data.subscriber_id,
  customer_id: context.customer?.customer_id || null,
  route_key: router.route_key || 'generic_sales',
  user_message: data.user_message || '',
  context_payload: context,
  router_payload: router,
  responder_payload: data.responder_output || {},
  validator_payload: validator,
  state_delta: state,
  selected_product_keys: selectedProductKeys,
  validation_errors: Array.isArray(validator.validation_errors) ? validator.validation_errors.map((item) => item.code || item.message).filter(Boolean) : [],
  success: data.should_send !== false,
  failure_reason: null,
};

return [{
  json: {
    ...data,
    customer_updates: updates,
    bot_message_row: botMessageRow,
    ai_turn_row: turnRow,
  }
}];`,
      ),
      httpNode(
        stateUpdateSeed,
        'Update Customer',
        [880, 160],
        {
          method: 'PATCH',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/customers?manychat_id=eq.{{ $("Build Update Payload").first().json.subscriber_id }}',
          sendHeaders: true,
          headerParameters: supabaseHeaders(true),
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($("Build Update Payload").first().json.customer_updates) }}',
          options: {
            timeout: 10000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      httpNode(
        stateUpdateSeed,
        'Save Bot Message',
        [880, 320],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/conversations',
          sendHeaders: true,
          headerParameters: supabaseHeaders(true),
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($("Build Update Payload").first().json.bot_message_row || {}) }}',
          options: {
            timeout: 5000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      httpNode(
        stateUpdateSeed,
        'Log AI Turn',
        [880, 480],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/ai_workflow_turns',
          sendHeaders: true,
          headerParameters: supabaseHeaders(true),
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($("Build Update Payload").first().json.ai_turn_row) }}',
          options: {
            timeout: 5000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      codeNode(
        stateUpdateSeed,
        'Return Result',
        [1180, 320],
        `const base = $('Build Update Payload').first().json || {};

return [{
  json: {
    ...base,
    state_update_status: 'ok',
  }
}];`,
      ),
    ],
    {
      'When Executed by Another Workflow': {
        main: [[{ node: 'Build Update Payload', type: 'main', index: 0 }]],
      },
      'Build Update Payload': {
        main: [
          [{ node: 'Update Customer', type: 'main', index: 0 }],
          [{ node: 'Save Bot Message', type: 'main', index: 0 }],
          [{ node: 'Log AI Turn', type: 'main', index: 0 }],
        ],
      },
      'Update Customer': {
        main: [[{ node: 'Return Result', type: 'main', index: 0 }]],
      },
      'Save Bot Message': {
        main: [[{ node: 'Return Result', type: 'main', index: 0 }]],
      },
      'Log AI Turn': {
        main: [[{ node: 'Return Result', type: 'main', index: 0 }]],
      },
    },
  ),
);

const entrySeed = 'techno-v17-entry';
writeWorkflow(
  'TechnoStore_v17_entry.json',
  workflowBase(
    'TechnoStore - AI Sales Agent v17',
    [
      webhookNode(entrySeed, [-880, 280], 'techno-sales-v17'),
      codeNode(
        entrySeed,
        'Parse Input',
        [-620, 280],
        `const raw = $input.first().json;
const body = raw.body || raw || {};

const toBool = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'si', 'sí', 'y'].includes(normalized);
};

const getCustomField = (fields, key) => {
  if (Array.isArray(fields)) {
    const hit = fields.find((item) => item?.name === key || item?.key === key || item?.field_name === key);
    return hit?.value ?? '';
  }
  if (fields && typeof fields === 'object') {
    return fields[key] ?? '';
  }
  return '';
};

const subscriberId = String(body.subscriber_id || body.id || '');
const message = String(body.message || body.last_input_text || '').trim();
const customFields = body.custom_fields || {};
const storefrontOrderMatch = message.match(/pedido\\s+web\\s*#?\\s*(\\d+)[^\\n]*?\\btoken\\b\\s*([a-z0-9_-]{8,64})/i) || message.match(/#(\\d+)[^\\n]*?\\btoken\\b\\s*([a-z0-9_-]{8,64})/i);
const storefrontOrderId = storefrontOrderMatch ? Number(storefrontOrderMatch[1]) : null;
const storefrontOrderToken = storefrontOrderMatch ? String(storefrontOrderMatch[2] || '').trim().toLowerCase() : '';

return [{
  json: {
    subscriber_id: subscriberId,
    first_name: body.first_name || 'amigo',
    last_name: body.last_name || '',
    phone: body.whatsapp_phone || body.phone || '',
    timezone: body.timezone || '',
    channel: 'manychat',
    city: getCustomField(customFields, 'city'),
    funnel_stage: getCustomField(customFields, 'funnel_stage'),
    interested_product: getCustomField(customFields, 'interested_product'),
    is_human_active: toBool(getCustomField(customFields, 'is_human_active')),
    raw_message: message,
    is_audio: message.startsWith('https://') && (message.includes('fbsbx.com') || message.includes('fbcdn.net') || message.includes('manybot-files.s3')),
    is_empty: !message,
    storefront_order_id: Number.isFinite(storefrontOrderId) ? storefrontOrderId : null,
    storefront_order_token: storefrontOrderToken || '',
  }
}];`,
      ),
      ifNode(entrySeed, 'Is Audio?', [-380, 280], '={{ $json.is_audio }}'),
      httpNode(
        entrySeed,
        'Download Audio',
        [-120, 120],
        {
          url: '={{ $json.raw_message }}',
          options: {
            response: {
              responseFormat: 'file',
              outputPropertyName: 'data',
            },
            timeout: 15000,
          },
        },
        {
          continueOnFail: true,
        },
      ),
      httpNode(
        entrySeed,
        'Groq Whisper Transcribe',
        [120, 120],
        {
          method: 'POST',
          url: 'https://api.groq.com/openai/v1/audio/transcriptions',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          sendBody: true,
          contentType: 'multipart-form-data',
          bodyParameters: {
            parameters: [
              {
                parameterType: 'formBinaryData',
                name: 'file',
                inputDataFieldName: 'data',
              },
              {
                name: 'model',
                value: 'whisper-large-v3-turbo',
              },
              {
                name: 'language',
                value: 'es',
              },
              {
                name: 'response_format',
                value: 'json',
              },
            ],
          },
          options: {
            timeout: 15000,
          },
        },
        {
          credentials: {
            httpHeaderAuth: {
              id: 'mw4ftZwdAxSdWFjU',
              name: 'Groq Whisper',
            },
          },
          continueOnFail: true,
        },
      ),
      codeNode(
        entrySeed,
        'Merge Input',
        [380, 280],
        `const parsed = $('Parse Input').first().json;
let userMessage = String(parsed.raw_message || '');
let wasAudio = false;

try {
  const whisper = $('Groq Whisper Transcribe').first().json;
  if (whisper && typeof whisper === 'object' && whisper.text) {
    userMessage = String(whisper.text).trim();
    wasAudio = true;
  }
} catch (error) {
  wasAudio = false;
}

return [{
  json: {
    ...parsed,
    user_message: userMessage.trim() || '(vacío)',
    was_audio: wasAudio,
  }
}];`,
      ),
      httpNode(
        entrySeed,
        'Upsert Customer',
        [660, 280],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/rpc/upsert_customer',
          sendHeaders: true,
          headerParameters: supabaseHeaders(true),
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ p_manychat_id: String($json.subscriber_id || ""), p_phone: String($json.phone || ""), p_whatsapp_phone: String($json.phone || ""), p_first_name: String($json.first_name || ""), p_last_name: String($json.last_name || ""), p_timezone: String($json.timezone || "") }) }}',
          options: {
            timeout: 5000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      codeNode(
        entrySeed,
        'Attach Customer Id',
        [940, 280],
        `const base = $('Merge Input').first().json || {};
const raw = $input.first().json;

const rows = Array.isArray(raw) ? raw : [raw];
const first = rows[0] || {};
const rawId = first.upsert_customer ?? first.customer_id ?? first.id ?? raw?.upsert_customer ?? raw?.customer_id ?? raw?.id ?? null;
const customerId = Number(rawId);

return [{
  json: {
    ...base,
    customer_id: Number.isFinite(customerId) ? customerId : null,
  }
}];`,
      ),
      httpNode(
        entrySeed,
        'Save Incoming Message',
        [1220, 280],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/conversations',
          sendHeaders: true,
          headerParameters: supabaseHeaders(true),
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ manychat_id: String($json.subscriber_id), customer_id: $json.customer_id || null, role: "user", message: $json.user_message || "(vacío)", message_type: $json.was_audio ? "audio" : "text", was_audio: $json.was_audio || false, audio_transcription: $json.was_audio ? $json.user_message : null, intent_detected: null, products_mentioned: [], triggered_human: false, channel: "manychat", external_message_id: null, whatsapp_phone_number_id: null }) }}',
          options: {
            timeout: 5000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      codeNode(
        entrySeed,
        'Attach Saved Message',
        [1500, 280],
        `const base = $('Attach Customer Id').first().json || {};
const raw = $input.first().json;

let savedMessageId = null;
if (Array.isArray(raw) && raw[0]?.id != null) savedMessageId = raw[0].id;
if (!savedMessageId && raw && typeof raw === 'object' && raw.id != null) savedMessageId = raw.id;

return [{
  json: {
    ...base,
    saved_message_id: savedMessageId,
  }
}];`,
      ),
      codeNode(
        entrySeed,
        'Wait 8s Debounce',
        [1780, 280],
        `const item = $input.first().json;
await new Promise((resolve) => setTimeout(resolve, 8000));
return [{ json: item }];`,
      ),
      httpNode(
        entrySeed,
        'Check Is Latest (RPC)',
        [2060, 280],
        {
          method: 'POST',
          url: '={{ $env.SUPABASE_URL }}/rest/v1/rpc/check_is_latest_message',
          sendHeaders: true,
          headerParameters: supabaseHeaders(false),
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ p_manychat_id: $json.subscriber_id, p_message_id: $json.saved_message_id || 0 }) }}',
          options: {
            timeout: 5000,
          },
        },
        {
          continueOnFail: true,
          alwaysOutputData: true,
        },
      ),
      codeNode(
        entrySeed,
        'Debounce Check',
        [2340, 280],
        `const base = $('Wait 8s Debounce').first().json || {};
const rpcResult = $input.first().json;

let isLatest = false;
if (typeof rpcResult === 'boolean') {
  isLatest = rpcResult;
} else if (Array.isArray(rpcResult) && rpcResult.length > 0) {
  isLatest = rpcResult[0] === true || rpcResult[0]?.check_is_latest_message === true;
} else if (rpcResult && typeof rpcResult === 'object') {
  isLatest = rpcResult.check_is_latest_message === true || rpcResult.result === true;
}

return [{
  json: {
    ...base,
    should_continue: isLatest === true && !base.is_empty,
  }
}];`,
      ),
      ifNode(entrySeed, 'Is Latest?', [2600, 280], '={{ $json.should_continue }}'),
      executeWorkflowNode(
        entrySeed,
        'Execute Context Builder',
        [2900, 280],
        'TechnoStore - v17 Context Builder',
        'RELINK_CONTEXT_BUILDER',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          first_name: '={{ $json.first_name }}',
          last_name: '={{ $json.last_name }}',
          phone: '={{ $json.phone }}',
          timezone: '={{ $json.timezone }}',
          channel: '={{ $json.channel }}',
          user_message: '={{ $json.user_message }}',
          raw_message: '={{ $json.raw_message }}',
          was_audio: '={{ $json.was_audio }}',
          storefront_order_id: '={{ $json.storefront_order_id }}',
          storefront_order_token: '={{ $json.storefront_order_token }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'first_name', displayName: 'first_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'last_name', displayName: 'last_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'timezone', displayName: 'timezone', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'raw_message', displayName: 'raw_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'was_audio', displayName: 'was_audio', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' },
          { id: 'storefront_order_id', displayName: 'storefront_order_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'storefront_order_token', displayName: 'storefront_order_token', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        ],
      ),
      executeWorkflowNode(
        entrySeed,
        'Execute Router',
        [3200, 280],
        'TechnoStore - v17 Router',
        'RELINK_ROUTER',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          user_message: '={{ $json.user_message }}',
          context: '={{ $json.context }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'context', displayName: 'context', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        ],
      ),
      ifNode(entrySeed, 'Use Info Responder?', [3480, 280], '={{ $json.use_info_responder }}'),
      executeWorkflowNode(
        entrySeed,
        'Execute Info Responder',
        [3780, 120],
        'TechnoStore - v17 Info Responder',
        'RELINK_INFO_RESPONDER',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          user_message: '={{ $json.user_message }}',
          context: '={{ $json.context }}',
          router_output: '={{ $json.router_output }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'context', displayName: 'context', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'router_output', displayName: 'router_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        ],
      ),
      executeWorkflowNode(
        entrySeed,
        'Execute Sales Responder',
        [3780, 440],
        'TechnoStore - v17 Sales Responder',
        'RELINK_SALES_RESPONDER',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          user_message: '={{ $json.user_message }}',
          context: '={{ $json.context }}',
          router_output: '={{ $json.router_output }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'context', displayName: 'context', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'router_output', displayName: 'router_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        ],
      ),
      executeWorkflowNode(
        entrySeed,
        'Execute Validator',
        [4080, 280],
        'TechnoStore - v17 Validator',
        'RELINK_VALIDATOR',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          user_message: '={{ $json.user_message }}',
          context: '={{ $json.context }}',
          router_output: '={{ $json.router_output }}',
          responder_output: '={{ $json.responder_output }}',
          responder_provider_name: '={{ $json.responder_provider_name }}',
          responder_model_name: '={{ $json.responder_model_name }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'context', displayName: 'context', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'router_output', displayName: 'router_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'responder_output', displayName: 'responder_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'responder_provider_name', displayName: 'responder_provider_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'responder_model_name', displayName: 'responder_model_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        ],
      ),
      ifNode(entrySeed, 'Should Send?', [4360, 280], '={{ $json.should_send }}'),
      codeNode(
        entrySeed,
        'Prepare WhatsApp Payload',
        [4640, 120],
        `const data = $('Execute Validator').first().json || {};
const messages = Array.isArray(data.wa_messages) ? data.wa_messages : [{ type: 'text', text: data.bot_message_text || '' }];
const waMessages = messages.map((message) => {
  if (message.type === 'image') {
    return {
      type: 'image',
      url: message.image_url || message.url,
      image_url: message.image_url || message.url,
    };
  }
  return {
    type: 'text',
    text: String(message.text || '').trim(),
  };
}).filter((message) => (message.type === 'text' ? message.text : message.url));

return [{
  json: {
    ...data,
    payload: {
      subscriber_id: data.subscriber_id,
      data: {
        version: 'v2',
        content: {
          type: 'whatsapp',
          messages: waMessages,
        },
      },
    },
  }
}];`,
      ),
      httpNode(
        entrySeed,
        'Send to WhatsApp',
        [4920, 120],
        {
          method: 'POST',
          url: 'https://api.manychat.com/fb/sending/sendContent',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json.payload) }}',
          options: {
            timeout: 30000,
          },
        },
        {
          credentials: {
            httpHeaderAuth: {
              id: 'dTDdJWgAz1yrPfPe',
              name: 'ManyChat API',
            },
          },
        },
      ),
      codeNode(
        entrySeed,
        'Build Sent State Input',
        [5200, 120],
        `const data = $('Prepare WhatsApp Payload').first().json || {};
const sendResponse = $input.first().json || {};

return [{
  json: {
    ...data,
    send_result: {
      attempted: true,
      response: sendResponse,
      sent_at: new Date().toISOString(),
    },
  }
}];`,
      ),
      codeNode(
        entrySeed,
        'Build Skipped State Input',
        [4640, 440],
        `const data = $('Execute Validator').first().json || {};

return [{
  json: {
    ...data,
    send_result: {
      attempted: false,
      skipped: true,
      sent_at: new Date().toISOString(),
    },
  }
}];`,
      ),
      executeWorkflowNode(
        entrySeed,
        'Execute State Update',
        [5480, 280],
        'TechnoStore - v17 State Update',
        'RELINK_STATE_UPDATE',
        {
          subscriber_id: '={{ $json.subscriber_id }}',
          customer_id: '={{ $json.customer_id }}',
          user_message: '={{ $json.user_message }}',
          context: '={{ $json.context }}',
          router_output: '={{ $json.router_output }}',
          responder_output: '={{ $json.responder_output }}',
          responder_provider_name: '={{ $json.responder_provider_name }}',
          responder_model_name: '={{ $json.responder_model_name }}',
          validator_output: '={{ $json.validator_output }}',
          should_send: '={{ $json.should_send }}',
          bot_message_text: '={{ $json.bot_message_text }}',
          send_result: '={{ $json.send_result }}',
        },
        [
          { id: 'subscriber_id', displayName: 'subscriber_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'number' },
          { id: 'user_message', displayName: 'user_message', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'context', displayName: 'context', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'router_output', displayName: 'router_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'responder_output', displayName: 'responder_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'responder_provider_name', displayName: 'responder_provider_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'responder_model_name', displayName: 'responder_model_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'validator_output', displayName: 'validator_output', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
          { id: 'should_send', displayName: 'should_send', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' },
          { id: 'bot_message_text', displayName: 'bot_message_text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'send_result', displayName: 'send_result', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        ],
      ),
    ],
    {
      Webhook: {
        main: [[{ node: 'Parse Input', type: 'main', index: 0 }]],
      },
      'Parse Input': {
        main: [[{ node: 'Is Audio?', type: 'main', index: 0 }]],
      },
      'Is Audio?': {
        main: [
          [{ node: 'Download Audio', type: 'main', index: 0 }],
          [{ node: 'Merge Input', type: 'main', index: 0 }],
        ],
      },
      'Download Audio': {
        main: [[{ node: 'Groq Whisper Transcribe', type: 'main', index: 0 }]],
      },
      'Groq Whisper Transcribe': {
        main: [[{ node: 'Merge Input', type: 'main', index: 0 }]],
      },
      'Merge Input': {
        main: [[{ node: 'Upsert Customer', type: 'main', index: 0 }]],
      },
      'Upsert Customer': {
        main: [[{ node: 'Attach Customer Id', type: 'main', index: 0 }]],
      },
      'Attach Customer Id': {
        main: [[{ node: 'Save Incoming Message', type: 'main', index: 0 }]],
      },
      'Save Incoming Message': {
        main: [[{ node: 'Attach Saved Message', type: 'main', index: 0 }]],
      },
      'Attach Saved Message': {
        main: [[{ node: 'Wait 8s Debounce', type: 'main', index: 0 }]],
      },
      'Wait 8s Debounce': {
        main: [[{ node: 'Check Is Latest (RPC)', type: 'main', index: 0 }]],
      },
      'Check Is Latest (RPC)': {
        main: [[{ node: 'Debounce Check', type: 'main', index: 0 }]],
      },
      'Debounce Check': {
        main: [[{ node: 'Is Latest?', type: 'main', index: 0 }]],
      },
      'Is Latest?': {
        main: [
          [{ node: 'Execute Context Builder', type: 'main', index: 0 }],
          [],
        ],
      },
      'Execute Context Builder': {
        main: [[{ node: 'Execute Router', type: 'main', index: 0 }]],
      },
      'Execute Router': {
        main: [[{ node: 'Use Info Responder?', type: 'main', index: 0 }]],
      },
      'Use Info Responder?': {
        main: [
          [{ node: 'Execute Info Responder', type: 'main', index: 0 }],
          [{ node: 'Execute Sales Responder', type: 'main', index: 0 }],
        ],
      },
      'Execute Info Responder': {
        main: [[{ node: 'Execute Validator', type: 'main', index: 0 }]],
      },
      'Execute Sales Responder': {
        main: [[{ node: 'Execute Validator', type: 'main', index: 0 }]],
      },
      'Execute Validator': {
        main: [[{ node: 'Should Send?', type: 'main', index: 0 }]],
      },
      'Should Send?': {
        main: [
          [{ node: 'Prepare WhatsApp Payload', type: 'main', index: 0 }],
          [{ node: 'Build Skipped State Input', type: 'main', index: 0 }],
        ],
      },
      'Prepare WhatsApp Payload': {
        main: [[{ node: 'Send to WhatsApp', type: 'main', index: 0 }]],
      },
      'Send to WhatsApp': {
        main: [[{ node: 'Build Sent State Input', type: 'main', index: 0 }]],
      },
      'Build Sent State Input': {
        main: [[{ node: 'Execute State Update', type: 'main', index: 0 }]],
      },
      'Build Skipped State Input': {
        main: [[{ node: 'Execute State Update', type: 'main', index: 0 }]],
      },
    },
  ),
);

console.log('Generated V17 workflows in', OUTPUT_DIR);
