import { parseOptionalNumber, parseOptionalText } from "@/lib/utils";
import type { Product } from "@/types/database";

export const PRODUCT_CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
] as const;

export type ProductConditionValue = (typeof PRODUCT_CONDITION_OPTIONS)[number]["value"];

const PRODUCT_CONDITION_SET = new Set(PRODUCT_CONDITION_OPTIONS.map((option) => option.value));
const BATTERY_REQUIRED_CONDITIONS = new Set<ProductConditionValue>([
  "like_new",
  "used",
  "refurbished",
]);

function normalizeSlugPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugContainsSegment(slug: string, segment: string) {
  if (!slug || !segment) return false;
  return slug === segment || slug.startsWith(`${segment}-`) || slug.endsWith(`-${segment}`) || slug.includes(`-${segment}-`);
}

function stripBatteryToken(slug: string) {
  return slug
    .replace(/(?:-b(?:ateria-?)?\d{1,3})+$/g, "")
    .replace(/-+$/g, "")
    .trim();
}

export function normalizeProductCondition(value: unknown): ProductConditionValue | null {
  const normalized = parseOptionalText(value);
  if (!normalized || !PRODUCT_CONDITION_SET.has(normalized as ProductConditionValue)) {
    return null;
  }
  return normalized as ProductConditionValue;
}

export function requiresProductBatteryHealth(condition: unknown) {
  const normalized = normalizeProductCondition(condition);
  return normalized ? BATTERY_REQUIRED_CONDITIONS.has(normalized) : false;
}

export function normalizeBatteryHealthValue(value: unknown) {
  const parsed = parseOptionalNumber(value);
  if (parsed == null) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

export function normalizeProductColorValue(value: unknown) {
  return parseOptionalText(value);
}

function formatConditionLabel(condition: string | null | undefined) {
  switch (normalizeProductCondition(condition)) {
    case "used":
      return "Used";
    case "like_new":
      return "Like New";
    case "refurbished":
      return "Refurbished";
    default:
      return "New";
  }
}

export function buildProductKeyFromCatalog({
  productName,
  color,
  batteryHealth,
  existingKeys,
  currentKey,
}: {
  productName: string;
  color?: string | null;
  batteryHealth?: number | null;
  existingKeys: Iterable<string>;
  currentKey?: string | null;
}) {
  let baseKey = stripBatteryToken(normalizeSlugPart(productName));
  const colorSlug = color ? normalizeSlugPart(color) : "";

  if (colorSlug && !slugContainsSegment(baseKey, colorSlug)) {
    baseKey = [baseKey, colorSlug].filter(Boolean).join("-");
  }

  if (batteryHealth != null) {
    baseKey = [stripBatteryToken(baseKey), `b${batteryHealth}`].filter(Boolean).join("-");
  }

  const fallback = baseKey || "product";
  const normalizedCurrentKey = currentKey ? currentKey.toLowerCase() : null;
  const normalizedExistingKeys = new Set(
    [...existingKeys]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value && value !== normalizedCurrentKey)
  );

  if (!normalizedExistingKeys.has(fallback.toLowerCase())) {
    return fallback;
  }

  let suffix = 2;
  let candidate = `${fallback}-${suffix}`;
  while (normalizedExistingKeys.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${fallback}-${suffix}`;
  }

  return candidate;
}

export function formatCatalogVariantLabel(
  product: Pick<Product, "product_name" | "color" | "battery_health" | "condition">
) {
  const baseName = parseOptionalText(product.product_name) ?? "Unnamed product";
  const bits = [formatConditionLabel(product.condition)];

  const color = normalizeProductColorValue(product.color);
  const batteryHealth = normalizeBatteryHealthValue(product.battery_health);

  if (color) bits.push(color);
  if (batteryHealth != null) bits.push(`Bat ${batteryHealth}%`);

  return bits.length > 0 ? `${baseName} · ${bits.join(" · ")}` : baseName;
}

export function validateProductCatalogVariant({
  condition,
  color,
  batteryHealth,
}: {
  condition: unknown;
  color: unknown;
  batteryHealth: unknown;
}) {
  const normalizedCondition = normalizeProductCondition(condition);
  if (!normalizedCondition) {
    return "Condition must be New, Like New, Used, or Refurbished.";
  }

  const normalizedColor = normalizeProductColorValue(color);
  const normalizedBattery = normalizeBatteryHealthValue(batteryHealth);

  if (requiresProductBatteryHealth(normalizedCondition) && normalizedBattery == null) {
    return "Battery Health is required for Like New, Used, and Refurbished products.";
  }

  if (normalizedCondition === "new" && normalizedBattery != null) {
    return "Battery Health should be empty for New products.";
  }

  if (normalizedColor && normalizedColor.length < 2) {
    return "Color is too short.";
  }

  return null;
}

export function getCatalogVariantDefaults(product: Pick<Product, "color" | "battery_health">) {
  return {
    color: normalizeProductColorValue(product.color),
    batteryHealth: normalizeBatteryHealthValue(product.battery_health),
  };
}

export function validateStockVariantAgainstProduct(
  product: Pick<Product, "product_name" | "product_key" | "color" | "battery_health"> | null | undefined,
  stockVariant: {
    color?: unknown;
    batteryHealth?: unknown;
  }
) {
  if (!product) return null;

  const requiredColor = normalizeProductColorValue(product.color);
  const requiredBattery = normalizeBatteryHealthValue(product.battery_health);
  const unitColor = normalizeProductColorValue(stockVariant.color);
  const unitBattery = normalizeBatteryHealthValue(stockVariant.batteryHealth);

  if (requiredColor) {
    if (!unitColor) {
      return `This product requires color ${requiredColor}.`;
    }

    if (normalizeComparableText(unitColor) !== normalizeComparableText(requiredColor)) {
      return `This product requires color ${requiredColor}, but the stock unit says ${unitColor}.`;
    }
  }

  if (requiredBattery != null) {
    if (unitBattery == null) {
      return `This product requires battery health ${requiredBattery}%.`;
    }

    if (unitBattery !== requiredBattery) {
      return `This product requires battery health ${requiredBattery}%, but the stock unit says ${unitBattery}%.`;
    }
  }

  return null;
}

export function applyProductVariantToStockDraft<T extends { color?: string | null; battery_health?: number | null }>(
  product: Pick<Product, "color" | "battery_health"> | null | undefined,
  draft: T
) {
  if (!product) return draft;

  const { color, batteryHealth } = getCatalogVariantDefaults(product);

  return {
    ...draft,
    color: color ?? draft.color ?? null,
    battery_health: batteryHealth ?? draft.battery_health ?? null,
  };
}
