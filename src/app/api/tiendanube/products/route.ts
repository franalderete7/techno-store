import { NextResponse } from "next/server";

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

const API_BASE_URL = process.env.TIENDANUBE_API_BASE_URL || "https://api.tiendanube.com/v1";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

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

export async function GET() {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
  const userAgent = process.env.TIENDANUBE_USER_AGENT || "TechnoStore Admin (admin@technostore.local)";

  if (!storeId || !accessToken) {
    return NextResponse.json(
      {
        error:
          "Missing TIENDANUBE_STORE_ID or TIENDANUBE_ACCESS_TOKEN. Set them in your app environment before using this tab.",
      },
      { status: 503 }
    );
  }

  try {
    const products: TiendaNubeProductApi[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = await fetchProductsPage(storeId, accessToken, userAgent, page);
      products.push(...batch);

      if (batch.length < PAGE_SIZE) break;
    }

    const rows = products.map(normalizeProduct);
    const summary = {
      total: rows.length,
      published: rows.filter((row) => row.published).length,
      draft: rows.filter((row) => !row.published).length,
      withStock: rows.filter((row) => row.has_stock || (row.stock_total || 0) > 0 || row.has_untracked_stock)
        .length,
      freeShipping: rows.filter((row) => row.free_shipping).length,
    };

    return NextResponse.json({
      fetched_at: new Date().toISOString(),
      store_id: storeId,
      summary,
      products: rows.sort((a, b) => a.name.localeCompare(b.name)),
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
