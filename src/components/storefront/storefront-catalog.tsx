import { fetchStorefrontContext, fetchStorefrontProducts } from "@/lib/storefront";
import { StorefrontCatalogClient } from "@/components/storefront/storefront-catalog-client";

export async function StorefrontCatalog() {
  const [products, storeContext] = await Promise.all([
    fetchStorefrontProducts(),
    fetchStorefrontContext(),
  ]);

  return <StorefrontCatalogClient products={products} storeContext={storeContext} />;
}
