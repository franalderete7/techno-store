import type { Product } from "@/types/database";

type StorefrontProductPresentation = {
  product_key: string;
  image_url: string | null;
  in_stock?: boolean | null;
  delivery_type?: string | null;
  delivery_days?: number | null;
  condition?: string | null;
};

export type StorefrontAvailabilityCode =
  | "immediate"
  | "on_order"
  | "scheduled"
  | "pickup"
  | "consult";

export function getStorefrontImage(product: Pick<Product, "image_url">) {
  return product.image_url || null;
}

export function getStorefrontSlug(product: Pick<Product, "product_key">) {
  return product.product_key;
}

function normalizeValue(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function getStorefrontConditionLabel(condition: string | null | undefined) {
  const normalized = normalizeValue(condition);

  if (normalized === "new") return "Nuevo";
  if (normalized === "like_new") return "Como nuevo";
  if (normalized === "used") return "Usado";
  if (normalized === "refurbished") return "Reacondicionado";

  return condition ? String(condition).trim() : "Sin especificar";
}

export function getStorefrontConditionTone(condition: string | null | undefined) {
  const normalized = normalizeValue(condition);

  if (normalized === "new") {
    return "border-sky-300/30 bg-sky-300/12 text-sky-100";
  }
  if (normalized === "like_new") {
    return "border-violet-300/30 bg-violet-300/12 text-violet-100";
  }
  if (normalized === "used") {
    return "border-zinc-300/25 bg-zinc-300/10 text-zinc-100";
  }
  if (normalized === "refurbished") {
    return "border-cyan-300/30 bg-cyan-300/12 text-cyan-100";
  }

  return "border-white/15 bg-white/5 text-white/85";
}

export function getStorefrontAvailabilityCode(
  product: Pick<
    StorefrontProductPresentation,
    "in_stock" | "delivery_type"
  >
): StorefrontAvailabilityCode {
  const deliveryType = normalizeValue(product.delivery_type);

  if (deliveryType === "on_order") return "on_order";
  if (deliveryType === "scheduled") return "scheduled";
  if (deliveryType === "pickup") return "pickup";
  if (deliveryType === "immediate") return "immediate";
  if (product.in_stock === true) return "immediate";

  return "consult";
}

export function getStorefrontDeliveryTypeLabel(
  product: Pick<
    StorefrontProductPresentation,
    "in_stock" | "delivery_type"
  >
) {
  const code = getStorefrontAvailabilityCode(product);

  if (code === "on_order") return "A pedido";
  if (code === "scheduled") return "Entrega programada";
  if (code === "pickup") return "Retiro en tienda";
  if (code === "immediate") return "Entrega inmediata";

  return "Consultar";
}

export function getStorefrontDeliveryDaysLabel(
  product: Pick<
    StorefrontProductPresentation,
    "delivery_days" | "in_stock" | "delivery_type"
  >
) {
  const days = Number(product.delivery_days);

  if (!Number.isFinite(days) || days <= 0) return null;

  return days === 1 ? "1 día" : `${days} días`;
}

export function getStorefrontAvailabilityLabel(
  product: Pick<
    StorefrontProductPresentation,
    "delivery_days" | "in_stock" | "delivery_type"
  >
) {
  const deliveryTypeLabel = getStorefrontDeliveryTypeLabel(product);
  const daysLabel = getStorefrontDeliveryDaysLabel(product);

  return daysLabel ? `${deliveryTypeLabel} · ${daysLabel}` : deliveryTypeLabel;
}

export function getStorefrontAvailabilityTone(
  product: Pick<
    StorefrontProductPresentation,
    "delivery_days" | "in_stock" | "delivery_type"
  >
) {
  const code = getStorefrontAvailabilityCode(product);

  if (code === "immediate") {
    return "relative overflow-hidden border-emerald-300/80 bg-emerald-300 text-emerald-950 shadow-[0_10px_30px_rgba(110,231,183,0.35)] before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:border before:border-emerald-50/70 before:content-[''] before:animate-[pulse_2.2s_ease-in-out_infinite]";
  }

  if (code === "pickup") {
    return "border-cyan-300/60 bg-cyan-300/12 text-cyan-100";
  }

  if (code === "on_order" || code === "scheduled") {
    return "border-amber-300/45 bg-amber-300/12 text-amber-100";
  }

  return "border-white/20 bg-slate-200 text-slate-950";
}

export function getStorefrontDeliveryDaysTone(
  product: Pick<
    StorefrontProductPresentation,
    "delivery_days" | "in_stock" | "delivery_type"
  >
) {
  const code = getStorefrontAvailabilityCode(product);

  if (code === "on_order" || code === "scheduled") {
    return "border-fuchsia-300/30 bg-fuchsia-300/12 text-fuchsia-100";
  }

  if (code === "pickup") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  }

  if (code === "immediate") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }

  return "border-white/15 bg-white/5 text-white/85";
}

export function getStorefrontAvailabilitySortWeight(
  product: Pick<
    StorefrontProductPresentation,
    "delivery_days" | "in_stock" | "delivery_type"
  >
) {
  const code = getStorefrontAvailabilityCode(product);

  if (code === "immediate") return 4;
  if (code === "pickup") return 3;
  if (code === "on_order") return 2;
  if (code === "scheduled") return 1;

  return 0;
}
