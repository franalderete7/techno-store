import { createHash } from "crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, Product } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type TiendaNubeLocalized = Record<string, string | null | undefined> | string | null | undefined;

type TiendaNubeImage = {
  id?: number | string | null;
  src?: string | null;
  position?: number | null;
  width?: number | string | null;
  height?: number | string | null;
  alt?: JsonValue;
} & Record<string, JsonValue>;

type TiendaNubeVariant = {
  id?: number | string | null;
  image_id?: number | string | null;
  product_id?: number | string | null;
  position?: number | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  promotional_price?: string | number | null;
  stock?: number | string | null;
  stock_management?: boolean | null;
  weight?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  depth?: string | number | null;
  sku?: string | null;
  values?: JsonValue[] | null;
  barcode?: string | null;
  mpn?: string | null;
  age_group?: string | null;
  gender?: string | null;
  cost?: string | number | null;
  visible?: boolean | null;
  inventory_levels?: JsonValue[] | null;
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
  primary_image_dimensions: string | null;
  mixed_image_sizes: boolean;
  image_audit: Array<{
    id: string | null;
    src: string | null;
    position: number | null;
    width: number | null;
    height: number | null;
    aspect_ratio: number | null;
    dimensions_label: string | null;
  }>;
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

type LocalProductPushRow = Pick<
  Product,
  | "id"
  | "product_key"
  | "product_name"
  | "price_ars"
  | "promo_price_ars"
  | "in_stock"
  | "image_url"
  | "tiendanube_product_id"
  | "tiendanube_primary_variant_id"
  | "tiendanube_handle"
  | "tiendanube_published"
  | "tiendanube_free_shipping"
  | "tiendanube_requires_shipping"
  | "tiendanube_description"
  | "tiendanube_seo_title"
  | "tiendanube_seo_description"
  | "tiendanube_tags"
  | "tiendanube_video_url"
  | "tiendanube_variants_json"
>;

type PostRequestBody = {
  action?: "pull_remote_into_local" | "push_local_to_remote" | "normalize_remote_images";
  product_ids?: number[];
  remote_product_ids?: Array<string | number>;
};

class TiendaNubeRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TiendaNubeRequestError";
    this.status = status;
  }
}

const API_BASE_URL = process.env.TIENDANUBE_API_BASE_URL || "https://api.tiendanube.com/v1";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const DEFAULT_USER_AGENT = "TechnoStore Admin (admin@technostore.local)";
const DEFAULT_IMAGE_TARGET = {
  width: 1600,
  height: 1600,
  background: "#ffffff",
};

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

