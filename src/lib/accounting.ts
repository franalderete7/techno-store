import type { Product } from "@/types/database";
import type { Financier, Purchase, PurchaseFinancier, SaleCurrency, StockUnit } from "@/types/stock";

export const DEFAULT_USD_RATE = 1460;

export const DEFAULT_FINANCIERS: ReadonlyArray<Pick<Financier, "code" | "display_name">> = [
  { code: "aldegol", display_name: "Aldegol" },
  { code: "chueco", display_name: "Chueco" },
  { code: "doctora", display_name: "Doctora" },
];

export type OwnershipShareInput = {
  financierId: number | null;
  sharePct: number;
};

export type OwnershipShare = {
  financierId: number | null;
  label: string;
  key: string;
  sharePct: number;
};

export type RealizedUnitSale = {
  unitId: number;
  dateSold: string;
  revenueArs: number;
  costArs: number;
  profitArs: number;
  suspiciousLegacyRevenue: boolean;
};

export type FinancierSaleSlice = {
  label: string;
  key: string;
  sharePct: number;
  revenueArs: number;
  costArs: number;
  profitArs: number;
  dateSold: string;
};

export function normalizeSaleCurrency(value: string | null | undefined): SaleCurrency {
  return value?.toUpperCase() === "USD" ? "USD" : "ARS";
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatLegacyFundedByLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "Unassigned";
}

function normalizeOwnershipKey(label: string) {
  return label.toLocaleLowerCase("es-AR");
}

function normalizeShareValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return roundMoney(Math.max(0, value));
}

export function getFinancierOptions(financiers: Financier[]) {
  if (financiers.length > 0) return financiers;

  return DEFAULT_FINANCIERS.map((seed, index) => ({
    id: -(index + 1),
    code: seed.code,
    display_name: seed.display_name,
    active: true,
    created_at: null,
    updated_at: null,
  }));
}

export function formatOwnershipSummary(
  purchase: Purchase,
  purchaseShares: PurchaseFinancier[],
  financierMap: Map<number, Financier>
) {
  const shares = buildOwnershipShares(purchase, purchaseShares, financierMap);
  if (shares.length === 0) return "Unassigned";
  if (shares.length === 1) return shares[0].label;

  return shares
    .map((share) => `${share.label} ${share.sharePct.toFixed(share.sharePct % 1 === 0 ? 0 : 2)}%`)
    .join(" · ");
}

export function buildOwnershipShares(
  purchase: Purchase | null | undefined,
  purchaseShares: PurchaseFinancier[],
  financierMap: Map<number, Financier>
): OwnershipShare[] {
  if (purchaseShares.length > 0) {
    const normalized = purchaseShares
      .map((share) => {
        const financier = financierMap.get(share.financier_id);
        const label = financier?.display_name ?? `Financier #${share.financier_id}`;

        return {
          financierId: share.financier_id,
          label,
          key: financier?.code ?? `financier-${share.financier_id}`,
          sharePct: normalizeShareValue(share.share_pct),
        };
      })
      .filter((share) => share.sharePct > 0);

    const total = normalized.reduce((sum, share) => sum + share.sharePct, 0);
    if (normalized.length > 0 && total > 0) {
      return normalized.map((share, index) => {
        if (index !== normalized.length - 1) return share;
        const priorTotal = normalized
          .slice(0, normalized.length - 1)
          .reduce((sum, item) => sum + item.sharePct, 0);

        return {
          ...share,
          sharePct: roundMoney(Math.max(0, 100 - priorTotal)),
        };
      });
    }
  }

  const legacyLabel = formatLegacyFundedByLabel(purchase?.funded_by);
  return [
    {
      financierId: null,
      label: legacyLabel,
      key: normalizeOwnershipKey(legacyLabel),
      sharePct: 100,
    },
  ];
}

export function validateOwnershipInputs(rows: OwnershipShareInput[]) {
  const duplicates = new Set<number>();
  const seen = new Set<number>();
  const normalized = rows.map((row) => ({
    financierId: row.financierId,
    sharePct: normalizeShareValue(row.sharePct),
  }));

  normalized.forEach((row) => {
    if (row.financierId == null) return;
    if (seen.has(row.financierId)) duplicates.add(row.financierId);
    seen.add(row.financierId);
  });

  return {
    rows: normalized,
    totalPct: roundMoney(normalized.reduce((sum, row) => sum + row.sharePct, 0)),
    hasMissingFinancier: normalized.some((row) => row.financierId == null),
    hasNonPositiveShare: normalized.some((row) => row.sharePct <= 0),
    hasDuplicates: duplicates.size > 0,
  };
}

