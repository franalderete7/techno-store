"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage, isRowLevelSecurityError, parseOptionalText } from "@/lib/utils";
import type { Product, ProductInsert, ProductUpdate, StoreSetting } from "@/types/database";
import {
  PRODUCT_CONDITION_OPTIONS,
  buildProductKeyFromCatalog,
  normalizeBatteryHealthValue,
  normalizeProductColorValue,
  normalizeProductCondition,
  requiresProductBatteryHealth,
  validateProductCatalogVariant,
} from "@/lib/product-variants";
import {
  DEFAULT_PRICING_DEFAULTS,
  buildPricingDefaultsFromStoreSettings,
  type PricingDefaults,
} from "@/lib/pricing-defaults";
import {
  buildProductPricingSnapshot,
  buildProductCostSnapshot,
  roundArsAmount,
  roundUsdAmount,
} from "@/lib/product-pricing";
import { Button } from "@/components/ui/button";
import { BulkProductPricingDialog } from "@/components/products/bulk-product-pricing-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Columns3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Upload,
} from "lucide-react";

const TABLE_COLUMNS = [
  { key: "image_url", label: "Image", alwaysVisible: true },
  { key: "id", label: "ID", alwaysVisible: false },
  { key: "product_key", label: "Product Key", alwaysVisible: false },
  { key: "category", label: "Category", alwaysVisible: false },
  { key: "product_name", label: "Product Name", alwaysVisible: false },
  { key: "cost_usd", label: "Cost USD", alwaysVisible: false },
  { key: "logistics_usd", label: "Logistics USD", alwaysVisible: false },
  { key: "total_cost_usd", label: "Total Cost USD", alwaysVisible: false },
  { key: "margin_pct", label: "Margin %", alwaysVisible: false },
  { key: "price_usd", label: "Price USD", alwaysVisible: false },
  { key: "price_ars", label: "Price ARS", alwaysVisible: false },
  { key: "promo_price_ars", label: "Promo Price ARS", alwaysVisible: false },
  { key: "bancarizada_total", label: "Bancarizada Total", alwaysVisible: false },
  { key: "bancarizada_cuota", label: "Bancarizada Cuota", alwaysVisible: false },
  { key: "bancarizada_interest", label: "Bancarizada Interest %", alwaysVisible: false },
  { key: "macro_total", label: "Macro Total", alwaysVisible: false },
  { key: "macro_cuota", label: "Macro Cuota", alwaysVisible: false },
  { key: "macro_interest", label: "Macro Interest %", alwaysVisible: false },
  { key: "cuotas_qty", label: "Cuotas Qty", alwaysVisible: false },
  { key: "in_stock", label: "In Stock", alwaysVisible: false },
  { key: "delivery_type", label: "Delivery Type", alwaysVisible: false },
  { key: "delivery_days", label: "Delivery Days", alwaysVisible: false },
  { key: "usd_rate", label: "USD Rate", alwaysVisible: false },
  { key: "ram_gb", label: "RAM GB", alwaysVisible: false },
  { key: "storage_gb", label: "Storage GB", alwaysVisible: false },
  { key: "color", label: "Color", alwaysVisible: false },
  { key: "network", label: "Network", alwaysVisible: false },
  { key: "battery_health", label: "Battery Health", alwaysVisible: false },
  { key: "condition", label: "Condition", alwaysVisible: false },
  { key: "created_at", label: "Created", alwaysVisible: false },
  { key: "updated_at", label: "Updated", alwaysVisible: false },
];

const DEFAULT_VISIBLE_COLUMNS = [
  "image_url",
  "id",
  "product_key",
  "category",
  "product_name",
  "price_usd",
  "price_ars",
  "in_stock",
];

const ALWAYS_VISIBLE_COLUMNS = TABLE_COLUMNS.filter((column) => column.alwaysVisible).map(
  (column) => column.key
);

const STORAGE_KEY = "techno-store-visible-columns-v3";

type ProductDisplay = Product;
type ProductFormValue = string | number | boolean;

const EXPORT_COLUMNS: Array<{ key: keyof ProductDisplay; label: string }> = [
  { key: "product_key", label: "Product Key" },
  { key: "category", label: "Category" },
  { key: "product_name", label: "Product Name" },
  { key: "condition", label: "Condition" },
  { key: "ram_gb", label: "RAM GB" },
  { key: "storage_gb", label: "Storage GB" },
  { key: "color", label: "Color" },
  { key: "network", label: "Network" },
  { key: "battery_health", label: "Battery Health" },
  { key: "cost_usd", label: "Cost USD" },
  { key: "logistics_usd", label: "Logistics USD" },
  { key: "total_cost_usd", label: "Total Cost USD" },
  { key: "margin_pct", label: "Margin %" },
  { key: "price_usd", label: "Price USD" },
  { key: "price_ars", label: "Price ARS" },
  { key: "promo_price_ars", label: "Promo Price ARS" },
  { key: "bancarizada_total", label: "Bancarizada Total" },
  { key: "bancarizada_cuota", label: "Bancarizada Cuota" },
  { key: "bancarizada_interest", label: "Bancarizada Interest %" },
  { key: "macro_total", label: "Macro Total" },
  { key: "macro_cuota", label: "Macro Cuota" },
  { key: "macro_interest", label: "Macro Interest %" },
  { key: "cuotas_qty", label: "Cuotas Qty" },
  { key: "in_stock", label: "In Stock" },
  { key: "delivery_type", label: "Delivery Type" },
  { key: "delivery_days", label: "Delivery Days" },
  { key: "usd_rate", label: "USD Rate" },
  { key: "image_url", label: "Image URL" },
];

function normalizeVisibleColumns(columns: string[]): string[] {
  const validColumns = new Set(TABLE_COLUMNS.map((column) => column.key));
  return [...new Set([...ALWAYS_VISIBLE_COLUMNS, ...columns])].filter((column) =>
    validColumns.has(column)
  );
}

function getStoredVisibleColumns(): string[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return normalizeVisibleColumns(parsed.length > 0 ? parsed : DEFAULT_VISIBLE_COLUMNS);
    }
  } catch {
    // ignore
  }
  return normalizeVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
}

