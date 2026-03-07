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
  Package2,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import type { StockStatus, StockUnit } from "@/types/stock";
import { STOCK_STATUS_OPTIONS } from "@/types/stock";

type Period = "daily" | "monthly";

interface SalesChartProps {
  units: StockUnit[];
  currency?: string;
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
  revenue: number;
  profit: number;
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

const getSaleDate = (unit: StockUnit) => unit.date_sold ?? unit.updated_at ?? unit.created_at;

export function SalesChart({ units, currency = "ARS" }: SalesChartProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const soldUnits = useMemo(
    () => units.filter((unit) => unit.status === "sold"),
    [units]
  );

  const totals = useMemo(() => {
    const revenue = soldUnits.reduce((sum, unit) => sum + (unit.price_sold ?? 0), 0);
    const count = soldUnits.length;
    const profit = soldUnits.reduce(
      (sum, unit) => sum + (unit.price_sold ?? 0) - (unit.cost_unit ?? 0),
      0
    );

    return {
      count,
      revenue,
      profit,
      avgTicket: count > 0 ? revenue / count : 0,
      sellThrough: units.length > 0 ? (count / units.length) * 100 : 0,
    };
  }, [soldUnits, units.length]);

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
          revenue: 0,
          profit: 0,
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
          revenue: 0,
          profit: 0,
        });
      }
    }

    soldUnits.forEach((unit) => {
      const soldDate = new Date(getSaleDate(unit));
      if (Number.isNaN(soldDate.getTime())) return;

      const key = period === "daily" ? formatDayKey(soldDate) : formatMonthKey(soldDate);
      const entry = buckets.get(key);
      if (!entry) return;

      entry.units += 1;
      entry.revenue += unit.price_sold ?? 0;
      entry.profit += (unit.price_sold ?? 0) - (unit.cost_unit ?? 0);
    });

    return Array.from(buckets.values());
  }, [period, soldUnits]);

  const activeWindow = useMemo(() => {
    return chartData.reduce(
      (summary, point) => {
        summary.units += point.units;
        summary.revenue += point.revenue;
        summary.profit += point.profit;
        return summary;
      },
      { units: 0, revenue: 0, profit: 0 }
    );
  }, [chartData]);

  const currentSnapshot = useMemo(() => {
    const now = new Date();
    const currentDayKey = formatDayKey(now);
    const currentMonthKey = formatMonthKey(now);

    return soldUnits.reduce(
      (summary, unit) => {
        const soldDate = new Date(getSaleDate(unit));
        if (Number.isNaN(soldDate.getTime())) return summary;

        if (formatDayKey(soldDate) === currentDayKey) {
          summary.todayUnits += 1;
          summary.todayRevenue += unit.price_sold ?? 0;
        }

        if (formatMonthKey(soldDate) === currentMonthKey) {
          summary.monthUnits += 1;
          summary.monthRevenue += unit.price_sold ?? 0;
        }

        return summary;
      },
      { todayUnits: 0, todayRevenue: 0, monthUnits: 0, monthRevenue: 0 }
    );
  }, [soldUnits]);

  const peakPoint = useMemo(() => {
    return chartData.reduce<ChartPoint | null>((best, point) => {
      if (!best) return point;
      if (point.revenue > best.revenue) return point;
      if (point.revenue === best.revenue && point.units > best.units) return point;
      return best;
    }, null);
  }, [chartData]);

  const formatMoney = (value: number) => {
    const prefix = currency === "USD" ? "US$" : "$";
    return `${prefix}${value.toLocaleString("es-AR", {
      maximumFractionDigits: 0,
    })}`;
  };

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
                status keeps the full current mix on the side.
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
                ? formatMoney(currentSnapshot.todayRevenue)
                : formatMoney(currentSnapshot.monthRevenue)
            }
          />
          <MetricCard
            icon={ShoppingBag}
            label={period === "daily" ? "Last 30 Days" : "Last 12 Months"}
            value={`${activeWindow.units} sold`}
            hint={formatMoney(activeWindow.revenue)}
          />
          <MetricCard
            icon={TrendingUp}
            label="Realized Profit"
            value={formatMoney(activeWindow.profit)}
            hint={`Avg ticket ${formatMoney(totals.avgTicket)}`}
            highlight={activeWindow.profit >= 0}
          />
          <MetricCard
            icon={Package2}
            label="Sell-through"
            value={`${totals.sellThrough.toFixed(0)}%`}
            hint={`${totals.count} sold of ${units.length} total`}
          />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.9fr)]">
        <div className="rounded-2xl border bg-background/70 p-3 sm:p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Trend</p>
              <p className="text-xs text-muted-foreground">
                Bars show units sold, the area shows revenue.
              </p>
            </div>
            {peakPoint && (
              <p className="text-xs text-muted-foreground">
                Peak {period === "daily" ? "day" : "month"}:{" "}
                <span className="font-medium text-foreground">
                  {peakPoint.label}
                </span>{" "}
                with {formatMoney(peakPoint.revenue)}
              </p>
            )}
          </div>

          {soldUnits.length === 0 ? (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
              <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No sold units yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                As soon as items are marked as Sold, this chart will show daily and
                monthly sales automatically.
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
                  tickFormatter={(value) => {
                    if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
                    if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
                    return `${value}`;
                  }}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;

                    const unitsValue =
                      payload.find((entry) => entry.dataKey === "units")?.value ?? 0;
                    const revenueValue =
                      payload.find((entry) => entry.dataKey === "revenue")?.value ?? 0;
                    const profitValue = payload[0]?.payload?.profit ?? 0;

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
                            <span className="font-medium text-foreground">
                              {formatMoney(Number(revenueValue))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Profit</span>
                            <span
                              className={`font-medium ${
                                Number(profitValue) >= 0
                                  ? "text-emerald-500"
                                  : "text-red-500"
                              }`}
                            >
                              {formatMoney(Number(profitValue))}
                            </span>
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
                  dataKey="revenue"
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
              <p className="text-sm font-medium">Quick read</p>
              <p className="text-xs text-muted-foreground">
                A fast summary for sales and stock movement.
              </p>
            </div>

            <div className="grid gap-3">
              <InsightRow
                label="All-time revenue"
                value={formatMoney(totals.revenue)}
                icon={BadgeDollarSign}
              />
              <InsightRow
                label="All-time profit"
                value={formatMoney(totals.profit)}
                icon={TrendingUp}
                positive={totals.profit >= 0}
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

function InsightRow({
  label,
  value,
  icon: Icon,
  positive,
}: {
  label: string;
  value: string;
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
        className={`text-sm font-medium ${
          positive === undefined
            ? "text-foreground"
            : positive
              ? "text-emerald-500"
              : "text-red-500"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