export function resolveSaleAmountArs(unit: StockUnit, product: Product | undefined) {
  if (unit.sale_amount_ars != null && unit.sale_amount_ars > 0) {
    return {
      amountArs: unit.sale_amount_ars,
      fxRate: unit.sale_fx_rate ?? null,
      suspiciousLegacyRevenue: false,
    };
  }

  const saleAmount = unit.sale_amount;
  const saleCurrency = normalizeSaleCurrency(unit.sale_currency);

  if (saleAmount != null && saleAmount > 0) {
    if (saleCurrency === "ARS") {
      return {
        amountArs: saleAmount,
        fxRate: null,
        suspiciousLegacyRevenue: false,
      };
    }

    const fxRate =
      unit.sale_fx_rate && unit.sale_fx_rate > 0
        ? unit.sale_fx_rate
        : product?.usd_rate && product.usd_rate > 0
          ? product.usd_rate
          : DEFAULT_USD_RATE;

    return {
      amountArs: roundMoney(saleAmount * fxRate),
      fxRate,
      suspiciousLegacyRevenue: false,
    };
  }

  const legacyPriceSold = unit.price_sold;
  const suspiciousLegacyRevenue =
    legacyPriceSold != null &&
    legacyPriceSold > 0 &&
    (unit.cost_currency ?? "USD").toUpperCase() === "USD" &&
    legacyPriceSold < 10_000;

  return {
    amountArs: legacyPriceSold != null && legacyPriceSold > 0 ? legacyPriceSold : null,
    fxRate: null,
    suspiciousLegacyRevenue,
  };
}

export function resolveCostAmountArs(
  unit: StockUnit,
  product: Product | undefined,
  preferredUsdRate?: number | null
) {
  if (unit.cost_ars_snapshot != null && unit.cost_ars_snapshot >= 0) {
    return unit.cost_ars_snapshot;
  }

  if (unit.cost_unit == null) return 0;
  if ((unit.cost_currency ?? "USD").toUpperCase() === "ARS") return unit.cost_unit;

  const usdRate =
    preferredUsdRate && preferredUsdRate > 0
      ? preferredUsdRate
      : product?.usd_rate && product.usd_rate > 0
        ? product.usd_rate
        : DEFAULT_USD_RATE;

  return roundMoney(unit.cost_unit * usdRate);
}

export function buildRealizedUnitSale(unit: StockUnit, product: Product | undefined): RealizedUnitSale | null {
  if (unit.status !== "sold") return null;

  const saleDate = unit.date_sold ?? "";
  const revenue = resolveSaleAmountArs(unit, product);
  if (revenue.amountArs == null || revenue.amountArs <= 0) return null;

  return {
    unitId: unit.id,
    dateSold: saleDate,
    revenueArs: revenue.amountArs,
    costArs: resolveCostAmountArs(unit, product, revenue.fxRate),
    profitArs: roundMoney(revenue.amountArs - resolveCostAmountArs(unit, product, revenue.fxRate)),
    suspiciousLegacyRevenue: revenue.suspiciousLegacyRevenue,
  };
}

export function splitSaleByOwnership(
  sale: RealizedUnitSale,
  purchase: Purchase | null | undefined,
  purchaseShares: PurchaseFinancier[],
  financierMap: Map<number, Financier>
): FinancierSaleSlice[] {
  const shares = buildOwnershipShares(purchase, purchaseShares, financierMap);

  return shares.map((share, index) => {
    const ratio = share.sharePct / 100;
    const revenueArs = roundMoney(sale.revenueArs * ratio);
    const costArs = roundMoney(sale.costArs * ratio);
    const profitArs = roundMoney(sale.profitArs * ratio);

    if (index !== shares.length - 1) {
      return {
        label: share.label,
        key: share.key,
        sharePct: share.sharePct,
        revenueArs,
        costArs,
        profitArs,
        dateSold: sale.dateSold,
      };
    }

    const prior = shares.slice(0, shares.length - 1).reduce(
      (totals, current) => {
        const currentRatio = current.sharePct / 100;
        totals.revenueArs += roundMoney(sale.revenueArs * currentRatio);
        totals.costArs += roundMoney(sale.costArs * currentRatio);
        totals.profitArs += roundMoney(sale.profitArs * currentRatio);
        return totals;
      },
      { revenueArs: 0, costArs: 0, profitArs: 0 }
    );

    return {
      label: share.label,
      key: share.key,
      sharePct: share.sharePct,
      revenueArs: roundMoney(sale.revenueArs - prior.revenueArs),
      costArs: roundMoney(sale.costArs - prior.costArs),
      profitArs: roundMoney(sale.profitArs - prior.profitArs),
      dateSold: sale.dateSold,
    };
  });
}

export function formatSaleDisplay(unit: StockUnit) {
  const currency = normalizeSaleCurrency(unit.sale_currency);
  const amount = unit.sale_amount;

  if (amount != null && amount > 0) {
    if (currency === "USD") {
      const ars = unit.sale_amount_ars != null && unit.sale_amount_ars > 0
        ? ` (~$${unit.sale_amount_ars.toLocaleString("es-AR", { maximumFractionDigits: 0 })})`
        : "";

      return `US$${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}${ars}`;
    }

    return `$${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  }

  if (unit.price_sold != null && unit.price_sold > 0) {
    return `$${unit.price_sold.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  }

  return "—";
}
