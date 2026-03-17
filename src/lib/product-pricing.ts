import { parseOptionalNumber } from "@/lib/utils";

type ProductPricingInput = {
  priceUsd?: unknown;
  priceArs?: unknown;
  promoPriceArs?: unknown;
  usdRate?: unknown;
  cuotasQty?: unknown;
  bancarizadaInterest?: unknown;
  macroInterest?: unknown;
};

export type ProductPricingSnapshot = {
  priceUsd: number;
  priceArs: number;
  promoPriceArs: number | null;
  usdRate: number;
  cuotasQty: number;
  bancarizadaInterest: number;
  macroInterest: number;
  bancarizadaTotal: number;
  bancarizadaCuota: number;
  macroTotal: number;
  macroCuota: number;
};

export type ProductCostSnapshot = {
  costUsd: number | null;
  logisticsUsd: number | null;
  totalCostUsd: number | null;
  marginPct: number | null;
};

export function roundUsdAmount(value: number): number {
  return Number(value.toFixed(2));
}

export function roundArsAmount(value: number): number {
  return Math.round(value);
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const parsed = parseOptionalNumber(value);
  return parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = parseOptionalNumber(value);
  return parsed != null && Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.round(parsed))
    : fallback;
}

export function buildProductPricingSnapshot(
  input: ProductPricingInput
): { snapshot: ProductPricingSnapshot | null; error?: string } {
  const usdRate = normalizePositiveNumber(input.usdRate, 1460);
  const cuotasQty = normalizePositiveInteger(input.cuotasQty, 6);
  const bancarizadaInterest = normalizePositiveNumber(input.bancarizadaInterest, 0.5);
  const macroInterest = normalizePositiveNumber(input.macroInterest, 0.4);

  let priceUsd = parseOptionalNumber(input.priceUsd);
  let priceArs = parseOptionalNumber(input.priceArs);
  let promoPriceArs = parseOptionalNumber(input.promoPriceArs);

  priceUsd = priceUsd != null && priceUsd > 0 ? roundUsdAmount(priceUsd) : null;
  priceArs = priceArs != null && priceArs > 0 ? roundArsAmount(priceArs) : null;
  promoPriceArs = promoPriceArs != null && promoPriceArs > 0 ? roundArsAmount(promoPriceArs) : null;

  if (priceUsd == null && priceArs == null) {
    return { snapshot: null, error: "Price USD or Price ARS is required." };
  }

  if (priceArs == null && priceUsd != null) {
    priceArs = roundArsAmount(priceUsd * usdRate);
  }

  if (priceUsd == null && priceArs != null) {
    priceUsd = roundUsdAmount(priceArs / usdRate);
  }

  if (priceUsd == null || priceArs == null) {
    return { snapshot: null, error: "Could not resolve sell prices." };
  }

  const bancarizadaTotal = roundArsAmount(priceArs * (1 + bancarizadaInterest));
  const macroTotal = roundArsAmount(priceArs * (1 + macroInterest));

  return {
    snapshot: {
      priceUsd,
      priceArs,
      promoPriceArs,
      usdRate,
      cuotasQty,
      bancarizadaInterest,
      macroInterest,
      bancarizadaTotal,
      bancarizadaCuota: roundArsAmount(bancarizadaTotal / cuotasQty),
      macroTotal,
      macroCuota: roundArsAmount(macroTotal / cuotasQty),
    },
  };
}

export function buildProductCostSnapshot(input: {
  costUsd?: unknown;
  logisticsUsd?: unknown;
  priceUsd?: unknown;
}): ProductCostSnapshot {
  const costUsd = parseOptionalNumber(input.costUsd);
  const logisticsUsd = parseOptionalNumber(input.logisticsUsd);
  const priceUsd = parseOptionalNumber(input.priceUsd);

  const nextCostUsd = costUsd != null && costUsd >= 0 ? roundUsdAmount(costUsd) : null;
  const nextLogisticsUsd =
    logisticsUsd != null && logisticsUsd >= 0 ? roundUsdAmount(logisticsUsd) : null;
  const totalCostUsd =
    nextCostUsd != null || nextLogisticsUsd != null
      ? roundUsdAmount((nextCostUsd ?? 0) + (nextLogisticsUsd ?? 0))
      : null;

  let marginPct: number | null = null;
  if (totalCostUsd != null && totalCostUsd > 0 && priceUsd != null && priceUsd > 0) {
    marginPct = Number(((priceUsd - totalCostUsd) / totalCostUsd).toFixed(4));
  }

  return {
    costUsd: nextCostUsd,
    logisticsUsd: nextLogisticsUsd,
    totalCostUsd,
    marginPct,
  };
}
