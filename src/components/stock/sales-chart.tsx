"use client";

import type { ElementType } from "react";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Package2,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { Product } from "@/types/database";
import type { Financier, Purchase, PurchaseFinancier, StockStatus, StockUnit } from "@/types/stock";
import { STOCK_STATUS_OPTIONS } from "@/types/stock";
import {
  buildRealizedUnitSale,
  splitSaleByOwnership,
  type FinancierSaleSlice,
  type RealizedUnitSale,
} from "@/lib/accounting";

type Period = "daily" | "monthly";

interface SalesChartProps {
  units: StockUnit[];
  purchases: Purchase[];
  products: Product[];
  financiers: Financier[];
  purchaseFinanciers: PurchaseFinancier[];
}

type StatusCard = {
  status: StockStatus;
  label: string;
  count: number;
  percent: number;
  color: string;
  glow: string;
};

type ChartPoint = {
  key: string;
  label: string;
  units: number;
  revenueUsd: number;
  revenueArs: number;
  profitUsd: number;
  profitArs: number;
};

type FunderSummary = {
  fundedBy: string;
  units: number;
  revenueUsd: number;
  revenueArs: number;
  costUsd: number;
  costArs: number;
  profitUsd: number;
  profitArs: number;
};

const STATUS_COLORS: Record<StockStatus, { color: string; glow: string }> = {
  in_stock: { color: "#10b981", glow: "rgba(16, 185, 129, 0.16)" },
  reserved: { color: "#f59e0b", glow: "rgba(245, 158, 11, 0.16)" },
  sold: { color: "#3b82f6", glow: "rgba(59, 130, 246, 0.16)" },
  warranty: { color: "#f97316", glow: "rgba(249, 115, 22, 0.16)" },
  returned: { color: "#ef4444", glow: "rgba(239, 68, 68, 0.16)" },
};

const pad = (value: number) => String(value).padStart(2, "0");

const formatDayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatMonthKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

