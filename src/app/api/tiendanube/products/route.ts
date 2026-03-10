import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Product } from "@/types/database";

export const dynamic = "force-dynamic";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type TiendaNubeLocalized = Record<string, string | null | undefined> | string | null | undefined;

type TiendaNubeImage = {
  src?: string | null;
  alt?: JsonValue;
} & Record<string, JsonValue>;

type TiendaNubeVariant = {
  price?: string | number | null;
  promotional_price?: string | number | null;
  stock?: number | string | null;
  stock_management?: boolean | null;
  sku?: string | null;
} & Record<string, JsonValue>;

type TiendaNubeProductApi = {
  id?: number | string | null;
  name?: TiendaNubeLocalized;
  description?: TiendaNubeLocalized;
  handle?: TiendaNubeLocalized;
  seo_title?: TiendaNubeLocalized;
  seo_description?: TiendaNubeLocalized;
  brand?: string | null;
  published?: boolean | null;
  free_shipping?: boolean | null;
  requires_shipping?: boolean | null;
  has_stock?: boolean | null;
  canonical_url?: string | null;
  video_url?: string | null;
  tags?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  images?: TiendaNubeImage[] | null;
  variants?: TiendaNubeVariant[] | null;
  attributes?: JsonValue[] | null;
  categories?: JsonValue[] | null;
} & Record<string, JsonValue>;

type TiendaNubeProductRow = {
  id: string;
  name: string;
  handle: string;
  brand: string | null;
  published: boolean;
  free_shipping: boolean;
  requires_shipping: boolean;
  has_stock: boolean;
  image_url: string | null;
  variant_count: number;
  image_count: number;
  category_count: number;
  stock_total: number | null;
  has_untracked_stock: boolean;
  price_min: number | null;
  price_max: number | null;
  promo_price_min: number | null;
  sku_list: string[];
  description_text: string;
  seo_title_text: string;
  seo_description_text: string;
  canonical_url: string | null;
  video_url: string | null;
  tags: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw: TiendaNubeProductApi;
};

type PricingSettings = {
  logisticsUsd: number;
  usdRate: number;
  cuotasQty: number;
  bancarizadaInterest: number;
  macroInterest: number;
  tiendanubePriceCurrency: "USD" | "ARS";
};

type ExistingProductSyncRow = Pick<
  Product,
  | "id"
  | "product_key"
  | "category"
  | "price_usd"
  | "price_ars"
  | "promo_price_ars"
  | "bancarizada_interest"
  | "macro_interest"
  | "cuotas_qty"
  | "delivery_type"
  | "delivery_days"
  | "usd_rate"
  | "logistics_usd"
  | "condition"
  | "image_url"
  | "pricing_source_stock_unit_id"
  | "tiendanube_product_id"
>;

const API_BASE_URL = process.env.TIENDANUBE_API_BASE_URL || "https://api.tiendanube.com/v1";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const DEFAULT_USER_AGENT = "TechnoStore Admin (admin@technostore.local)";

const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  logisticsUsd: 10,
  usdRate: 1460,
  cuotasQty: 6,
  bancarizadaInterest: 0.5,
  macroInterest: 0.35,
  tiendanubePriceCurrency: "USD",
};

function pickLocalizedText(value: TiendaNubeLocalized): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();

  const preferredKeys = ["es", "es_AR", "es-AR", "pt", "en"];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const first = Object.values(value).find((entry) => typeof entry === "string" && entry.trim());
  return typeof first === "string" ? first.trim() : "";
}

function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStock(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundUsdAmount(value: number): number {
  return Number(value.toFixed(2));
}

function roundArsAmount(value: number): number {
  return Math.round(value);
}

function slugifyValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function canonicalizeProductKey(value: string): string {
  return slugifyValue(value).replace(/-/g, "");
}

function inferCategoryFromName(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("iphone")) return "IPHONE";
  if (normalized.includes("samsung") || normalized.includes("galaxy")) return "SAMSUNG";
  if (
    normalized.includes("redmi") ||
    normalized.includes("poco") ||
    normalized.includes("xiaomi") ||
    /\bmi\b/.test(normalized)
  ) {
    return "REDMI/POCO";
  }
  if (normalized.includes("motorola") || normalized.includes("moto")) return "MOTOROLA";
  return "GENERAL";
}

