export const TRANSFER_ALIASES = ["technostore.celu", "tucelualmejorprecio"] as const;
const FALLBACK_STOREFRONT_WHATSAPP_NUMBER = "543875319940";

export type StorefrontDeliveryDetails = {
  phone?: string | null;
  address: string;
  zipCode: string;
  city: string;
  province: string;
  deliveryInstructions?: string | null;
};

const FALLBACK_STOREFRONT_BASE_URL = "https://puntotechno.com";

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

export function getStorefrontWhatsAppNumber() {
  return String(
    process.env.NEXT_PUBLIC_STOREFRONT_WHATSAPP_NUMBER ||
      FALLBACK_STOREFRONT_WHATSAPP_NUMBER
  ).replace(/\D+/g, "");
}

export function buildStorefrontWhatsAppUrl(message?: string | null) {
  const normalizedMessage =
    String(message || "Hola TechnoStore, vengo de la tienda online.").trim();

  return `https://wa.me/${getStorefrontWhatsAppNumber()}?text=${encodeURIComponent(
    normalizedMessage
  )}`;
}

export function isValidCheckoutEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || "").trim());
}

export function isValidCheckoutPhone(value: string) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function isValidCheckoutName(value: string) {
  return /^[A-Za-zÀ-ÿ' -]{2,60}$/.test(String(value || "").trim());
}

export function isValidCheckoutAddress(value: string) {
  const normalized = String(value || "").trim();
  return normalized.length >= 6 && normalized.length <= 140;
}

export function isValidCheckoutCity(value: string) {
  return /^[A-Za-zÀ-ÿ0-9' .-]{2,80}$/.test(String(value || "").trim());
}

export function isValidCheckoutProvince(value: string) {
  return /^[A-Za-zÀ-ÿ' .-]{2,80}$/.test(String(value || "").trim());
}

export function isValidCheckoutZipCode(value: string) {
  return /^[A-Za-z0-9 -]{3,12}$/i.test(String(value || "").trim());
}

export function buildStorefrontDeliveryNotes(details: StorefrontDeliveryDetails) {
  const lines = [
    "Datos de entrega:",
    `WhatsApp: ${String(details.phone || "").trim()}`,
    `Dirección: ${String(details.address || "").trim()}`,
    `CP: ${String(details.zipCode || "").trim()}`,
    `Ciudad: ${String(details.city || "").trim()}`,
    `Provincia: ${String(details.province || "").trim()}`,
  ];

  const deliveryInstructions = String(details.deliveryInstructions || "").trim();
  if (deliveryInstructions) {
    lines.push(`Indicaciones: ${deliveryInstructions}`);
  }

  return lines.join("\n");
}
