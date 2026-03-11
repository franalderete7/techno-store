import type { Product } from "@/types/database";

export function getStorefrontImage(product: Pick<Product, "image_url">) {
  return product.image_url || null;
}

export function getStorefrontSlug(product: Pick<Product, "product_key">) {
  return product.product_key;
}
