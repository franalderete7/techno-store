"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { StockUnit } from "@/types/stock";
import { DollarSign, TrendingUp, BarChart3 } from "lucide-react";

type Period = "daily" | "monthly";

interface SalesChartProps {
  units: StockUnit[];
  currency?: string;
}

export function SalesChart({ units, currency = "USD" }: SalesChartProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const soldUnits = useMemo(
    () => units.filter((u) => u.status === "sold"),
    [units]
  );

  const getSoldDate = (u: StockUnit): string => {
    return u.date_sold ?? u.updated_at ?? u.created_at;
  };

  const totals = useMemo(() => {
    const revenue = soldUnits.reduce((sum, u) => sum + (u.price_sold ?? 0), 0);
    const cost = soldUnits.reduce((sum, u) => sum + (u.cost_unit ?? 0), 0);
    return { count: soldUnits.length, revenue, cost, profit: revenue - cost };
  }, [soldUnits]);

  const chartData = useMemo(() => {
    if (period === "daily") {
      const map = new Map<string, { count: number; revenue: number }>();
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        map.set(key, { count: 0, revenue: 0 });
      }
      soldUnits.forEach((u) => {
        const key = getSoldDate(u).split("T")[0];
        const entry = map.get(key);
        if (entry) {
          entry.count++;
          entry.revenue += u.price_sold ?? 0;
        }
      });
      return Array.from(map.entries()).map(([date, data]) => ({
        label: new Date(date + "T12:00:00").toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
        }),
        ...data,
      }));
    }

    const map = new Map<string, { count: number; revenue: number }>();
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { count: 0, revenue: 0 });
    }
    soldUnits.forEach((u) => {
      const d = new Date(getSoldDate(u));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key);
      if (entry) {
        entry.count++;
        entry.revenue += u.price_sold ?? 0;
      }
    });
    return Array.from(map.entries()).map(([ym, data]) => {
      const [y, m] = ym.split("-");
      const d = new Date(+y, +m - 1, 1);
      return {
        label: d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }),
        ...data,
      };
    });
  }, [soldUnits, period]);

  const fmt = (n: number) =>
    `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Sales Overview</h2>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          <button
            onClick={() => setPeriod("daily")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === "daily"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setPeriod("monthly")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Last 12 Months
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-4">
        <MiniStat label="Units Sold" value={String(totals.count)} icon={TrendingUp} />
        <MiniStat label="Revenue" value={fmt(totals.revenue)} icon={DollarSign} />
        <MiniStat label="Cost" value={fmt(totals.cost)} icon={DollarSign} />
        <MiniStat
          label="Profit"
          value={fmt(totals.profit)}
          icon={TrendingUp}
          className={totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}
        />
      </div>

      <div className="p-4">
        {soldUnits.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No sold units yet. Mark units as &ldquo;Sold&rdquo; to see analytics.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval={period === "daily" ? 4 : 0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  color: "hsl(var(--foreground))",
                  fontSize: 13,
                }}
                formatter={(value, name) => [
                  name === "revenue" ? fmt(Number(value)) : value,
                  name === "revenue" ? `Revenue (${currency})` : "Units",
                ]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${className}`}>{value}</p>
    </div>
  );
}