function formatUsdMoney(value: number) {
  return `US$${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatArsMoney(value: number) {
  return `$${value.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  })}`;
}

function formatMoneyPair(usd: number, ars: number) {
  return `${formatUsdMoney(usd)} · ${formatArsMoney(ars)}`;
}

function formatCompactUsd(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `US$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `US$${(value / 1_000).toFixed(0)}k`;
  return `US$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function SalesChart({
  units,
  purchases,
  products,
  financiers,
  purchaseFinanciers,
}: SalesChartProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const purchaseMap = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.purchase_id, purchase])),
    [purchases]
  );
  const financierMap = useMemo(
    () => new Map(financiers.map((financier) => [financier.id, financier])),
    [financiers]
  );
  const purchaseFinanciersByPurchaseId = useMemo(() => {
    const byPurchaseId = new Map<string, PurchaseFinancier[]>();
    purchaseFinanciers.forEach((share) => {
      const current = byPurchaseId.get(share.purchase_id) ?? [];
      current.push(share);
      byPurchaseId.set(share.purchase_id, current);
    });
    return byPurchaseId;
  }, [purchaseFinanciers]);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.product_key, product])),
    [products]
  );

  const soldStatusCount = useMemo(
    () => units.filter((unit) => unit.status === "sold").length,
    [units]
  );

  const realizedUnitSales = useMemo<(RealizedUnitSale & { purchaseId: string | null })[]>(
    () =>
      units.flatMap((unit) => {
        const product = productMap.get(unit.product_key);
        const realized = buildRealizedUnitSale(unit, product);
        if (!realized) return [];

        return [{ ...realized, purchaseId: unit.purchase_id }];
      }),
    [productMap, units]
  );

  const suspiciousLegacyRevenueCount = useMemo(
    () => realizedUnitSales.filter((sale) => sale.suspiciousLegacyRevenue).length,
    [realizedUnitSales]
  );

  const soldUnitsMissingPriceCount = soldStatusCount - realizedUnitSales.length;

  const realizedUnitSalesWithDate = useMemo(
    () =>
      realizedUnitSales.filter((sale) => {
        const soldDate = new Date(sale.dateSold);
        return !Number.isNaN(soldDate.getTime());
      }),
    [realizedUnitSales]
  );

  const soldUnitsMissingDateCount = realizedUnitSales.length - realizedUnitSalesWithDate.length;

  const financierSales = useMemo<FinancierSaleSlice[]>(
    () =>
      realizedUnitSales.flatMap((sale) =>
        splitSaleByOwnership(
          sale,
          sale.purchaseId ? purchaseMap.get(sale.purchaseId) : undefined,
          purchaseFinanciersByPurchaseId.get(sale.purchaseId ?? "") ?? [],
          financierMap
        )
      ),
    [financierMap, purchaseFinanciersByPurchaseId, purchaseMap, realizedUnitSales]
  );

  const totals = useMemo(() => {
    const revenueUsd = realizedUnitSales.reduce((sum, sale) => sum + sale.revenueUsd, 0);
    const revenueArs = realizedUnitSales.reduce((sum, sale) => sum + sale.revenueArs, 0);
    const costUsd = realizedUnitSales.reduce((sum, sale) => sum + sale.costUsd, 0);
    const costArs = realizedUnitSales.reduce((sum, sale) => sum + sale.costArs, 0);
    const count = realizedUnitSales.length;
    const profitUsd = realizedUnitSales.reduce((sum, sale) => sum + sale.profitUsd, 0);
    const profitArs = realizedUnitSales.reduce((sum, sale) => sum + sale.profitArs, 0);

    return {
      count: soldStatusCount,
      revenueUsd,
      revenueArs,
      costUsd,
      costArs,
      profitUsd,
      profitArs,
      avgTicketUsd: count > 0 ? revenueUsd / count : 0,
      avgTicketArs: count > 0 ? revenueArs / count : 0,
      sellThrough: units.length > 0 ? (soldStatusCount / units.length) * 100 : 0,
    };
  }, [realizedUnitSales, soldStatusCount, units.length]);

  const statusCards = useMemo<StatusCard[]>(() => {
    return STOCK_STATUS_OPTIONS.map((option) => {
      const count = units.filter((unit) => unit.status === option.value).length;
      const palette = STATUS_COLORS[option.value];

      return {
        status: option.value,
        label: option.label,
        count,
        percent: units.length > 0 ? (count / units.length) * 100 : 0,
        color: palette.color,
        glow: palette.glow,
      };
    });
  }, [units]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const buckets = new Map<string, ChartPoint>();
    const today = new Date();

    if (period === "daily") {
      for (let offset = 29; offset >= 0; offset -= 1) {
        const bucketDate = new Date(today);
        bucketDate.setHours(0, 0, 0, 0);
        bucketDate.setDate(bucketDate.getDate() - offset);

        const key = formatDayKey(bucketDate);
        buckets.set(key, {
          key,
          label: bucketDate.toLocaleDateString("en-US", {
            day: "2-digit",
            month: "short",
          }),
          units: 0,
          revenueUsd: 0,
          revenueArs: 0,
          profitUsd: 0,
          profitArs: 0,
        });
      }
    } else {
      for (let offset = 11; offset >= 0; offset -= 1) {
        const bucketDate = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        const key = formatMonthKey(bucketDate);

        buckets.set(key, {
          key,
          label: bucketDate.toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
          }),
          units: 0,
          revenueUsd: 0,
          revenueArs: 0,
          profitUsd: 0,
          profitArs: 0,
        });
      }
    }

    realizedUnitSalesWithDate.forEach((sale) => {
      const soldDate = new Date(sale.dateSold);
      const key = period === "daily" ? formatDayKey(soldDate) : formatMonthKey(soldDate);
      const entry = buckets.get(key);
      if (!entry) return;

      entry.units += 1;
      entry.revenueUsd += sale.revenueUsd;
      entry.revenueArs += sale.revenueArs;
      entry.profitUsd += sale.profitUsd;
      entry.profitArs += sale.profitArs;
    });

    return Array.from(buckets.values());
  }, [period, realizedUnitSalesWithDate]);

  const activeWindow = useMemo(() => {
    return chartData.reduce(
      (summary, point) => {
        summary.units += point.units;
        summary.revenueUsd += point.revenueUsd;
        summary.revenueArs += point.revenueArs;
        summary.profitUsd += point.profitUsd;
        summary.profitArs += point.profitArs;
        return summary;
      },
      { units: 0, revenueUsd: 0, revenueArs: 0, profitUsd: 0, profitArs: 0 }
    );
  }, [chartData]);

  const currentSnapshot = useMemo(() => {
    const now = new Date();
    const currentDayKey = formatDayKey(now);
    const currentMonthKey = formatMonthKey(now);

    return realizedUnitSalesWithDate.reduce(
      (summary, sale) => {
        const soldDate = new Date(sale.dateSold);

        if (formatDayKey(soldDate) === currentDayKey) {
          summary.todayUnits += 1;
          summary.todayRevenueUsd += sale.revenueUsd;
          summary.todayRevenueArs += sale.revenueArs;
        }

        if (formatMonthKey(soldDate) === currentMonthKey) {
          summary.monthUnits += 1;
          summary.monthRevenueUsd += sale.revenueUsd;
          summary.monthRevenueArs += sale.revenueArs;
        }

        return summary;
      },
      {
        todayUnits: 0,
        todayRevenueUsd: 0,
        todayRevenueArs: 0,
        monthUnits: 0,
        monthRevenueUsd: 0,
        monthRevenueArs: 0,
      }
    );
  }, [realizedUnitSalesWithDate]);

  const funderSummaries = useMemo<FunderSummary[]>(() => {
    const summaryMap = new Map<string, FunderSummary>();

    financierSales.forEach((sale) => {
      const existing = summaryMap.get(sale.key);
      if (existing) {
        existing.units += sale.sharePct / 100;
        existing.revenueUsd += sale.revenueUsd;
        existing.revenueArs += sale.revenueArs;
        existing.costUsd += sale.costUsd;
        existing.costArs += sale.costArs;
        existing.profitUsd += sale.profitUsd;
        existing.profitArs += sale.profitArs;
        return;
      }

      summaryMap.set(sale.key, {
        fundedBy: sale.label,
        units: sale.sharePct / 100,
        revenueUsd: sale.revenueUsd,
        revenueArs: sale.revenueArs,
        costUsd: sale.costUsd,
        costArs: sale.costArs,
        profitUsd: sale.profitUsd,
        profitArs: sale.profitArs,
      });
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (b.profitUsd !== a.profitUsd) return b.profitUsd - a.profitUsd;
      if (b.revenueUsd !== a.revenueUsd) return b.revenueUsd - a.revenueUsd;
      return a.fundedBy.localeCompare(b.fundedBy, "es-AR");
    });
  }, [financierSales]);

  const maxFunderProfitAbs = useMemo(() => {
    return funderSummaries.reduce((max, funder) => {
      return Math.max(max, Math.abs(funder.profitUsd));
    }, 0);
  }, [funderSummaries]);

  const topFunder = funderSummaries[0] ?? null;

  const peakPoint = useMemo(() => {
    return chartData.reduce<ChartPoint | null>((best, point) => {
      if (!best) return point;
      if (point.revenueUsd > best.revenueUsd) return point;
      if (point.revenueUsd === best.revenueUsd && point.units > best.units) return point;
      return best;
    }, null);
  }, [chartData]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Stock analytics
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Sales pulse from item status
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Daily and monthly sales are calculated from stock items marked as{" "}
                <span className="font-medium text-foreground">Sold</span>. Inventory
                status keeps the full current mix on the side, while realized revenue and
                profit come from sale snapshots on each unit. Ownership is assigned through{" "}
                <code className="mx-1 rounded bg-background/70 px-1 py-0.5">purchase_id</code>
                and split with <code className="mx-1 rounded bg-background/70 px-1 py-0.5">purchase_financiers</code>
                when a purchase is financed by more than one person. All money values
                below show USD first and ARS second.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl border bg-background/80 p-1">
            <ToggleButton
              active={period === "daily"}
              label="Daily"
              onClick={() => setPeriod("daily")}
            />
            <ToggleButton
              active={period === "monthly"}
              label="Monthly"
              onClick={() => setPeriod("monthly")}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={CalendarRange}
            label={period === "daily" ? "Today" : "This Month"}
            value={
              period === "daily"
                ? `${currentSnapshot.todayUnits} sold`
                : `${currentSnapshot.monthUnits} sold`
            }
            hint={
              period === "daily"
                ? `Revenue ${formatMoneyPair(
                    currentSnapshot.todayRevenueUsd,
                    currentSnapshot.todayRevenueArs
                  )}`
                : `Revenue ${formatMoneyPair(
                    currentSnapshot.monthRevenueUsd,
                    currentSnapshot.monthRevenueArs
                  )}`
            }
          />
          <MetricCard
            icon={ShoppingBag}
            label={period === "daily" ? "Last 30 Days" : "Last 12 Months"}
            value={`${activeWindow.units} sold`}
            hint={`Revenue ${formatMoneyPair(activeWindow.revenueUsd, activeWindow.revenueArs)}`}
          />
          <MetricCard
            icon={TrendingUp}
            label="Realized Profit"
            value={formatUsdMoney(totals.profitUsd)}
            hint={`${formatArsMoney(totals.profitArs)} · Avg ticket ${formatMoneyPair(
              totals.avgTicketUsd,
              totals.avgTicketArs
            )}`}
            highlight={totals.profitUsd >= 0}
          />
          <MetricCard
            icon={Package2}
            label="Sell-through"
            value={`${totals.sellThrough.toFixed(0)}%`}
            hint={`${totals.count} sold of ${units.length} total`}
          />
        </div>

        {soldUnitsMissingDateCount > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {soldUnitsMissingDateCount} sold item{soldUnitsMissingDateCount === 1 ? "" : "s"} still
            missing <code className="mx-1 rounded bg-background/70 px-1 py-0.5">date_sold</code>.
            Run the SQL backfill so the daily/monthly chart is exact.
          </div>
        )}
        {soldUnitsMissingPriceCount > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {soldUnitsMissingPriceCount} sold item{soldUnitsMissingPriceCount === 1 ? "" : "s"} still
            missing a valid sale snapshot. Realized profit only counts sold items with a
            saved sale amount.
          </div>
        )}
        {suspiciousLegacyRevenueCount > 0 && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <TriangleAlert className="mr-2 inline h-4 w-4 align-text-bottom" />
            {suspiciousLegacyRevenueCount} sold item{suspiciousLegacyRevenueCount === 1 ? "" : "s"} look like
            USD sale prices saved in the old ARS-only field. Review those sales before trusting the profit totals.
          </div>
        )}
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.9fr)]">
        <div className="rounded-2xl border bg-background/70 p-3 sm:p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Trend</p>
              <p className="text-xs text-muted-foreground">
                Bars show units sold, the area shows realized revenue in USD.
              </p>
            </div>
            {peakPoint && (
              <p className="text-xs text-muted-foreground">
                Peak {period === "daily" ? "day" : "month"}:{" "}
                <span className="font-medium text-foreground">
                  {peakPoint.label}
                </span>{" "}
                with {formatMoneyPair(peakPoint.revenueUsd, peakPoint.revenueArs)}
              </p>
            )}
          </div>

          {soldStatusCount === 0 ? (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
              <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No sold units yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                As soon as items are marked as Sold, this chart will show daily and
                monthly sales automatically.
              </p>
            </div>
          ) : realizedUnitSales.length === 0 ? (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
              <BadgeDollarSign className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Sold items need a sale amount</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Realized profit only includes sold items with a saved sale amount and currency snapshot.
              </p>
            </div>
          ) : realizedUnitSalesWithDate.length === 0 ? (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
              <CalendarRange className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Sold items need a valid sale date</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Realized profit already uses sold items with a saved sale snapshot, but the trend chart still
                needs <span className="font-medium text-foreground">date_sold</span> to place them in time.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/70"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={period === "daily" ? 4 : 0}
                  className="fill-muted-foreground"
                />
                <YAxis
                  yAxisId="units"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  className="fill-muted-foreground"
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tickFormatter={(value) => formatCompactUsd(Number(value))}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;

                    const unitsValue =
                      payload.find((entry) => entry.dataKey === "units")?.value ?? 0;
                    const point = payload[0]?.payload as ChartPoint | undefined;

                    return (
                      <div className="min-w-[180px] rounded-xl border bg-card p-3 text-sm shadow-lg">
                        <p className="font-medium text-foreground">{label}</p>
                        <div className="mt-2 space-y-1.5 text-muted-foreground">
                          <div className="flex items-center justify-between gap-4">
                            <span>Units sold</span>
                            <span className="font-medium text-foreground">{unitsValue}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Revenue</span>
                            <MoneyStack
                              usd={point?.revenueUsd ?? 0}
                              ars={point?.revenueArs ?? 0}
                              align="right"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Profit</span>
                            <MoneyStack
                              usd={point?.profitUsd ?? 0}
                              ars={point?.profitArs ?? 0}
                              align="right"
                              tone={(point?.profitUsd ?? 0) >= 0 ? "positive" : "negative"}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  yAxisId="units"
                  dataKey="units"
                  maxBarSize={period === "daily" ? 18 : 28}
                  radius={[8, 8, 0, 0]}
                  fill="#3b82f6"
                />
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenueUsd"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="rgba(16, 185, 129, 0.16)"
                  fillOpacity={1}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium">Current stock by status</p>
              <p className="text-xs text-muted-foreground">
                Live mix from the current item status in stock.
              </p>
            </div>

            <div className="space-y-3">
              {statusCards.map((item) => (
                <div key={item.status} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-sm">{item.label}</span>
                    </div>
                    <div className="text-right text-sm font-medium">
                      {item.count}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: item.color,
                        boxShadow: `0 0 0 1px ${item.glow} inset`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium">Profit by financier</p>
              <p className="text-xs text-muted-foreground">
                Sold units inherit ownership from the linked purchase, and split-financed
                purchases distribute revenue, cost, and profit by ownership share.
              </p>
            </div>

            {funderSummaries.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No sold items with purchase ownership yet.
              </div>
            ) : (
              <div className="space-y-3">
                {funderSummaries.map((funder) => {
                  const width =
                    maxFunderProfitAbs > 0
                      ? (Math.abs(funder.profitUsd) / maxFunderProfitAbs) * 100
                      : 0;

                  return (
                    <div key={funder.fundedBy} className="rounded-xl border bg-card/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{funder.fundedBy}</p>
                          <p className="text-xs text-muted-foreground">
                            {funder.units.toLocaleString("es-AR", {
                              minimumFractionDigits: Number.isInteger(funder.units) ? 0 : 2,
                              maximumFractionDigits: 2,
                            })} equivalent sold · Revenue {formatMoneyPair(funder.revenueUsd, funder.revenueArs)}
                          </p>
                        </div>
                        <div className="space-y-1 text-right">
                          <MoneyStack
                            usd={funder.profitUsd}
                            ars={funder.profitArs}
                            align="right"
                            tone={funder.profitUsd >= 0 ? "positive" : "negative"}
                          />
                          <p className="text-xs text-muted-foreground">
                            Cost {formatMoneyPair(funder.costUsd, funder.costArs)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            funder.profitUsd >= 0 ? "bg-emerald-500" : "bg-red-500"
                          }`}
                          style={{ width: `${funder.profitUsd === 0 ? 0 : Math.max(width, 6)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium">Quick read</p>
              <p className="text-xs text-muted-foreground">
                A fast summary for sales and stock movement.
              </p>
            </div>

            <div className="grid gap-3">
              <InsightRow
                label="All-time revenue"
                value={formatUsdMoney(totals.revenueUsd)}
                supporting={formatArsMoney(totals.revenueArs)}
                icon={BadgeDollarSign}
              />
              <InsightRow
                label="All-time cost"
                value={formatUsdMoney(totals.costUsd)}
                supporting={formatArsMoney(totals.costArs)}
                icon={ReceiptText}
              />
              <InsightRow
                label="All-time profit"
                value={formatUsdMoney(totals.profitUsd)}
                supporting={formatArsMoney(totals.profitArs)}
                icon={TrendingUp}
                positive={totals.profitUsd >= 0}
              />
              <InsightRow
                label="In stock right now"
                value={String(statusCards.find((item) => item.status === "in_stock")?.count ?? 0)}
                icon={Package2}
              />
              <InsightRow
                label="Top selling window"
                value={peakPoint?.label ?? "No sales yet"}
                icon={CalendarRange}
              />
              <InsightRow
                label="Top funded by"
                value={topFunder ? `${topFunder.fundedBy} · ${formatUsdMoney(topFunder.profitUsd)}` : "No sales yet"}
                supporting={topFunder ? formatArsMoney(topFunder.profitArs) : undefined}
                icon={CircleDollarSign}
                positive={topFunder ? topFunder.profitUsd >= 0 : undefined}
              />
              <InsightRow
                label="Owned sold items"
                value={`${funderSummaries.reduce((sum, item) => sum + item.units, 0).toLocaleString("es-AR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })} equivalent sold`}
                icon={ReceiptText}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-background/75 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p
            className={`mt-2 text-xl font-semibold tracking-tight ${
              highlight ? "text-emerald-500" : ""
            }`}
          >
            {value}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/60 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function MoneyStack({
  usd,
  ars,
  align = "left",
  tone = "default",
}: {
  usd: number;
  ars: number;
  align?: "left" | "right";
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : "text-foreground";

  return (
    <div className={`space-y-0.5 ${align === "right" ? "text-right" : ""}`}>
      <p className={`font-medium tabular-nums ${toneClass}`}>{formatUsdMoney(usd)}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{formatArsMoney(ars)}</p>
    </div>
  );
}

function InsightRow({
  label,
  value,
  supporting,
  icon: Icon,
  positive,
}: {
  label: string;
  value: string;
  supporting?: string;
  icon: ElementType;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="rounded-lg border bg-muted/60 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <span
        className="text-right"
      >
        <span
          className={`block text-sm font-medium ${
            positive === undefined
              ? "text-foreground"
              : positive
                ? "text-emerald-500"
                : "text-red-500"
          }`}
        >
          {value}
        </span>
        {supporting ? (
          <span className="block text-xs text-muted-foreground">{supporting}</span>
        ) : null}
      </span>
    </div>
  );
}
