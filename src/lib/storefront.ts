import { cache } from "react";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import type { Product } from "@/types/database";

export type StorefrontProduct = Pick<
  Product,
  | "id"
  | "product_key"
  | "category"
  | "product_name"
  | "price_ars"
  | "promo_price_ars"
  | "bancarizada_cuota"
  | "macro_cuota"
  | "in_stock"
  | "delivery_type"
  | "delivery_days"
  | "ram_gb"
  | "storage_gb"
  | "network"
  | "image_url"
  | "condition"
>;

const storefrontSelect = [
  "id",
  "product_key",
  "category",
  "product_name",
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

export function getStorefrontImage(product: Pick<Product, "image_url">) {
  return product.image_url || null;
}

export function getStorefrontSlug(product: Pick<Product, "product_key">) {
  return product.product_key;
}

export const fetchStorefrontProducts = cache(async () => {
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(storefrontSelect)
    .or("in_stock.eq.true,delivery_type.eq.on_order")
    .order("in_stock", { ascending: false })
    .order("price_ars", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data || []) as unknown) as StorefrontProduct[];
});

export const fetchStorefrontProductBySlug = cache(async (slug: string) => {
  const normalizedSlug = slug.trim();
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(storefrontSelect)
    .eq("product_key", normalizedSlug)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as StorefrontProduct) || null;
});
