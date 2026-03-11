import { notFound } from "next/navigation";
import {
  fetchStorefrontProductBySlug,
} from "@/lib/storefront";
import { StorefrontProductDetailClient } from "@/components/storefront/storefront-product-detail-client";

export async function StorefrontProductDetail({ slug }: { slug: string }) {
  const product = await fetchStorefrontProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return <StorefrontProductDetailClient product={product} />;
}
