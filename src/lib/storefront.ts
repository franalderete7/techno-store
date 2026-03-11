import { cache } from "react";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import type { VProductCatalog } from "@/types/database";

export type StorefrontProduct = {
  id: number;
  product_key: string;
  category: string;
  product_name: string;
  color: string | null;
  battery_health: number | null;
  price_ars: number | null;
  promo_price_ars: number | null;
  bancarizada_cuota: number | null;
  macro_cuota: number | null;
  in_stock: boolean | null;
  delivery_type: string | null;
  delivery_days: number | null;
  ram_gb: number | null;
  storage_gb: number | null;
  network: string | null;
  image_url: string | null;
  condition: string | null;
};

const storefrontSelect = [
  "id",
  "product_key",
  "category",
  "product_name",
  "color",
  "battery_health",
  "price_ars",
  "promo_price_ars",
  "bancarizada_cuota",
  "macro_cuota",
  "in_stock",
  "delivery_type",
  "delivery_days",
  "ram_gb",
  "storage_gb",
  "network",
  "image_url",
  "condition",
].join(",");

function normalizeStorefrontProduct(row: VProductCatalog | null): StorefrontProduct | null {
  if (!row?.id || !row.product_key || !row.product_name || !row.category) {
    return null;
  }

  return {
    id: row.id,
    product_key: row.product_key,
    category: row.category,
    product_name: row.product_name,
    color: row.color,
    battery_health: row.battery_health,
    price_ars: row.price_ars,
    promo_price_ars: row.promo_price_ars,
    bancarizada_cuota: row.bancarizada_cuota,
    macro_cuota: row.macro_cuota,
    in_stock: row.in_stock,
    delivery_type: row.delivery_type,
    delivery_days: row.delivery_days,
    ram_gb: row.ram_gb,
    storage_gb: row.storage_gb,
    network: row.network,
    image_url: row.image_url,
    condition: row.condition,
  };
}

export const fetchStorefrontProducts = cache(async () => {
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("v_product_catalog")
    .select(storefrontSelect)
    .or("in_stock.eq.true,delivery_type.eq.on_order")
    .order("in_stock", { ascending: false })
    .order("price_ars", { ascending: true });

  if (error) {
    throw error;
  }

  return (((data || []) as unknown) as VProductCatalog[])
    .map((row) => normalizeStorefrontProduct(row))
    .filter((row): row is StorefrontProduct => row !== null);
});

export const fetchStorefrontProductBySlug = cache(async (slug: string) => {
  const normalizedSlug = slug.trim();
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("v_product_catalog")
    .select(storefrontSelect)
    .eq("product_key", normalizedSlug)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeStorefrontProduct((((data as unknown) as VProductCatalog | null) || null));
});