function normalizeProduct(product: TiendaNubeProductApi): TiendaNubeProductRow {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const images = Array.isArray(product.images) ? product.images : [];
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const prices = variants
    .map((variant) => parseMoney(variant.price))
    .filter((value): value is number => value !== null);
  const promoPrices = variants
    .map((variant) => parseMoney(variant.promotional_price))
    .filter((value): value is number => value !== null);
  const trackedStocks = variants
    .filter((variant) => variant.stock_management !== false)
    .map((variant) => parseStock(variant.stock))
    .filter((value): value is number => value !== null);
  const skuList = variants
    .map((variant) => String(variant.sku || "").trim())
    .filter(Boolean);

  return {
    id: String(product.id ?? ""),
    name: pickLocalizedText(product.name) || "Untitled product",
    handle: pickLocalizedText(product.handle),
    brand: product.brand ? String(product.brand).trim() : null,
    published: Boolean(product.published),
    free_shipping: Boolean(product.free_shipping),
    requires_shipping: Boolean(product.requires_shipping),
    has_stock: Boolean(product.has_stock),
    image_url: images.find((image) => image?.src)?.src || null,
    variant_count: variants.length,
    image_count: images.length,
    category_count: categories.length,
    stock_total: trackedStocks.length ? trackedStocks.reduce((sum, value) => sum + value, 0) : null,
    has_untracked_stock: variants.some((variant) => variant.stock_management === false),
    price_min: prices.length ? Math.min(...prices) : null,
    price_max: prices.length ? Math.max(...prices) : null,
    promo_price_min: promoPrices.length ? Math.min(...promoPrices) : null,
    sku_list: skuList,
    description_text: pickLocalizedText(product.description),
    seo_title_text: pickLocalizedText(product.seo_title),
    seo_description_text: pickLocalizedText(product.seo_description),
    canonical_url: product.canonical_url || null,
    video_url: product.video_url || null,
    tags: product.tags || null,
    created_at: product.created_at || null,
    updated_at: product.updated_at || null,
    raw: product,
  };
}

async function fetchProductsPage(
  storeId: string,
  accessToken: string,
  userAgent: string,
  page: number
): Promise<TiendaNubeProductApi[]> {
  const url = new URL(`${API_BASE_URL}/${storeId}/products`);
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": userAgent,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tienda Nube API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TiendaNubeProductApi[];
  return Array.isArray(data) ? data : [];
}