function parseDimension(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundUsdAmount(value: number): number {
  return Number(value.toFixed(2));
}

function roundArsAmount(value: number): number {
  return Math.round(value);
}

function formatTiendaNubeMoney(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(2);
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

function buildSignature(params: Record<string, string>, apiSecret: string): string {
  const paramsToSign = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${paramsToSign}${apiSecret}`).digest("hex");
}

function canonicalizeProductKey(value: string): string {
  return slugifyValue(value).replace(/-/g, "");
}

function getVariantId(variant: TiendaNubeVariant | null | undefined): string | null {
  if (!variant?.id) return null;
  const value = String(variant.id).trim();
  return value || null;
}

function resolvePrimaryVariantIdFromVariants(
  variants: TiendaNubeVariant[],
  linkedProductKey?: string | null
): string | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;

  if (linkedProductKey) {
    const matchingSku = variants.find(
      (variant) => String(variant.sku || "").trim() === linkedProductKey
    );
    const matchingSkuId = getVariantId(matchingSku);
    if (matchingSkuId) return matchingSkuId;
  }

  if (variants.length === 1) {
    return getVariantId(variants[0]);
  }

  return null;
}

function buildTiendaNubeHeaders(userAgent: string, accessToken: string) {
  return {
    Authentication: `bearer ${accessToken}`,
    "User-Agent": userAgent,
    "Content-Type": "application/json",
  };
}

async function requestTiendaNubeJson<T>(
  path: string,
  {
    method = "GET",
    body,
    storeId,
    accessToken,
    userAgent,
  }: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: JsonValue;
    storeId: string;
    accessToken: string;
    userAgent: string;
  }
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/${storeId}${path}`);
  const response = await fetch(url.toString(), {
    method,
    cache: "no-store",
    headers: buildTiendaNubeHeaders(userAgent, accessToken),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TiendaNubeRequestError(
      response.status,
      `Tienda Nube API error (${response.status}): ${errorText}`
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  return (text ? (JSON.parse(text) as T) : ({} as T));
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
  const imageAudit = images.map((image) => {
    const width = parseDimension(image?.width);
    const height = parseDimension(image?.height);
    const aspectRatio =
      width && height ? Number((width / height).toFixed(3)) : null;

    return {
      id: image?.id ? String(image.id) : null,
      src: typeof image?.src === "string" ? image.src : null,
      position:
        typeof image?.position === "number"
          ? image.position
          : parseDimension(image?.position),
      width,
      height,
      aspect_ratio: aspectRatio,
      dimensions_label: width && height ? `${width}x${height}` : null,
    };
  });
  const distinctDimensions = new Set(
    imageAudit.map((image) => image.dimensions_label).filter(Boolean)
  );

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
    primary_image_dimensions: imageAudit[0]?.dimensions_label || null,
    mixed_image_sizes: distinctDimensions.size > 1,
    image_audit: imageAudit,
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
    headers: buildTiendaNubeHeaders(userAgent, accessToken),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TiendaNubeRequestError(
      response.status,
      `Tienda Nube API error (${response.status}): ${errorText}`
    );
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

async function fetchProductById(
  storeId: string,
  accessToken: string,
  userAgent: string,
  productId: string
): Promise<TiendaNubeProductApi> {
  return requestTiendaNubeJson<TiendaNubeProductApi>(`/products/${productId}`, {
    method: "GET",
    storeId,
    accessToken,
    userAgent,
  });
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

function getCloudinaryEnv() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const assetFolder = process.env.CLOUDINARY_ASSET_FOLDER || "assets";

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary environment variables. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before normalizing Tienda Nube images."
    );
  }

  return { cloudName, apiKey, apiSecret, assetFolder };
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

async function loadImageNormalizationSettings(
  admin: ReturnType<typeof buildAdminClient>
): Promise<{ width: number; height: number; background: string }> {
  const { data, error } = await admin
    .from("store_settings")
    .select("key,value")
    .in("key", [
      "tiendanube_image_target_width",
      "tiendanube_image_target_height",
      "tiendanube_image_background",
    ]);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.key, row.value);
  }

  const parseSettingNumber = (key: string, fallback: number) => {
    const raw = map.get(key);
    if (!raw) return fallback;
    const parsed = Number(String(raw).replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
  };

  const background = String(
    map.get("tiendanube_image_background") || DEFAULT_IMAGE_TARGET.background
  ).trim();

  return {
    width: parseSettingNumber("tiendanube_image_target_width", DEFAULT_IMAGE_TARGET.width),
    height: parseSettingNumber("tiendanube_image_target_height", DEFAULT_IMAGE_TARGET.height),
    background: background || DEFAULT_IMAGE_TARGET.background,
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

function buildTiendaNubeColumns(product: TiendaNubeProductRow, linkedProductKey?: string | null) {
  const variants = Array.isArray(product.raw.variants) ? product.raw.variants : [];

  return {
    tiendanube_product_id: product.id,
    tiendanube_primary_variant_id: resolvePrimaryVariantIdFromVariants(variants, linkedProductKey),
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
    tiendanube_sync_status: "linked",
    tiendanube_sync_error: null,
  };
}

async function refreshLocalMetadataFromRemoteProduct(
  admin: ReturnType<typeof buildAdminClient>,
  product: TiendaNubeProductRow
) {
  await admin
    .from("products")
    .update({
      ...buildTiendaNubeColumns(product),
      tiendanube_sync_status: "linked",
      tiendanube_sync_error: null,
    })
    .eq("tiendanube_product_id", product.id);
}

async function uploadBufferToCloudinary(
  buffer: Buffer,
  publicId: string,
  folder: string
): Promise<{ secureUrl: string; publicId: string }> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildSignature(
    {
      folder,
      overwrite: "true",
      public_id: publicId,
      timestamp,
    },
    apiSecret
  );

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }),
    `${publicId}.jpg`
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("overwrite", "true");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const result = (await response.json()) as {
    error?: { message?: string };
    public_id?: string;
    secure_url?: string;
  };

  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || "Cloudinary rejected the normalized image upload.");
  }

  return { secureUrl: result.secure_url, publicId: result.public_id };
}

