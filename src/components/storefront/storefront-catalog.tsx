import { fetchStorefrontProducts } from "@/lib/storefront";
import { StorefrontCatalogClient } from "@/components/storefront/storefront-catalog-client";

export async function StorefrontCatalog() {
  const products = await fetchStorefrontProducts();

  return <StorefrontCatalogClient products={products} />;
}