function formatPercentValue(value: number): string {
  return `${(value * 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatArs(value: number): string {
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCellValue(product: ProductDisplay, key: string): string {
  const val = product[key as keyof ProductDisplay];
  if (val === null || val === undefined) return "—";
  if (key === "margin_pct" || key === "bancarizada_interest" || key === "macro_interest") {
    return typeof val === "number" ? formatPercentValue(val) : String(val);
  }
  if (key === "battery_health") {
    return typeof val === "number" ? `${val}%` : String(val);
  }
  if (key === "in_stock") return val ? "Yes" : "No";
  if (key === "price_usd" || key === "cost_usd" || key === "logistics_usd" || key === "total_cost_usd")
    return typeof val === "number" ? formatUsd(val) : String(val);
  if (key.includes("price") || key.includes("bancarizada") || key.includes("macro"))
    return typeof val === "number" ? formatArs(val) : String(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (key === "created_at" || key === "updated_at")
    return new Date(val as string).toLocaleString();
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    if (typeof val[0] === "string") return (val as string[]).join(" | ");
    return `${val.length} items`;
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getExportValue(product: ProductDisplay, key: keyof ProductDisplay): string {
  const value = product[key];

  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;

  return JSON.stringify(value);
}

const EDITABLE_COLUMNS = [
  { key: "product_key", label: "Product Key", type: "text" as const },
  { key: "category", label: "Category", type: "text" as const },
  { key: "product_name", label: "Product Name", type: "text" as const },
  { key: "cost_usd", label: "Cost USD", type: "number" as const },
  { key: "price_usd", label: "Price USD", type: "number" as const },
  { key: "price_ars", label: "Price ARS", type: "number" as const },
  { key: "logistics_usd", label: "Logistics USD", type: "number" as const },
  { key: "promo_price_ars", label: "Promo Price ARS", type: "number" as const },
  { key: "bancarizada_interest", label: "Bancarizada Interest %", type: "number" as const },
  { key: "macro_interest", label: "Macro Interest %", type: "number" as const },
  { key: "cuotas_qty", label: "Cuotas Qty", type: "number" as const },
  { key: "delivery_type", label: "Delivery Type", type: "text" as const },
  { key: "delivery_days", label: "Delivery Days", type: "number" as const },
  { key: "usd_rate", label: "USD Rate", type: "number" as const },
  { key: "ram_gb", label: "RAM GB", type: "number" as const },
  { key: "storage_gb", label: "Storage GB", type: "number" as const },
  { key: "color", label: "Color", type: "text" as const },
  { key: "network", label: "Network", type: "text" as const },
  { key: "battery_health", label: "Battery Health", type: "number" as const },
  { key: "condition", label: "Condition", type: "text" as const },
  { key: "image_url", label: "Image URL", type: "text" as const },
];

const QUICK_ADD_ADVANCED_COLUMNS = EDITABLE_COLUMNS.filter(
  ({ key }) => !["product_name", "image_url", "color", "battery_health", "condition"].includes(key)
);

const DEFAULT_VALUES: Partial<ProductInsert> = {
  logistics_usd: 10,
  bancarizada_interest: 0.5,
  macro_interest: 0.4,
  cuotas_qty: 6,
  in_stock: false,
  delivery_type: "immediate",
  delivery_days: 0,
  usd_rate: 1460,
  condition: "new",
  color: null,
  battery_health: null,
};

function buildProductUpdatePayload(
  formData: Record<string, ProductFormValue>
): { payload: ProductUpdate | null; error?: string } {
  const update: Record<string, string | number | boolean | null> = {};

  EDITABLE_COLUMNS.forEach(({ key, type }) => {
    if (key === "image_url") return;

    const value = formData[key];

    if (type === "number") {
      update[key] = parseNumericValue(value);
      return;
    }

    update[key] = parseOptionalText(value);
  });

  const productKey = parseOptionalText(update.product_key);
  const category = parseOptionalText(update.category);
  const productName = parseOptionalText(update.product_name);
  const condition = normalizeProductCondition(update.condition);
  const color = normalizeProductColorValue(update.color);
  const batteryHealth = normalizeBatteryHealthValue(update.battery_health);

  if (!productKey) return { payload: null, error: "Product Key is required." };
  if (!category) return { payload: null, error: "Category is required." };
  if (!productName) return { payload: null, error: "Product Name is required." };
  const variantError = validateProductCatalogVariant({
    condition,
    color,
    batteryHealth,
  });
  if (variantError) {
    return { payload: null, error: variantError };
  }

  update.product_key = productKey;
  update.category = category;
  update.product_name = productName;
  update.condition = condition;
  update.color = color;
  update.battery_health = batteryHealth;

  const { snapshot: pricingSnapshot, error: pricingError } = buildProductPricingSnapshot({
    priceUsd: update.price_usd,
    priceArs: update.price_ars,
    promoPriceArs: update.promo_price_ars,
    usdRate: update.usd_rate,
    cuotasQty: update.cuotas_qty,
    bancarizadaInterest: update.bancarizada_interest,
    macroInterest: update.macro_interest,
  });

  if (!pricingSnapshot) {
    return { payload: null, error: pricingError || "Sell price is required." };
  }

  update.price_usd = pricingSnapshot.priceUsd;
  update.price_ars = pricingSnapshot.priceArs;
  update.promo_price_ars = pricingSnapshot.promoPriceArs;
  update.usd_rate = pricingSnapshot.usdRate;
  update.cuotas_qty = pricingSnapshot.cuotasQty;
  update.bancarizada_interest = pricingSnapshot.bancarizadaInterest;
  update.macro_interest = pricingSnapshot.macroInterest;
  update.bancarizada_total = pricingSnapshot.bancarizadaTotal;
  update.bancarizada_cuota = pricingSnapshot.bancarizadaCuota;
  update.macro_total = pricingSnapshot.macroTotal;
  update.macro_cuota = pricingSnapshot.macroCuota;
  const costSnapshot = buildProductCostSnapshot({
    costUsd: update.cost_usd,
    logisticsUsd: update.logistics_usd,
    priceUsd: pricingSnapshot.priceUsd,
  });
  update.cost_usd = costSnapshot.costUsd;
  update.logistics_usd = costSnapshot.logisticsUsd;
  update.total_cost_usd = costSnapshot.totalCostUsd;
  update.margin_pct = costSnapshot.marginPct;

  return { payload: update as ProductUpdate };
}

function buildProductInsertPayload(
  insert: ProductInsert
): { payload: ProductInsert | null; error?: string } {
  const productKey = parseOptionalText(insert.product_key);
  const category = parseOptionalText(insert.category);
  const productName = parseOptionalText(insert.product_name);
  const condition = normalizeProductCondition(insert.condition) ?? "new";
  const color = normalizeProductColorValue(insert.color);
  const batteryHealth = normalizeBatteryHealthValue(insert.battery_health);

  if (!productKey) return { payload: null, error: "Product Key is required." };
  if (!category) return { payload: null, error: "Category is required." };
  if (!productName) return { payload: null, error: "Product Name is required." };
  const variantError = validateProductCatalogVariant({
    condition,
    color,
    batteryHealth,
  });
  if (variantError) {
    return { payload: null, error: variantError };
  }
  const { snapshot: pricingSnapshot, error: pricingError } = buildProductPricingSnapshot({
    priceUsd: insert.price_usd,
    priceArs: insert.price_ars,
    promoPriceArs: insert.promo_price_ars,
    usdRate: insert.usd_rate,
    cuotasQty: insert.cuotas_qty,
    bancarizadaInterest: insert.bancarizada_interest,
    macroInterest: insert.macro_interest,
  });

  if (!pricingSnapshot) {
    return { payload: null, error: pricingError || "Sell price is required." };
  }
  const costSnapshot = buildProductCostSnapshot({
    costUsd: insert.cost_usd,
    logisticsUsd: insert.logistics_usd,
    priceUsd: pricingSnapshot.priceUsd,
  });

  return {
    payload: {
      ...insert,
      product_key: productKey,
      category,
      product_name: productName,
      delivery_type: parseOptionalText(insert.delivery_type) ?? "immediate",
      color,
      network: parseOptionalText(insert.network),
      battery_health: batteryHealth,
      image_url: parseOptionalText(insert.image_url),
      condition,
      cost_usd: costSnapshot.costUsd,
      logistics_usd: costSnapshot.logisticsUsd,
      total_cost_usd: costSnapshot.totalCostUsd,
      margin_pct: costSnapshot.marginPct,
      price_usd: pricingSnapshot.priceUsd,
      price_ars: pricingSnapshot.priceArs,
      promo_price_ars: pricingSnapshot.promoPriceArs,
      usd_rate: pricingSnapshot.usdRate,
      cuotas_qty: pricingSnapshot.cuotasQty,
      bancarizada_interest: pricingSnapshot.bancarizadaInterest,
      macro_interest: pricingSnapshot.macroInterest,
      bancarizada_total: pricingSnapshot.bancarizadaTotal,
      bancarizada_cuota: pricingSnapshot.bancarizadaCuota,
      macro_total: pricingSnapshot.macroTotal,
      macro_cuota: pricingSnapshot.macroCuota,
    },
  };
}

function getProductErrorMessage(error: unknown, action: "adding" | "updating" | "deleting"): string {
  const message = getErrorMessage(error, `Unexpected error ${action} product.`);

  if (isRowLevelSecurityError(error)) {
    return "RLS blocked this product save. Allow writes to products in Supabase first."
  }

  if (message.includes("products_product_key_key") || message.includes("duplicate key")) {
    return "Product Key already exists."
  }

  if (message.includes("chk_products_condition")) {
    return "Condition must be New, Like New, Used, or Refurbished."
  }

  if (message.includes("chk_products_battery_health")) {
    return "Battery Health must be between 0 and 100."
  }

  if (message.includes("chk_products_catalog_variant")) {
    return "Used, Like New, and Refurbished products need battery health. New products must leave it empty."
  }

  if (message.includes("null value in column")) {
    if (message.includes("\"product_key\"")) return "Product Key is required."
    if (message.includes("\"category\"")) return "Category is required."
    if (message.includes("\"product_name\"")) return "Product Name is required."
    if (message.includes("\"price_usd\"")) return "Price USD is required."
    if (message.includes("\"price_ars\"")) return "Price ARS is required."
    if (message.includes("\"condition\"")) return "Condition is required."
    if (message.includes("\"battery_health\"")) return "Battery Health is required for non-new products."
  }

  return message
}

function getSortValue(product: ProductDisplay, key: string): string | number | boolean | null {
  const val = product[key as keyof ProductDisplay];
  if (val === null || val === undefined) return null;
  if (key === "created_at" || key === "updated_at") return new Date(val as string).getTime();
  return val as string | number | boolean;
}

function sortProducts(products: ProductDisplay[], column: string, direction: "asc" | "desc"): ProductDisplay[] {
  return [...products].sort((a, b) => {
    const aVal = getSortValue(a, column);
    const bVal = getSortValue(b, column);

    const aNull = aVal === null;
    const bNull = bVal === null;
    if (aNull && bNull) return 0;
    if (aNull) return direction === "asc" ? 1 : -1;
    if (bNull) return direction === "asc" ? -1 : 1;

    let cmp = 0;
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
      cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0);
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }
    return direction === "asc" ? cmp : -cmp;
  });
}

function toFormValue(product: ProductDisplay | null, key: string): string | number | boolean {
  if (!product) {
    const def = DEFAULT_VALUES[key as keyof ProductInsert];
    return (def as string | number | boolean | undefined) ?? "";
  }
  const val = product[key as keyof ProductDisplay];
  if (val === null || val === undefined) return "";
  return val as string | number | boolean;
}

function parseNumericValue(value: string | number | boolean | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferCategoryFromName(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("iphone")) return "IPHONE";
  if (normalized.includes("samsung") || normalized.includes("galaxy")) return "SAMSUNG";
  if (
    normalized.includes("redmi") ||
    normalized.includes("poco") ||
    normalized.includes("xiaomi") ||
    /\bmi\b/.test(normalized)
  ) {
    return "REDMI/POCO";
  }
  if (normalized.includes("motorola") || normalized.includes("moto")) return "MOTOROLA";

  return "GENERAL";
}

type QuickAddPreview = {
  marginBandLabel: string;
  insert: ProductInsert;
};

function buildQuickAddPreview(
  formData: Record<string, ProductFormValue>,
  products: ProductDisplay[],
  pricingDefaults: PricingDefaults
): QuickAddPreview | null {
  const trimmedName = String(formData.product_name ?? "").trim();
  const costUsd = parseNumericValue(formData.cost_usd);
  const condition = normalizeProductCondition(formData.condition) ?? "new";
  const color = normalizeProductColorValue(formData.color);
  const batteryHealth =
    condition === "new" ? null : normalizeBatteryHealthValue(formData.battery_health);

  if (!trimmedName || costUsd === null || costUsd <= 0) return null;

  const logisticsUsd = pricingDefaults.logisticsUsd;
  const usdRate = pricingDefaults.usdRate;
  const cuotasQty = pricingDefaults.cuotasQty;
  const bancarizadaInterest = pricingDefaults.bancarizadaInterest;
  const macroInterest = pricingDefaults.macroInterest;
  const marginBand =
    pricingDefaults.marginBands.find((band) => costUsd <= band.maxCostUsd) ??
    pricingDefaults.marginBands[pricingDefaults.marginBands.length - 1];

  const totalCostUsd = roundUsdAmount(costUsd + logisticsUsd);
  const priceUsd = roundUsdAmount(totalCostUsd * (1 + marginBand.marginPct));
  const priceArs = roundArsAmount(priceUsd * usdRate);
  const bancarizadaTotal = roundArsAmount(priceArs * (1 + bancarizadaInterest));
  const macroTotal = roundArsAmount(priceArs * (1 + macroInterest));

  return {
    marginBandLabel: marginBand.label,
    insert: {
      product_key: buildProductKeyFromCatalog({
        productName: trimmedName,
        color,
        batteryHealth,
        existingKeys: products.map((product) => product.product_key),
      }),
      category: inferCategoryFromName(trimmedName),
      product_name: trimmedName,
      cost_usd: roundUsdAmount(costUsd),
      logistics_usd: logisticsUsd,
      total_cost_usd: totalCostUsd,
      margin_pct: marginBand.marginPct,
      price_usd: priceUsd,
      price_ars: priceArs,
      promo_price_ars: null,
      bancarizada_total: bancarizadaTotal,
      bancarizada_cuota: roundArsAmount(bancarizadaTotal / cuotasQty),
      bancarizada_interest: bancarizadaInterest,
      macro_total: macroTotal,
      macro_cuota: roundArsAmount(macroTotal / cuotasQty),
      macro_interest: macroInterest,
      cuotas_qty: cuotasQty,
      in_stock: Boolean(DEFAULT_VALUES.in_stock ?? false),
      delivery_type: String(DEFAULT_VALUES.delivery_type ?? "immediate"),
      delivery_days: Number(DEFAULT_VALUES.delivery_days ?? 0),
      usd_rate: usdRate,
      ram_gb: null,
      storage_gb: null,
      color,
      network: null,
      battery_health: batteryHealth,
      image_url: null,
      condition,
    },
  };
}

function buildQuickAddInsertWithOverrides(
  preview: QuickAddPreview | null,
  formData: Record<string, ProductFormValue>
): ProductInsert | null {
  if (!preview) return null;

  const resolved: Record<string, unknown> = { ...preview.insert };

  QUICK_ADD_ADVANCED_COLUMNS.forEach(({ key, type }) => {
    const value = formData[key];

    if (value === undefined || value === "") return;

    if (type === "number") {
      const parsed = parseNumericValue(value);
      if (parsed !== null) resolved[key] = parsed;
      return;
    }

    resolved[key] = String(value);
  });

  const { snapshot } = buildProductPricingSnapshot({
    priceUsd: resolved.price_usd,
    priceArs: resolved.price_ars,
    promoPriceArs: resolved.promo_price_ars,
    usdRate: resolved.usd_rate,
    cuotasQty: resolved.cuotas_qty,
    bancarizadaInterest: resolved.bancarizada_interest,
    macroInterest: resolved.macro_interest,
  });

  if (!snapshot) return null;

  resolved.price_usd = snapshot.priceUsd;
  resolved.price_ars = snapshot.priceArs;
  resolved.promo_price_ars = snapshot.promoPriceArs;
  resolved.usd_rate = snapshot.usdRate;
  resolved.cuotas_qty = snapshot.cuotasQty;
  resolved.bancarizada_interest = snapshot.bancarizadaInterest;
  resolved.macro_interest = snapshot.macroInterest;
  resolved.bancarizada_total = snapshot.bancarizadaTotal;
  resolved.bancarizada_cuota = snapshot.bancarizadaCuota;
  resolved.macro_total = snapshot.macroTotal;
  resolved.macro_cuota = snapshot.macroCuota;
  const costSnapshot = buildProductCostSnapshot({
    costUsd: resolved.cost_usd,
    logisticsUsd: resolved.logistics_usd,
    priceUsd: resolved.price_usd,
  });
  resolved.cost_usd = costSnapshot.costUsd;
  resolved.logistics_usd = costSnapshot.logisticsUsd;
  resolved.total_cost_usd = costSnapshot.totalCostUsd;
  resolved.margin_pct = costSnapshot.marginPct;

  return resolved as ProductInsert;
}

function ProductImageCell({ product }: { product: ProductDisplay }) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = typeof product.image_url === "string" ? product.image_url.trim() : "";

  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  if (!imageUrl || hasError) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        No image
      </div>
    );
  }

  return (
    <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
      <img
        src={imageUrl}
        alt={product.product_name}
        className="h-14 w-14 rounded-md border object-cover"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </a>
  );
}

async function uploadProductImage(file: File, productKey: string): Promise<{ secureUrl?: string; error?: string }> {
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("productKey", productKey);

  const uploadResponse = await fetch("/api/cloudinary/upload", {
    method: "POST",
    body: uploadFormData,
  });

  const uploadResult = (await uploadResponse.json()) as { error?: string; secureUrl?: string };
  if (!uploadResponse.ok || !uploadResult.secureUrl) {
    return { error: uploadResult.error || "Error uploading image to Cloudinary." };
  }

  return { secureUrl: uploadResult.secureUrl };
}

async function deleteProductImage(imageUrl: string, productKey?: string): Promise<string | null> {
  const response = await fetch("/api/cloudinary/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageUrl,
      productKey,
    }),
  });

  if (response.ok) return null;

  const result = (await response.json()) as { error?: string };
  return result.error || "Error deleting image from Cloudinary.";
}

function getCloudinaryAssetIdentity(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    const uploadMarker = "/image/upload/";
    const markerIndex = url.pathname.indexOf(uploadMarker);

    if (markerIndex === -1) return null;

    const assetPath = url.pathname.slice(markerIndex + uploadMarker.length);
    const segments = assetPath.split("/").filter(Boolean);

    if (segments.length === 0) return null;

    const withoutVersion =
      segments[0] && /^v\d+$/.test(segments[0]) ? segments.slice(1) : segments;

    if (withoutVersion.length === 0) return null;

    const lastSegment = withoutVersion[withoutVersion.length - 1];
    withoutVersion[withoutVersion.length - 1] = lastSegment.replace(/\.[^.]+$/, "");

    return withoutVersion.join("/");
  } catch {
    return null;
  }
}

function matchesProductSearch(product: ProductDisplay, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const searchableValues = [
    product.product_name,
    product.product_key,
    product.category,
    product.color,
    product.network,
    product.image_url,
    product.condition,
    product.battery_health != null ? String(product.battery_health) : null,
    product.id != null ? String(product.id) : null,
    product.price_usd != null ? String(product.price_usd) : null,
    product.price_ars != null ? String(product.price_ars) : null,
  ];

  return searchableValues.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

export function ProductsTable() {
  const [products, setProducts] = useState<ProductDisplay[]>([]);
  const [pricingDefaults, setPricingDefaults] = useState<PricingDefaults>(DEFAULT_PRICING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<ProductDisplay | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<ProductDisplay | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, ProductFormValue>>({});
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);
  const [editImageMarkedForRemoval, setEditImageMarkedForRemoval] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedDefaults, setShowAdvancedDefaults] = useState(false);
  const [bulkPricingOpen, setBulkPricingOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    normalizeVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
  );
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const quickAddImageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredProducts = products.filter((product) =>
    matchesProductSearch(product, deferredSearchQuery)
  );
  const sortedProducts =
    sortColumn && filteredProducts.length > 0
      ? sortProducts(filteredProducts, sortColumn, sortDirection)
      : filteredProducts;
  const quickAddCondition = normalizeProductCondition(formData.condition) ?? "new";
  const quickAddBatteryRequired = requiresProductBatteryHealth(quickAddCondition);
  const quickAddVariantError = validateProductCatalogVariant({
    condition: quickAddCondition,
    color: formData.color,
    batteryHealth: quickAddCondition === "new" ? null : formData.battery_health,
  });
  const quickAddPreview = buildQuickAddPreview(formData, products, pricingDefaults);
  const resolvedQuickAddInsert = buildQuickAddInsertWithOverrides(quickAddPreview, formData);

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImageFile]);

  useEffect(() => {
    if (!editImageFile) {
      setEditImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(editImageFile);
    setEditImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [editImageFile]);

  useEffect(() => {
    setVisibleColumns(getStoredVisibleColumns());
  }, []);

  const toggleColumn = (key: string, checked: boolean) => {
    if (ALWAYS_VISIBLE_COLUMNS.includes(key)) return;
    const next = normalizeVisibleColumns(
      checked ? [...visibleColumns, key] : visibleColumns.filter((c) => c !== key)
    );
    setVisibleColumns(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const selectAllColumns = () => {
    const all = normalizeVisibleColumns(TABLE_COLUMNS.map((c) => c.key));
    setVisibleColumns(all);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  };

  const deselectAllColumns = () => {
    setVisibleColumns(ALWAYS_VISIBLE_COLUMNS);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ALWAYS_VISIBLE_COLUMNS));
    }
  };

  const handleTableWheel = (e: React.WheelEvent) => {
    const el = tableScrollRef.current;
    if (!el) return;
    const hasHorizontalOverflow = el.scrollWidth > el.clientWidth;
    const hasVerticalOverflow = el.scrollHeight > el.clientHeight;

    // Shift + wheel: horizontal scroll
    if (e.shiftKey && hasHorizontalOverflow) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      return;
    }

    // Vertical wheel: prefer vertical scroll when possible, else horizontal (for wide tables)
    if (!e.shiftKey && hasHorizontalOverflow && !hasVerticalOverflow) {
      e.preventDefault();
      el.scrollLeft -= e.deltaY;
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    const [productsRes, settingsRes] = await Promise.all([
      supabase.from("products").select("*").order("id", { ascending: true }),
      supabase
        .from("store_settings")
        .select("key,value")
        .in("key", [
          "pricing_default_usd_rate",
          "usd_to_ars",
          "pricing_default_logistics_usd",
          "logistics_usd",
          "pricing_default_cuotas_qty",
          "cuotas_qty",
          "pricing_bancarizada_interest",
          "bancarizada_interest",
          "pricing_macro_interest",
          "macro_interest",
          "pricing_margin_band_1_max_cost_usd",
          "pricing_margin_band_1_margin_pct",
          "pricing_margin_band_2_max_cost_usd",
          "pricing_margin_band_2_margin_pct",
          "pricing_margin_band_3_max_cost_usd",
          "pricing_margin_band_3_margin_pct",
          "pricing_margin_band_4_max_cost_usd",
          "pricing_margin_band_4_margin_pct",
        ]),
    ]);

    if (productsRes.error) {
      console.error("Error fetching products:", productsRes.error);
      setProducts([]);
    } else {
      setProducts((productsRes.data ?? []) as ProductDisplay[]);
    }

    if (settingsRes.error) {
      console.error("Error fetching pricing defaults:", settingsRes.error);
      setPricingDefaults(DEFAULT_PRICING_DEFAULTS);
    } else {
      setPricingDefaults(
        buildPricingDefaultsFromStoreSettings((settingsRes.data ?? []) as Array<Pick<StoreSetting, "key" | "value">>)
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openEdit = (product: ProductDisplay) => {
    setEditProduct(product);
    const data: Record<string, ProductFormValue> = {};
    EDITABLE_COLUMNS.forEach(({ key }) => {
      data[key] = toFormValue(product, key);
    });
    setFormData(data);
    setEditImageFile(null);
    setEditImageMarkedForRemoval(false);
    if (editImageInputRef.current) {
      editImageInputRef.current.value = "";
    }
  };

  const openAdd = () => {
    setEditProduct(null);
    setFormData({
      product_name: "",
      cost_usd: "",
      condition: "new",
      color: "",
      battery_health: "",
    });
    setSelectedImageFile(null);
    setShowAdvancedDefaults(false);
    if (quickAddImageInputRef.current) {
      quickAddImageInputRef.current.value = "";
    }
    setAddOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editProduct) return;
    setSaving(true);
    const { payload: update, error: payloadError } = buildProductUpdatePayload(formData);

    if (!update) {
      alert(payloadError || "Invalid product data.");
      setSaving(false);
      return;
    }

    try {
      const nextProductKey = String(update.product_key ?? editProduct.product_key ?? "").trim();
      if (nextProductKey !== editProduct.product_key) {
        const { count, error: stockCountError } = await supabase
          .from("stock_units")
          .select("id", { count: "exact", head: true })
          .eq("product_key", editProduct.product_key);

        if (stockCountError) {
          throw stockCountError;
        }

        if ((count ?? 0) > 0) {
          alert("You can't change Product Key after stock units exist. Create a new product instead.");
          return;
        }
      }

      const previousImageUrl =
        typeof editProduct.image_url === "string" && editProduct.image_url.trim()
          ? editProduct.image_url.trim()
          : null;
      let nextImageUrl =
        editImageMarkedForRemoval || editImageFile
          ? null
          : typeof formData.image_url === "string" && formData.image_url.trim()
            ? formData.image_url.trim()
            : null;
      let uploadedImageUrl: string | null = null;

      if (editImageFile) {
        if (!nextProductKey) {
          alert("Product Key is required to upload a replacement image.");
          return;
        }

        const uploadResult = await uploadProductImage(editImageFile, nextProductKey);
        if (!uploadResult.secureUrl) {
          alert(uploadResult.error || "Error uploading image to Cloudinary.");
          return;
        }

        uploadedImageUrl = uploadResult.secureUrl;
        nextImageUrl = uploadResult.secureUrl;
      }

      update.image_url = nextImageUrl;

      const { error } = await supabase
        .from("products")
        .update(update)
        .eq("id", editProduct.id);

      if (error) {
        if (uploadedImageUrl && uploadedImageUrl !== previousImageUrl) {
          const cleanupError = await deleteProductImage(uploadedImageUrl, nextProductKey);
          if (cleanupError) {
            console.error("Failed to clean up uploaded product image after DB error:", cleanupError);
          }
        }
        alert(getProductErrorMessage(error, "updating"));
        return;
      }

      const previousAssetIdentity = previousImageUrl ? getCloudinaryAssetIdentity(previousImageUrl) : null;
      const nextAssetIdentity = nextImageUrl ? getCloudinaryAssetIdentity(nextImageUrl) : null;
      const replacedWithDifferentAsset =
        previousImageUrl !== nextImageUrl && previousAssetIdentity !== nextAssetIdentity;

      if ((editImageMarkedForRemoval || editImageFile) && previousImageUrl && replacedWithDifferentAsset) {
        const deleteError = await deleteProductImage(previousImageUrl, editProduct.product_key);
        if (deleteError) {
          console.error("Failed to delete replaced product image:", deleteError);
        }
      }

      setEditProduct(null);
      setEditImageFile(null);
      setEditImageMarkedForRemoval(false);
      if (editImageInputRef.current) {
        editImageInputRef.current.value = "";
      }
      fetchProducts();
    } catch (error) {
      alert(getProductErrorMessage(error, "updating"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdd = async () => {
    if (!resolvedQuickAddInsert) {
      alert("Product Name and a valid Cost USD are required.");
      return;
    }

    setSaving(true);
    try {
      const { payload: insertPayload, error: payloadError } = buildProductInsertPayload(resolvedQuickAddInsert);
      if (!insertPayload) {
        alert(payloadError || "Invalid product data.");
        return;
      }

      let imageUrl: string | null = null;

      if (selectedImageFile) {
        const uploadResult = await uploadProductImage(selectedImageFile, insertPayload.product_key);
        if (!uploadResult.secureUrl) {
          alert(uploadResult.error || "Error uploading image to Cloudinary.");
          return;
        }

        imageUrl = uploadResult.secureUrl;
      }

      const { error } = await supabase
        .from("products")
        .insert({ ...insertPayload, image_url: imageUrl });

      if (error) {
        if (imageUrl) {
          const cleanupError = await deleteProductImage(imageUrl, insertPayload.product_key);
          if (cleanupError) {
            console.error("Failed to clean up uploaded product image after insert error:", cleanupError);
          }
        }
        alert(getProductErrorMessage(error, "adding"));
        return;
      }

      setAddOpen(false);
      setFormData({});
      setSelectedImageFile(null);
      setShowAdvancedDefaults(false);
      if (quickAddImageInputRef.current) {
        quickAddImageInputRef.current.value = "";
      }
      fetchProducts();
    } catch (error) {
      alert(getProductErrorMessage(error, "adding"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;
    setSaving(true);
    const { error } = await supabase.from("products").delete().eq("id", deleteProduct.id);
    setSaving(false);
    if (error) {
      alert(getProductErrorMessage(error, "deleting"));
      return;
    }
    setDeleteProduct(null);
    fetchProducts();
  };

  const updateForm = (key: string, value: ProductFormValue) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "condition" && value === "new") {
        next.battery_health = "";
      }

      return next;
    });
  };

  const displayColumns = TABLE_COLUMNS.filter((col) => visibleColumns.includes(col.key));
  const editImageUrl =
    typeof formData.image_url === "string" && !editImageMarkedForRemoval
      ? formData.image_url.trim()
      : "";
  const editCondition = normalizeProductCondition(formData.condition) ?? "new";
  const editBatteryRequired = requiresProductBatteryHealth(editCondition);
  const editVariantError = validateProductCatalogVariant({
    condition: editCondition,
    color: formData.color,
    batteryHealth: editBatteryRequired ? formData.battery_health : null,
  });
  const editGeneratedProductKey = buildProductKeyFromCatalog({
    productName: String(formData.product_name ?? ""),
    color: normalizeProductColorValue(formData.color),
    batteryHealth: editBatteryRequired ? normalizeBatteryHealthValue(formData.battery_health) : null,
    existingKeys: products.map((product) => product.product_key),
    currentKey: editProduct?.product_key ?? null,
  });
  const quickAddSummaryItems = resolvedQuickAddInsert
    ? [
        { label: "Product Key", value: resolvedQuickAddInsert.product_key },
        { label: "Category", value: resolvedQuickAddInsert.category },
        {
          label: "Margin",
          value: formatPercentValue(resolvedQuickAddInsert.margin_pct ?? 0),
        },
        {
          label: "Price USD",
          value: formatUsd(resolvedQuickAddInsert.price_usd),
        },
        {
          label: "Price ARS",
          value: formatArs(resolvedQuickAddInsert.price_ars),
        },
        {
          label: "Bancarizada / cuota",
          value: formatArs(resolvedQuickAddInsert.bancarizada_cuota ?? 0),
        },
        {
          label: "Macro / cuota",
          value: formatArs(resolvedQuickAddInsert.macro_cuota ?? 0),
        },
        {
          label: "Total Cost USD",
          value: formatUsd(resolvedQuickAddInsert.total_cost_usd ?? 0),
        },
        {
          label: "Condition",
          value: String(resolvedQuickAddInsert.condition ?? "new"),
        },
        ...(resolvedQuickAddInsert.color
          ? [{ label: "Color", value: resolvedQuickAddInsert.color }]
          : []),
        ...(resolvedQuickAddInsert.battery_health != null
          ? [{ label: "Battery", value: `${resolvedQuickAddInsert.battery_health}%` }]
          : []),
      ]
    : [];
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  const handleExportProducts = () => {
    if (sortedProducts.length === 0 || typeof window === "undefined") return;

    const header = EXPORT_COLUMNS.map((column) => escapeCsvValue(column.label)).join(",");
    const rows = sortedProducts.map((product) =>
      EXPORT_COLUMNS.map((column) =>
        escapeCsvValue(getExportValue(product, column.key))
      ).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `technostore-products-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    }
    if (columnsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnsOpen]);

  return (
    <div className="min-h-screen bg-background px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">Products</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleExportProducts}
              disabled={sortedProducts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setBulkPricingOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Bulk Pricing</span>
              <span className="sm:hidden">Bulk</span>
            </Button>
            <div ref={columnsRef} className="relative hidden sm:block">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumnsOpen((o) => !o)}
              >
                <Columns3 className="mr-2 h-4 w-4" />
                Columns
              </Button>
              {columnsOpen && (
                <div className="absolute right-0 top-full z-[100] mt-1 w-64 rounded-md border bg-popover p-0 shadow-md">
                  <div className="flex gap-2 border-b p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      type="button"
                      onClick={selectAllColumns}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      type="button"
                      onClick={deselectAllColumns}
                    >
                      Deselect All
                    </Button>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto p-2">
                    {TABLE_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                          col.alwaysVisible ? "cursor-default opacity-70" : "cursor-pointer hover:bg-accent"
                        }`}
                      >
                        <Checkbox
                          checked={visibleColumns.includes(col.key)}
                          disabled={col.alwaysVisible}
                          onCheckedChange={(checked) =>
                            toggleColumn(col.key, checked === true)
                          }
                        />
                        <span>{col.label}</span>
                        {col.alwaysVisible ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                            Always
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Image is always visible. Shift + scroll = horizontal.
                  </p>
                </div>
              )}
            </div>
            <Button onClick={openAdd} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Product</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-3 sm:mb-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, key, category, specs..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground sm:p-12">
            No products yet. Tap &quot;Add&quot; to create one.
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground sm:p-12">
            No products match &quot;{searchQuery}&quot;.
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground sm:mb-3 sm:text-sm">
              Showing {sortedProducts.length} of {products.length} products
            </p>

            {/* Mobile: Cards */}
            <div className="space-y-2 sm:hidden">
              {sortedProducts.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-3">
                  <div className="flex gap-3">
                    <div className="shrink-0">
                      <ProductImageCell product={p} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.product_name}</p>
                      <p className="text-xs text-muted-foreground">{p.category} &middot; {p.condition}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        <span className="font-medium text-emerald-400">
                          ${p.price_ars?.toLocaleString("es-AR") ?? "—"}
                        </span>
                        <span className="text-muted-foreground">
                          US${p.price_usd?.toLocaleString() ?? "—"}
                        </span>
                        {p.in_stock ? (
                          <span className="text-blue-400">In stock</span>
                        ) : (
                          <span className="text-muted-foreground">Out of stock</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => openEdit(p)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteProduct(p)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table */}
            <div
              ref={tableScrollRef}
              className="hidden overflow-auto rounded-lg border sm:block"
              style={{ maxHeight: "calc(100vh - 14rem)" }}
              onWheel={handleTableWheel}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    {displayColumns.map((col) => (
                      <TableHead
                        key={col.key}
                        className="sticky top-0 z-20 min-w-[100px] cursor-pointer select-none whitespace-nowrap bg-background px-3 py-3 hover:bg-muted/50"
                        onClick={() => handleSort(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {sortColumn === col.key ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="h-4 w-4" />
                            ) : (
                              <ArrowDown className="h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedProducts.map((p) => (
                    <TableRow key={p.id} className="group/product-row">
                      {displayColumns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={`px-3 py-2 ${col.key === "image_url" ? "min-w-[148px]" : "min-w-[100px] whitespace-nowrap"}`}
                        >
                          {col.key === "image_url" ? (
                            <div className="flex items-center gap-2">
                              <ProductImageCell product={p} />
                              <div className="flex w-0 items-center gap-1 overflow-hidden opacity-0 transition-[width,opacity] duration-150 pointer-events-none group-hover/product-row:w-[72px] group-hover/product-row:opacity-100 group-hover/product-row:pointer-events-auto group-focus-within/product-row:w-[72px] group-focus-within/product-row:opacity-100 group-focus-within/product-row:pointer-events-auto">
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 cursor-pointer"
                                  onClick={() => openEdit(p)}
                                  aria-label={`Edit ${p.product_name}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 cursor-pointer text-destructive hover:text-destructive"
                                  onClick={() => setDeleteProduct(p)}
                                  aria-label={`Delete ${p.product_name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : col.key === "id" ? (
                            <span className="font-mono text-xs">{p.id}</span>
                          ) : col.key === "in_stock" ? (
                            p.in_stock ? (
                              <Badge variant="default">Yes</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )
                          ) : (
                            formatCellValue(p, col.key)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={!!editProduct && !addOpen}
        onOpenChange={(open) => {
          if (open) return;
          setEditProduct(null);
          setEditImageFile(null);
          setEditImageMarkedForRemoval(false);
          if (editImageInputRef.current) {
            editImageInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {EDITABLE_COLUMNS.map(({ key, label, type }) => (
                <div key={key} className={key === "image_url" ? "col-span-2 space-y-2" : "space-y-2"}>
                  <Label htmlFor={key}>{label}</Label>
                  {key === "image_url" ? (
                    <div className="space-y-3 rounded-md border p-4">
                      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Current Image</p>
                          {editImagePreviewUrl ? (
                            <div className="overflow-hidden rounded-lg border bg-muted">
                              <img
                                src={editImagePreviewUrl}
                                alt="Selected edit preview"
                                className="h-40 w-full object-cover"
                              />
                            </div>
                          ) : editImageUrl ? (
                            <div className="overflow-hidden rounded-lg border bg-muted">
                              <img
                                src={editImageUrl}
                                alt="Current product image"
                                className="h-40 w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="edit-image-upload">Upload Image</Label>
                            <Input
                              id="edit-image-upload"
                              ref={editImageInputRef}
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                setEditImageFile(event.target.files?.[0] ?? null);
                                if (event.target.files?.[0]) {
                                  setEditImageMarkedForRemoval(false);
                                }
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Upload a new file to replace the current image, or add one if the product
                              has none.
                            </p>
                          </div>

                          <div className="rounded-md bg-muted/50 p-3 text-sm">
                            {editImageMarkedForRemoval ? (
                              <p className="text-destructive">The current image will be removed on save.</p>
                            ) : editImageFile ? (
                              <p>New image selected. Saving will update the product image.</p>
                            ) : editImageUrl ? (
                              <p className="break-all text-muted-foreground">{editImageUrl}</p>
                            ) : (
                              <p className="text-muted-foreground">No image URL saved for this product yet.</p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {editImageUrl ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditImageMarkedForRemoval((current) => !current)}
                              >
                                {editImageMarkedForRemoval ? "Undo Remove" : "Delete Image"}
                              </Button>
                            ) : null}
                            {editImageFile ? (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditImageFile(null);
                                  if (editImageInputRef.current) {
                                    editImageInputRef.current.value = "";
                                  }
                                }}
                              >
                                Clear Selected File
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : key === "product_key" ? (
                    <div className="space-y-2">
                      <Input
                        id={key}
                        type="text"
                        value={typeof formData[key] === "boolean" ? "" : String(formData[key] ?? "")}
                        onChange={(event) => updateForm(key, event.target.value)}
                        placeholder={label}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Generated from product name, catalog color, and battery when applicable.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateForm("product_key", editGeneratedProductKey)}
                        >
                          Regenerate
                        </Button>
                      </div>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        Suggested key: {editGeneratedProductKey || "Waiting for product name"}
                      </p>
                    </div>
                  ) : type === "text" && key === "delivery_type" ? (
                    <Select
                      value={String(formData[key] ?? "")}
                      onValueChange={(v) => updateForm(key, v)}
                    >
                      <SelectTrigger id={key}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="pickup">Pickup</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : type === "text" && key === "condition" ? (
                    <Select
                      value={String(formData[key] ?? "new")}
                      onValueChange={(value) => updateForm(key, value)}
                    >
                      <SelectTrigger id={key}>
                        <SelectValue placeholder="Select condition..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_CONDITION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : key === "battery_health" ? (
                    editBatteryRequired ? (
                      <div className="space-y-2">
                        <Input
                          id={key}
                          type="number"
                          min="0"
                          max="100"
                          value={
                            typeof formData[key] === "boolean"
                              ? ""
                              : String(formData[key] ?? "")
                          }
                          onChange={(event) =>
                            updateForm(
                              key,
                              event.target.value === "" ? "" : parseFloat(event.target.value)
                            )
                          }
                          placeholder="93"
                        />
                        <p className="text-xs text-muted-foreground">
                          Required for used, like-new, and refurbished products.
                        </p>
                      </div>
                    ) : (
                      <div className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                        New products keep this empty
                      </div>
                    )
                  ) : key === "color" ? (
                    <div className="space-y-2">
                      <Input
                        id={key}
                        type="text"
                        value={typeof formData[key] === "boolean" ? "" : String(formData[key] ?? "")}
                        onChange={(event) => updateForm(key, event.target.value)}
                        placeholder={label}
                      />
                      <p className="text-xs text-muted-foreground">
                        Fill this only when the storefront offer guarantees one exact color.
                      </p>
                    </div>
                  ) : (
                    <Input
                      id={key}
                      type={type}
                      value={
                        typeof formData[key] === "boolean"
                          ? ""
                          : String(formData[key] ?? "")
                      }
                      onChange={(e) =>
                        updateForm(
                          key,
                          type === "number"
                            ? (e.target.value === "" ? "" : parseFloat(e.target.value))
                            : e.target.value
                        )
                      }
                      placeholder={label}
                    />
                  )}
                </div>
              ))}
            </div>
            {editVariantError ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {editVariantError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || Boolean(editVariantError)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setFormData({});
            setSelectedImageFile(null);
            setShowAdvancedDefaults(false);
            if (quickAddImageInputRef.current) {
              quickAddImageInputRef.current.value = "";
            }
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Quick Add Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-product-name">Product Name</Label>
                <Input
                  id="add-product-name"
                  value={String(formData.product_name ?? "")}
                  onChange={(e) => updateForm("product_name", e.target.value)}
                  placeholder="iPhone 15 128GB"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-cost-usd">Cost USD</Label>
                <Input
                  id="add-cost-usd"
                  type="number"
                  value={typeof formData.cost_usd === "boolean" ? "" : String(formData.cost_usd ?? "")}
                  onChange={(e) =>
                    updateForm("cost_usd", e.target.value === "" ? "" : parseFloat(e.target.value))
                  }
                  placeholder="499"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="add-condition">Condition</Label>
                <Select
                  value={quickAddCondition}
                  onValueChange={(value) => updateForm("condition", value)}
                >
                  <SelectTrigger id="add-condition">
                    <SelectValue placeholder="Select condition..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CONDITION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-color">Color</Label>
                <Input
                  id="add-color"
                  value={String(formData.color ?? "")}
                  onChange={(event) => updateForm("color", event.target.value)}
                  placeholder="Dorado, Negro, Azul T..."
                />
              </div>
              {quickAddBatteryRequired ? (
                <div className="space-y-2">
                  <Label htmlFor="add-battery-health">Battery Health *</Label>
                  <Input
                    id="add-battery-health"
                    type="number"
                    min="0"
                    max="100"
                    value={typeof formData.battery_health === "boolean" ? "" : String(formData.battery_health ?? "")}
                    onChange={(event) =>
                      updateForm(
                        "battery_health",
                        event.target.value === "" ? "" : parseFloat(event.target.value)
                      )
                    }
                    placeholder="93"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Battery Health</Label>
                  <div className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                    New products keep this empty
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Catalog Rules</p>
              <p className="mt-1 text-sm">
                `product_key` is generated from the product name plus catalog color and battery when
                those are part of the customer-facing variant.
              </p>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                Generated key: {quickAddPreview?.insert.product_key ?? "Waiting for product name and cost"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                New products leave battery empty. Used / like-new / refurbished products require a
                battery health value so the key and storefront variant stay exact.
              </p>
              {quickAddVariantError ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{quickAddVariantError}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label htmlFor="add-image">Product Image</Label>
                <Input
                  id="add-image"
                  ref={quickAddImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => setSelectedImageFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  If you choose a file, it will be uploaded to Cloudinary folder
                  <span className="font-medium text-foreground"> assets</span> using the generated
                  product key.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                {selectedImagePreviewUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={selectedImagePreviewUrl}
                      alt="Selected product preview"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    No image selected
                  </div>
                )}
              </div>
            </div>

            {quickAddPreview ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Auto-calculated values</p>
                    <p className="text-xs text-muted-foreground">
                      {quickAddPreview.marginBandLabel} margin band, logistics {formatUsd(
                        quickAddPreview.insert.logistics_usd ?? 0
                      )}, USD rate {quickAddPreview.insert.usd_rate}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Catalog pricing stays on product</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdvancedDefaults((current) => !current)}
                    >
                      {showAdvancedDefaults ? "Hide Defaults" : "Show Defaults"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {quickAddSummaryItems.map((item) => (
                    <div key={item.label} className="rounded-md border bg-background p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>

                {showAdvancedDefaults && resolvedQuickAddInsert ? (
                  <div className="mt-4 space-y-4 rounded-md border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Editable defaults</p>
                        <p className="text-xs text-muted-foreground">
                          Review the generated product data and change it here before saving. Product
                          cost and sell price stay on the catalog item; stock costs do not reprice it.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFormData((current) => ({
                            product_name: current.product_name ?? "",
                            cost_usd: current.cost_usd ?? "",
                            condition: current.condition ?? "new",
                            color: current.color ?? "",
                            battery_health:
                              current.condition && current.condition !== "new"
                                ? current.battery_health ?? ""
                                : "",
                          }))
                        }
                      >
                        Reset Changes
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {QUICK_ADD_ADVANCED_COLUMNS.map(({ key, label, type }) => {
                        const currentValue = resolvedQuickAddInsert[key as keyof ProductInsert];

                        return (
                          <div key={key} className="space-y-2">
                            <Label htmlFor={`quick-add-${key}`}>{label}</Label>
                            {type === "text" && key === "delivery_type" ? (
                              <Select
                                value={String(currentValue ?? "immediate")}
                                onValueChange={(value) => updateForm(key, value)}
                              >
                                <SelectTrigger id={`quick-add-${key}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="immediate">Immediate</SelectItem>
                                  <SelectItem value="scheduled">Scheduled</SelectItem>
                                  <SelectItem value="pickup">Pickup</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : type === "text" && key === "condition" ? (
                              <Select
                                value={String(currentValue ?? "new")}
                                onValueChange={(value) => updateForm(key, value)}
                              >
                                <SelectTrigger id={`quick-add-${key}`}>
                                  <SelectValue placeholder="Select condition..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRODUCT_CONDITION_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={`quick-add-${key}`}
                                type={type}
                                value={
                                  typeof currentValue === "boolean"
                                    ? ""
                                    : currentValue === null || currentValue === undefined
                                      ? ""
                                      : String(currentValue)
                                }
                                onChange={(event) =>
                                  updateForm(
                                    key,
                                    type === "number"
                                      ? event.target.value === ""
                                        ? ""
                                        : parseFloat(event.target.value)
                                      : event.target.value
                                  )
                                }
                                placeholder={label}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Enter a product name and a valid USD cost to generate the category, product key,
                selling price, installment totals, and the storefront variant fields automatically.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAdd}
              disabled={saving || !resolvedQuickAddInsert || Boolean(quickAddVariantError)}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkProductPricingDialog
        open={bulkPricingOpen}
        onOpenChange={setBulkPricingOpen}
        products={products}
        onApplied={fetchProducts}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(o) => !o && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteProduct?.product_name}&quot;? This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