async function buildNormalizedImageUrl(
  imageUrl: string,
  {
    productId,
    imagePosition,
    imageWidth,
    imageHeight,
    targetWidth,
    targetHeight,
    background,
  }: {
    productId: string;
    imagePosition: number;
    imageWidth: number | null;
    imageHeight: number | null;
    targetWidth: number;
    targetHeight: number;
    background: string;
  }
) {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download source image (${response.status}).`);
  }

  const inputBuffer = Buffer.from(await response.arrayBuffer());
  const normalizedBuffer = await sharp(inputBuffer)
    .rotate()
    .trim()
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background,
      withoutEnlargement: false,
    })
    .flatten({ background })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const cloudinaryFolder = `${getCloudinaryEnv().assetFolder}/tiendanube-normalized`;
  const publicId = `tn-${productId}-${String(imagePosition).padStart(2, "0")}-${targetWidth}x${targetHeight}`;
  const uploaded = await uploadBufferToCloudinary(normalizedBuffer, publicId, cloudinaryFolder);

  return {
    secureUrl: uploaded.secureUrl,
    publicId: uploaded.publicId,
    sourceWidth: imageWidth,
    sourceHeight: imageHeight,
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

      const tiendanubeColumns = buildTiendaNubeColumns(product, productKey);
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

function parseLocalVariantsJson(
  value: LocalProductPushRow["tiendanube_variants_json"]
): TiendaNubeVariant[] {
  return Array.isArray(value) ? (value as TiendaNubeVariant[]) : [];
}

function resolveVariantForLocalProduct(
  product: LocalProductPushRow,
  variants: TiendaNubeVariant[]
): { variantId: string; variant: TiendaNubeVariant } | null {
  const explicitVariantId = String(product.tiendanube_primary_variant_id || "").trim();
  if (explicitVariantId) {
    const explicitMatch = variants.find((variant) => getVariantId(variant) === explicitVariantId);
    if (explicitMatch) {
      return { variantId: explicitVariantId, variant: explicitMatch };
    }
  }

  const matchingSku = variants.find(
    (variant) => String(variant.sku || "").trim() === product.product_key
  );
  const matchingSkuId = getVariantId(matchingSku);
  if (matchingSku && matchingSkuId) {
    return { variantId: matchingSkuId, variant: matchingSku };
  }

  if (variants.length === 1) {
    const singleId = getVariantId(variants[0]);
    if (singleId) {
      return { variantId: singleId, variant: variants[0] };
    }
  }

  return null;
}

function buildCreateProductPayload(product: LocalProductPushRow): JsonValue {
  const payload: Record<string, JsonValue> = {
    name: product.product_name,
    published: Boolean(product.tiendanube_published ?? false),
    free_shipping: Boolean(product.tiendanube_free_shipping ?? false),
    requires_shipping: product.tiendanube_requires_shipping ?? true,
    variants: [
      {
        price: formatTiendaNubeMoney(product.price_ars) || "0.00",
        compare_at_price: product.promo_price_ars ? formatTiendaNubeMoney(product.price_ars) : null,
        promotional_price: formatTiendaNubeMoney(product.promo_price_ars),
        stock: product.in_stock ? 1 : 0,
        sku: product.product_key,
      },
    ],
  };

  const description = String(product.tiendanube_description || "").trim();
  if (description) payload.description = description;

  const seoTitle = String(product.tiendanube_seo_title || "").trim();
  if (seoTitle) payload.seo_title = seoTitle;

  const seoDescription = String(product.tiendanube_seo_description || "").trim();
  if (seoDescription) payload.seo_description = seoDescription;

  const videoUrl = String(product.tiendanube_video_url || "").trim();
  if (videoUrl) payload.video_url = videoUrl;

  const tags = String(product.tiendanube_tags || "").trim();
  if (tags) payload.tags = tags;

  const imageUrl = String(product.image_url || "").trim();
  if (imageUrl) {
    payload.images = [{ src: imageUrl }];
  }

  return payload;
}

function buildVariantUpdatePayload(
  product: LocalProductPushRow,
  variant: TiendaNubeVariant
): JsonValue {
  return {
    image_id: variant.image_id ?? null,
    price: formatTiendaNubeMoney(product.price_ars) || "0.00",
    compare_at_price: product.promo_price_ars ? formatTiendaNubeMoney(product.price_ars) : null,
    promotional_price: formatTiendaNubeMoney(product.promo_price_ars),
    stock: product.in_stock ? 1 : 0,
    weight: variant.weight ?? "0.000",
    width: variant.width ?? "0.00",
    height: variant.height ?? "0.00",
    depth: variant.depth ?? "0.00",
    sku: product.product_key,
    values: Array.isArray(variant.values) ? variant.values : [],
    barcode: variant.barcode ?? null,
    mpn: variant.mpn ?? null,
    age_group: variant.age_group ?? null,
    gender: variant.gender ?? null,
    cost: variant.cost ?? null,
    visible: variant.visible ?? true,
  };
}

async function createRemoteProductFromLocal(
  product: LocalProductPushRow,
  {
    storeId,
    accessToken,
    userAgent,
  }: {
    storeId: string;
    accessToken: string;
    userAgent: string;
  }
): Promise<TiendaNubeProductApi> {
  return requestTiendaNubeJson<TiendaNubeProductApi>("/products", {
    method: "POST",
    body: buildCreateProductPayload(product),
    storeId,
    accessToken,
    userAgent,
  });
}

async function updateRemoteVariantFromLocal(
  product: LocalProductPushRow,
  {
    storeId,
    accessToken,
    userAgent,
  }: {
    storeId: string;
    accessToken: string;
    userAgent: string;
  }
): Promise<TiendaNubeProductApi> {
  const remoteProductId = String(product.tiendanube_product_id || "").trim();
  if (!remoteProductId) {
    throw new Error("Missing linked Tienda Nube product id.");
  }

  const remoteProduct = await fetchProductById(storeId, accessToken, userAgent, remoteProductId);
  const remoteVariants = Array.isArray(remoteProduct.variants)
    ? remoteProduct.variants
    : parseLocalVariantsJson(product.tiendanube_variants_json);
  const resolvedVariant = resolveVariantForLocalProduct(product, remoteVariants);

  if (!resolvedVariant) {
    throw new Error(
      "Linked Tienda Nube product has multiple variants and no primary variant could be resolved. Save tiendanube_primary_variant_id first."
    );
  }

  await requestTiendaNubeJson<TiendaNubeVariant>(
    `/products/${remoteProductId}/variants/${resolvedVariant.variantId}`,
    {
      method: "PUT",
      body: buildVariantUpdatePayload(product, resolvedVariant.variant),
      storeId,
      accessToken,
      userAgent,
    }
  );

  return fetchProductById(storeId, accessToken, userAgent, remoteProductId);
}

async function pushLocalProductsToTiendaNube(
  productIds: number[] | undefined,
  {
    storeId,
    accessToken,
    userAgent,
  }: {
    storeId: string;
    accessToken: string;
    userAgent: string;
  }
) {
  const admin = buildAdminClient();
  let query = admin.from("products").select(
    [
      "id",
      "product_key",
      "product_name",
      "price_ars",
      "promo_price_ars",
      "in_stock",
      "image_url",
      "tiendanube_product_id",
      "tiendanube_primary_variant_id",
      "tiendanube_handle",
      "tiendanube_published",
      "tiendanube_free_shipping",
      "tiendanube_requires_shipping",
      "tiendanube_description",
      "tiendanube_seo_title",
      "tiendanube_seo_description",
      "tiendanube_tags",
      "tiendanube_video_url",
      "tiendanube_variants_json",
    ].join(",")
  );

  if (Array.isArray(productIds) && productIds.length > 0) {
    query = query.in("id", productIds);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) throw error;

  const products = ((data ?? []) as unknown) as LocalProductPushRow[];
  let createdRemote = 0;
  let updatedRemote = 0;
  const errors: Array<{ product: string; message: string }> = [];

  for (const product of products) {
    try {
      let remoteApi: TiendaNubeProductApi;

      if (!product.tiendanube_product_id) {
        remoteApi = await createRemoteProductFromLocal(product, { storeId, accessToken, userAgent });
        createdRemote += 1;
      } else {
        try {
          remoteApi = await updateRemoteVariantFromLocal(product, {
            storeId,
            accessToken,
            userAgent,
          });
          updatedRemote += 1;
        } catch (pushError) {
          if (pushError instanceof TiendaNubeRequestError && pushError.status === 404) {
            remoteApi = await createRemoteProductFromLocal(product, {
              storeId,
              accessToken,
              userAgent,
            });
            createdRemote += 1;
          } else {
            throw pushError;
          }
        }
      }

      const remoteProduct = normalizeProduct(remoteApi);
      const pushedAt = new Date().toISOString();
      const updatePayload: Database["public"]["Tables"]["products"]["Update"] = {
        ...buildTiendaNubeColumns(remoteProduct, product.product_key),
        tiendanube_last_pushed_at: pushedAt,
        tiendanube_sync_status: "push_ok",
        tiendanube_sync_error: null,
      };

      const { error: updateError } = await admin
        .from("products")
        .update(updatePayload)
        .eq("id", product.id);

      if (updateError) throw updateError;
    } catch (pushError) {
      const message = pushError instanceof Error ? pushError.message : "Unknown push sync error";
      errors.push({ product: product.product_name, message });

      await admin
        .from("products")
        .update({
          tiendanube_sync_status: "push_error",
          tiendanube_sync_error: message,
        })
        .eq("id", product.id);
    }
  }

  return {
    processed: products.length,
    created_remote: createdRemote,
    updated_remote: updatedRemote,
    failed: errors.length,
    succeeded: products.length - errors.length,
    errors,
  };
}

async function normalizeRemoteImages(
  remoteProductIds: Array<string | number> | undefined,
  {
    storeId,
    accessToken,
    userAgent,
  }: {
    storeId: string;
    accessToken: string;
    userAgent: string;
  }
) {
  const admin = buildAdminClient();
  const imageSettings = await loadImageNormalizationSettings(admin);
  const allProducts = await fetchAllProducts(storeId, accessToken, userAgent);
  const requestedIds = new Set(
    (remoteProductIds || []).map((value) => String(value || "").trim()).filter(Boolean)
  );
  const products =
    requestedIds.size > 0
      ? allProducts.filter((product) => requestedIds.has(product.id))
      : allProducts;

  let normalizedProducts = 0;
  let normalizedImages = 0;
  let skipped = 0;
  const errors: Array<{ product: string; message: string }> = [];

  for (const product of products) {
    try {
      const images = Array.isArray(product.raw.images) ? product.raw.images : [];

      if (!images.length) {
        skipped += 1;
        continue;
      }

      const originalImageIds = images
        .map((image) => (image?.id ? String(image.id).trim() : ""))
        .filter(Boolean);

      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const src = typeof image?.src === "string" ? image.src.trim() : "";
        if (!src) continue;

        const normalized = await buildNormalizedImageUrl(src, {
          productId: product.id,
          imagePosition: Number(image?.position || index + 1),
          imageWidth: parseDimension(image?.width),
          imageHeight: parseDimension(image?.height),
          targetWidth: imageSettings.width,
          targetHeight: imageSettings.height,
          background: imageSettings.background,
        });

        await requestTiendaNubeJson<TiendaNubeImage>(`/products/${product.id}/images`, {
          method: "POST",
          body: {
            src: normalized.secureUrl,
            position: Number(image?.position || index + 1),
          },
          storeId,
          accessToken,
          userAgent,
        });

        normalizedImages += 1;
      }

      for (const imageId of originalImageIds) {
        await requestTiendaNubeJson<{}>(`/products/${product.id}/images/${imageId}`, {
          method: "DELETE",
          storeId,
          accessToken,
          userAgent,
        });
      }

      const refreshed = normalizeProduct(
        await fetchProductById(storeId, accessToken, userAgent, product.id)
      );
      await refreshLocalMetadataFromRemoteProduct(admin, refreshed);
      normalizedProducts += 1;
    } catch (error) {
      errors.push({
        product: product.name,
        message: error instanceof Error ? error.message : "Unknown normalization error",
      });
    }
  }

  return {
    processed: products.length,
    normalized_products: normalizedProducts,
    normalized_images: normalizedImages,
    skipped,
    failed: errors.length,
    target_width: imageSettings.width,
    target_height: imageSettings.height,
    target_background: imageSettings.background,
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

export async function POST(request: Request) {
  const env = getRequiredEnv();
  if ("error" in env) {
    return NextResponse.json({ error: env.error }, { status: 503 });
  }

  try {
    let body: PostRequestBody = {};
    const rawBody = await request.text();

    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as PostRequestBody;
    }

    if (body.action === "push_local_to_remote") {
      const result = await pushLocalProductsToTiendaNube(body.product_ids, env);

      return NextResponse.json({
        fetched_at: new Date().toISOString(),
        store_id: env.storeId,
        action: "push_local_to_remote",
        ...result,
      });
    }

    if (body.action === "normalize_remote_images") {
      const result = await normalizeRemoteImages(body.remote_product_ids, env);

      return NextResponse.json({
        fetched_at: new Date().toISOString(),
        store_id: env.storeId,
        action: "normalize_remote_images",
        ...result,
      });
    }

    const products = await fetchAllProducts(env.storeId, env.accessToken, env.userAgent);
    const result = await syncProductsToSupabase(products);

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      store_id: env.storeId,
      action: "pull_remote_into_local",
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
