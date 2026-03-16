import { parseOptionalNumber } from "@/lib/utils";
import type { StoreSetting } from "@/types/database";

export type PricingBand = {
  maxCostUsd: number;
  marginPct: number;
  label: string;
};

export type PricingDefaults = {
  usdRate: number;
  logisticsUsd: number;
  cuotasQty: number;
  bancarizadaInterest: number;
  macroInterest: number;
  marginBands: PricingBand[];
};

export const DEFAULT_PRICING_BANDS: PricingBand[] = [
  { maxCostUsd: 200, marginPct: 0.3, label: "USD 0 - 200" },
  { maxCostUsd: 400, marginPct: 0.25, label: "USD 201 - 400" },
  { maxCostUsd: 800, marginPct: 0.2, label: "USD 401 - 800" },
  { maxCostUsd: Number.POSITIVE_INFINITY, marginPct: 0.15, label: "USD 801+" },
];

export const DEFAULT_PRICING_DEFAULTS: PricingDefaults = {
  usdRate: 1460,
  logisticsUsd: 10,
  cuotasQty: 6,
  bancarizadaInterest: 0.5,
  macroInterest: 0.4,
  marginBands: DEFAULT_PRICING_BANDS,
};

function roundToPositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
}

function getSettingNumber(
  settingMap: Map<string, string>,
  keys: string[],
  fallback: number
) {
  for (const key of keys) {
    const parsed = parseOptionalNumber(settingMap.get(key));
    if (parsed != null && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function buildPricingDefaultsFromStoreSettings(
  settings: Array<Pick<StoreSetting, "key" | "value">> | null | undefined
): PricingDefaults {
  if (!settings || settings.length === 0) return DEFAULT_PRICING_DEFAULTS;

  const settingMap = new Map(settings.map((row) => [row.key, row.value ?? ""]));

  const usdRate = getSettingNumber(
    settingMap,
    ["pricing_default_usd_rate", "usd_to_ars"],
    DEFAULT_PRICING_DEFAULTS.usdRate
  );
  const logisticsUsd = getSettingNumber(
    settingMap,
    ["pricing_default_logistics_usd", "logistics_usd"],
    DEFAULT_PRICING_DEFAULTS.logisticsUsd
  );
  const cuotasQty = roundToPositiveInteger(
    getSettingNumber(
      settingMap,
      ["pricing_default_cuotas_qty", "cuotas_qty"],
      DEFAULT_PRICING_DEFAULTS.cuotasQty
    ),
    DEFAULT_PRICING_DEFAULTS.cuotasQty
  );
  const bancarizadaInterest = getSettingNumber(
    settingMap,
    ["pricing_bancarizada_interest", "bancarizada_interest"],
    DEFAULT_PRICING_DEFAULTS.bancarizadaInterest
  );
  const macroInterest = getSettingNumber(
    settingMap,
    ["pricing_macro_interest", "macro_interest"],
    DEFAULT_PRICING_DEFAULTS.macroInterest
  );

  const marginBands = DEFAULT_PRICING_DEFAULTS.marginBands.map((band, index) => {
    const bandNumber = index + 1;
    const maxCostUsd =
      band.maxCostUsd === Number.POSITIVE_INFINITY
        ? band.maxCostUsd
        : getSettingNumber(
            settingMap,
            [`pricing_margin_band_${bandNumber}_max_cost_usd`],
            band.maxCostUsd
          );

    return {
      maxCostUsd,
      marginPct: getSettingNumber(
        settingMap,
        [`pricing_margin_band_${bandNumber}_margin_pct`],
        band.marginPct
      ),
      label: band.label,
    };
  });

  return {
    usdRate,
    logisticsUsd,
    cuotasQty,
    bancarizadaInterest,
    macroInterest,
    marginBands,
  };
}