async function fetchAllProducts(
  storeId: string,
  accessToken: string,
  userAgent: string
): Promise<TiendaNubeProductRow[]> {
  const products: TiendaNubeProductApi[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await fetchProductsPage(storeId, accessToken, userAgent, page);
    products.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return products.map(normalizeProduct).sort((a, b) => a.name.localeCompare(b.name));
}

function getRequiredEnv() {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
  const userAgent = process.env.TIENDANUBE_USER_AGENT || DEFAULT_USER_AGENT;

  if (!storeId || !accessToken) {
    return {
      error:
        "Missing TIENDANUBE_STORE_ID or TIENDANUBE_ACCESS_TOKEN. Set them in your app environment before using this tab.",
    } as const;
  }

  return { storeId, accessToken, userAgent } as const;
}

function buildAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Tienda Nube sync needs a server-side Supabase admin client."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function loadPricingSettings(
  admin: ReturnType<typeof buildAdminClient>
): Promise<PricingSettings> {
  const { data, error } = await admin
    .from("store_settings")
    .select("key,value")
    .in("key", [
      "pricing_default_logistics_usd",
      "pricing_default_usd_rate",
      "pricing_default_cuotas_qty",
      "pricing_bancarizada_interest",
      "pricing_macro_interest",
      "tiendanube_sync_price_currency",
    ]);

  if (error) {
    throw error;
  }

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.key, row.value);
  }

  const parseSettingNumber = (key: string, fallback: number) => {
    const raw = map.get(key);
    if (!raw) return fallback;
    const parsed = Number(String(raw).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const currencyRaw = String(
    map.get("tiendanube_sync_price_currency") || DEFAULT_PRICING_SETTINGS.tiendanubePriceCurrency
  ).toUpperCase();

  return {
    logisticsUsd: parseSettingNumber(
      "pricing_default_logistics_usd",
      DEFAULT_PRICING_SETTINGS.logisticsUsd
    ),
    usdRate: parseSettingNumber("pricing_default_usd_rate", DEFAULT_PRICING_SETTINGS.usdRate),
    cuotasQty: Math.max(
      1,
      Math.round(
        parseSettingNumber("pricing_default_cuotas_qty", DEFAULT_PRICING_SETTINGS.cuotasQty)
      )
    ),
    bancarizadaInterest: parseSettingNumber(
      "pricing_bancarizada_interest",
      DEFAULT_PRICING_SETTINGS.bancarizadaInterest
    ),
    macroInterest: parseSettingNumber(
      "pricing_macro_interest",
      DEFAULT_PRICING_SETTINGS.macroInterest
    ),
    tiendanubePriceCurrency: currencyRaw === "ARS" ? "ARS" : "USD",
  };
}

function buildPricingFromTiendaNube(
  product: TiendaNubeProductRow,
  settings: PricingSettings
) {
  const basePrice = product.price_min ?? 0;
  const promoBasePrice = product.promo_price_min;

  const priceUsd =
    settings.tiendanubePriceCurrency === "USD"
      ? roundUsdAmount(basePrice)
      : roundUsdAmount(basePrice / settings.usdRate);
  const priceArs =
    settings.tiendanubePriceCurrency === "USD"
      ? roundArsAmount(basePrice * settings.usdRate)
      : roundArsAmount(basePrice);

  const promoPriceArs =
    promoBasePrice === null
      ? null
      : settings.tiendanubePriceCurrency === "USD"
        ? roundArsAmount(promoBasePrice * settings.usdRate)
        : roundArsAmount(promoBasePrice);

  const bancarizadaTotal = roundArsAmount(priceArs * (1 + settings.bancarizadaInterest));
  const macroTotal = roundArsAmount(priceArs * (1 + settings.macroInterest));

  return {
    price_usd: priceUsd,
    price_ars: priceArs,
    promo_price_ars: promoPriceArs,
    bancarizada_total: bancarizadaTotal,
    bancarizada_cuota: roundArsAmount(bancarizadaTotal / settings.cuotasQty),
    bancarizada_interest: settings.bancarizadaInterest,
    macro_total: macroTotal,
    macro_cuota: roundArsAmount(macroTotal / settings.cuotasQty),
    macro_interest: settings.macroInterest,
    cuotas_qty: settings.cuotasQty,
    usd_rate: settings.usdRate,
    logistics_usd: settings.logisticsUsd,
  };
}

function resolveProductKey(
  product: TiendaNubeProductRow,
  existingByTiendaNubeId: Map<string, ExistingProductSyncRow>,
  existingByExactKey: Map<string, ExistingProductSyncRow>,
  existingByCanonicalKey: Map<string, ExistingProductSyncRow>
) {
  const tiendanubeId = String(product.id || "").trim();
  const handle = String(product.handle || "").trim();
  const normalizedHandle = handle || slugifyValue(product.name);
  const canonicalHandle = canonicalizeProductKey(normalizedHandle);

  const existingById = tiendanubeId ? existingByTiendaNubeId.get(tiendanubeId) : undefined;
  if (existingById) {
    return { existing: existingById, productKey: existingById.product_key };
  }

  const exact = existingByExactKey.get(normalizedHandle);
  if (exact) {
    return { existing: exact, productKey: exact.product_key };
  }

  const canonical = existingByCanonicalKey.get(canonicalHandle);
  if (canonical) {
    return { existing: canonical, productKey: canonical.product_key };
  }

  return { existing: null, productKey: normalizedHandle || slugifyValue(product.name) };
}

function buildTiendaNubeColumns(product: TiendaNubeProductRow) {
  return {
    tiendanube_product_id: product.id,
    tiendanube_handle: product.handle || null,
    tiendanube_brand: product.brand,
    tiendanube_published: product.published,
    tiendanube_free_shipping: product.free_shipping,
    tiendanube_requires_shipping: product.requires_shipping,
    tiendanube_has_stock: product.has_stock,
    tiendanube_price_min: product.price_min,
    tiendanube_price_max: product.price_max,
    tiendanube_promotional_price_min: product.promo_price_min,
    tiendanube_description: product.description_text || null,
    tiendanube_seo_title: product.seo_title_text || null,
    tiendanube_seo_description: product.seo_description_text || null,
    tiendanube_tags: product.tags,
    tiendanube_canonical_url: product.canonical_url,
    tiendanube_video_url: product.video_url,
    tiendanube_image_urls:
      Array.isArray(product.raw.images) && product.raw.images.length > 0
        ? product.raw.images
            .map((image) => (typeof image?.src === "string" ? image.src.trim() : ""))
            .filter(Boolean)
        : null,
    tiendanube_attributes_json: (product.raw.attributes ?? null) as Database["public"]["Tables"]["products"]["Insert"]["tiendanube_attributes_json"],
    tiendanube_categories_json: (product.raw.categories ?? null) as Database["public"]["Tables"]["products"]["Insert"]["tiendanube_categories_json"],
    tiendanube_variants_json: (product.raw.variants ?? null) as Database["public"]["Tables"]["products"]["Insert"]["tiendanube_variants_json"],
    tiendanube_raw_json: product.raw as Database["public"]["Tables"]["products"]["Insert"]["tiendanube_raw_json"],
    tiendanube_synced_at: new Date().toISOString(),
  };
}

async function syncProductsToSupabase(products: TiendaNubeProductRow[]) {
  const admin = buildAdminClient();
  const pricingSettings = await loadPricingSettings(admin);

  const { data: existingRows, error: existingError } = await admin
    .from("products")
    .select(
      "id,product_key,category,price_usd,price_ars,promo_price_ars,bancarizada_interest,macro_interest,cuotas_qty,delivery_type,delivery_days,usd_rate,logistics_usd,condition,image_url,pricing_source_stock_unit_id,tiendanube_product_id"
    );

  if (existingError) {
    throw existingError;
  }

  const existingByTiendaNubeId = new Map<string, ExistingProductSyncRow>();
  const existingByExactKey = new Map<string, ExistingProductSyncRow>();
  const existingByCanonicalKey = new Map<string, ExistingProductSyncRow>();

  for (const row of (existingRows || []) as ExistingProductSyncRow[]) {
    existingByExactKey.set(row.product_key, row);
    existingByCanonicalKey.set(canonicalizeProductKey(row.product_key), row);
    if (row.tiendanube_product_id) {
      existingByTiendaNubeId.set(row.tiendanube_product_id, row);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ product: string; message: string }> = [];

  for (const product of products) {
    try {
      const { existing, productKey } = resolveProductKey(
        product,
        existingByTiendaNubeId,
        existingByExactKey,
        existingByCanonicalKey
      );

      if (!productKey) {
        skipped += 1;
        continue;
      }

      const tiendanubeColumns = buildTiendaNubeColumns(product);
      const category = existing?.category || inferCategoryFromName(product.name);
      const imageUrl = existing?.image_url || product.image_url;

      if (existing) {
        const updatePayload: Database["public"]["Tables"]["products"]["Update"] = {
          product_name: product.name,
          category,
          image_url: imageUrl,
          ...tiendanubeColumns,
        };

        const { error } = await admin.from("products").update(updatePayload).eq("id", existing.id);
        if (error) throw error;
        updated += 1;
        continue;
      }

      const initialPricing = buildPricingFromTiendaNube(product, pricingSettings);
      const insertPayload: Database["public"]["Tables"]["products"]["Insert"] = {
        product_key: productKey,
        category,
        product_name: product.name,
        cost_usd: null,
        logistics_usd: initialPricing.logistics_usd,
        total_cost_usd: null,
        margin_pct: null,
        price_usd: initialPricing.price_usd,
        price_ars: initialPricing.price_ars,
        promo_price_ars: initialPricing.promo_price_ars,
        bancarizada_total: initialPricing.bancarizada_total,
        bancarizada_cuota: initialPricing.bancarizada_cuota,
        bancarizada_interest: initialPricing.bancarizada_interest,
        macro_total: initialPricing.macro_total,
        macro_cuota: initialPricing.macro_cuota,
        macro_interest: initialPricing.macro_interest,
        cuotas_qty: initialPricing.cuotas_qty,
        in_stock: product.has_stock,
        delivery_type: product.has_stock ? "immediate" : "scheduled",
        delivery_days: 0,
        usd_rate: initialPricing.usd_rate,
        ram_gb: null,
        storage_gb: null,
        network: null,
        image_url: imageUrl,
        condition: "new",
        ...tiendanubeColumns,
      };

      const { error } = await admin.from("products").insert(insertPayload);
      if (error) throw error;
      inserted += 1;
    } catch (error) {
      errors.push({
        product: product.name,
        message: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return {
    processed: products.length,
    inserted,
    updated,
    skipped,
    failed: errors.length,
    errors,
  };
}

export async function GET() {
  const env = getRequiredEnv();
  if ("error" in env) {
    return NextResponse.json({ error: env.error }, { status: 503 });
  }

  try {
    const products = await fetchAllProducts(env.storeId, env.accessToken, env.userAgent);
    const summary = {
      total: products.length,
      published: products.filter((row) => row.published).length,
      draft: products.filter((row) => !row.published).length,
      withStock: products.filter(
        (row) => row.has_stock || (row.stock_total || 0) > 0 || row.has_untracked_stock
      ).length,
      freeShipping: products.filter((row) => row.free_shipping).length,
    };

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      store_id: env.storeId,
      summary,
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown Tienda Nube error",
      },
      { status: 502 }
    );
  }
}

export async function POST() {
  const env = getRequiredEnv();
  if ("error" in env) {
    return NextResponse.json({ error: env.error }, { status: 503 });
  }

  try {
    const products = await fetchAllProducts(env.storeId, env.accessToken, env.userAgent);
    const result = await syncProductsToSupabase(products);

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      store_id: env.storeId,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown Tienda Nube sync error",
      },
      { status: 502 }
    );
  }
}
