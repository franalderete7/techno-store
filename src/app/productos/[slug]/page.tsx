import { StorefrontProductDetail } from "@/components/storefront/storefront-product-detail";

export const dynamic = "force-dynamic";

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontProductDetail slug={slug} />;
}
