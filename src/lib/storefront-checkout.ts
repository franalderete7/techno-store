export const TRANSFER_ALIASES = ["technostore.celu", "tucelualmejorprecio"] as const;

const FALLBACK_STOREFRONT_BASE_URL = "https://techno-store-two.vercel.app";

export function getStorefrontBaseUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    FALLBACK_STOREFRONT_BASE_URL;

  return baseUrl.replace(/\/$/, "");
}

export function buildStorefrontProductUrl(productKey: string) {
  const normalizedKey = String(productKey || "").trim();
  return `${getStorefrontBaseUrl()}/productos/${encodeURIComponent(normalizedKey)}`;
}

export function isValidCheckoutEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || "").trim());
}

export function isValidCheckoutName(value: string) {
  return /^[A-Za-zÀ-ÿ' -]{2,60}$/.test(String(value || "").trim());
}
