"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CreditCard,
  Funnel,
  MessageSquareText,
  PackageSearch,
  Tags,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  VConversationSignalDaily,
  VCustomerContext,
  VFunnelDaily,
} from "@/types/database";

const STAGE_ORDER = ["new", "browsing", "interested", "closing", "human_handoff"] as const;
const STAGE_LABELS: Record<string, string> = {
  new: "Nuevo",
  browsing: "Explorando",
  interested: "Interesado",
  closing: "Cierre",
  human_handoff: "Asesor",
};
const STAGE_COLORS: Record<string, string> = {
  new: "#64748b",
  browsing: "#38bdf8",
  interested: "#f59e0b",
  closing: "#22c55e",
  human_handoff: "#ef4444",
};

const normalizeSignal = (value: string | null | undefined) =>
  String(value || "")
    .replace(/^pay_/, "")
    .replace(/^topic_/, "")
    .replace(/^brand_/, "")
    .replace(/^stage_/, "")
    .replace(/^intent_/, "")
    .replace(/^prov_/, "")
    .replace(/^loc_/, "")
    .replace(/^behavior_/, "")
    .replace(/^_/g, "")
    .replace(/_/g, " ")
    .trim();

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

const formatLongDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

type FunnelChartRow = {
  date: string;
  label: string;
  total: number;
} & Record<string, number | string>;

type SignalSummary = {
  key: string;
  label: string;
  mentions: number;
  customers: number;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SignalList({
  title,
  icon: Icon,
  rows,
  empty,
}: {
  title: string;
  icon: typeof Tags;
  rows: SignalSummary[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground">{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  {row.mentions} menciones · {row.customers} personas
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(10, 100 - index * 14)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrmDashboard() {
  const [loading, setLoading] = useState(true);
  const [funnelRows, setFunnelRows] = useState<VFunnelDaily[]>([]);
  const [signalRows, setSignalRows] = useState<VConversationSignalDaily[]>([]);
  const [customerRows, setCustomerRows] = useState<VCustomerContext[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [funnelRes, signalRes, customerRes] = await Promise.all([
        supabase
          .from("v_funnel_daily")
          .select("activity_date,funnel_stage,stage_label,sort_order,color_hex,customers_reached")
          .order("activity_date", { ascending: false })
          .limit(180),
        supabase
          .from("v_conversation_signal_daily")
          .select("activity_date,signal_type,signal_key,mentions,unique_customers")
          .order("activity_date", { ascending: false })
          .limit(1200),
        supabase
          .from("v_customer_context")
          .select(
            "id,manychat_id,city,is_salta_capital,preferred_brand,payment_method_last,payment_methods_mentioned,products_mentioned,brands_mentioned,topics_mentioned,funnel_stage,last_funnel_change_at,last_intent,lead_score,tags,total_interactions,first_seen_at,lead_source,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
      ]);

      if (cancelled) return;

      const firstError = funnelRes.error || signalRes.error || customerRes.error;
      if (firstError) {
        setError(firstError.message);
        setFunnelRows([]);
        setSignalRows([]);
        setCustomerRows([]);
      } else {
        setFunnelRows((funnelRes.data || []) as VFunnelDaily[]);
        setSignalRows((signalRes.data || []) as VConversationSignalDaily[]);
        setCustomerRows((customerRes.data || []) as VCustomerContext[]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentFunnelRows = useMemo(() => {
    const map = new Map<string, FunnelChartRow>();
    const sorted = [...funnelRows]
      .filter((row) => row.activity_date && row.funnel_stage)
      .sort((a, b) => String(a.activity_date).localeCompare(String(b.activity_date)));

    for (const row of sorted) {
      const date = String(row.activity_date);
      if (!map.has(date)) {
        const base: FunnelChartRow = {
          date,
          label: formatShortDate(date),
          total: 0,
          new: 0,
          browsing: 0,
          interested: 0,
          closing: 0,
          human_handoff: 0,
        };
        map.set(date, base);
      }
      const entry = map.get(date)!;
      const stage = String(row.funnel_stage);
      const value = Number(row.customers_reached || 0);
      entry[stage] = value;
      entry.total += value;
    }

    return Array.from(map.values()).slice(-14);
  }, [funnelRows]);

  const interactionTrend = useMemo(() => {
    const dayMap = new Map<
      string,
      { date: string; label: string; interactions: number; uniqueCustomers: number }
    >();

    for (const row of signalRows) {
      if (!row.activity_date) continue;
      const date = String(row.activity_date);
      const current = dayMap.get(date) || {
        date,
        label: formatShortDate(date),
        interactions: 0,
        uniqueCustomers: 0,
      };
      current.interactions += Number(row.mentions || 0);
      current.uniqueCustomers += Number(row.unique_customers || 0);
      dayMap.set(date, current);
    }

    return Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [signalRows]);

  const currentStageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of customerRows) {
      const stage = String(row.funnel_stage || "new");
      counts.set(stage, (counts.get(stage) || 0) + 1);
    }
    return STAGE_ORDER.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      value: counts.get(stage) || 0,
      color: STAGE_COLORS[stage],
    }));
  }, [customerRows]);

  const topSignalsByType = useMemo(() => {
    const aggregate = (type: string) => {
      const map = new Map<string, SignalSummary>();
      signalRows
        .filter((row) => row.signal_type === type)
        .forEach((row) => {
          const key = String(row.signal_key || "").trim();
          if (!key) return;
          const existing = map.get(key) || {
            key,
            label: normalizeSignal(key),
            mentions: 0,
            customers: 0,
          };
          existing.mentions += Number(row.mentions || 0);
          existing.customers += Number(row.unique_customers || 0);
          map.set(key, existing);
        });
      return Array.from(map.values())
        .sort((a, b) => b.mentions - a.mentions || b.customers - a.customers)
        .slice(0, 6);
    };

    return {
      payment: aggregate("payment"),
      product: aggregate("product"),
      topic: aggregate("topic"),
      brand: aggregate("brand"),
      tag: aggregate("tag"),
    };
  }, [signalRows]);

  const totals = useMemo(() => {
    const totalCustomers = customerRows.length;
    const activeLeads = customerRows.filter((row) => {
      const stage = String(row.funnel_stage || "new");
      return ["browsing", "interested", "closing"].includes(stage);
    }).length;
    const handoff = customerRows.filter((row) => row.funnel_stage === "human_handoff").length;
    const interactions14d = interactionTrend.reduce((sum, row) => sum + row.interactions, 0);
    const hottestStage = [...currentStageCounts].sort((a, b) => b.value - a.value)[0];

    return {
      totalCustomers,
      activeLeads,
      handoff,
      interactions14d,
      hottestStage: hottestStage?.label || "-",
    };
  }, [customerRows, currentStageCounts, interactionTrend]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),transparent_26%)] p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Funnel className="h-4 w-4" />
            CRM analytics
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Daily funnel and conversation signals
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              This view uses Supabase as source of truth for stage progression, tags,
              products mentioned, payment mentions, and conversation topics.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={MessageSquareText}
            label="Interactions (14d)"
            value={totals.interactions14d.toLocaleString("es-AR")}
            hint="Conversation signals captured from Supabase"
          />
          <MetricCard
            icon={TrendingUp}
            label="Active leads"
            value={totals.activeLeads.toLocaleString("es-AR")}
            hint="Customers currently in browsing, interested or closing"
          />
          <MetricCard
            icon={Activity}
            label="Human handoff"
            value={totals.handoff.toLocaleString("es-AR")}
            hint="Customers currently waiting on an advisor"
          />
          <MetricCard
            icon={Funnel}
            label="Largest stage"
            value={totals.hottestStage}
            hint={`${totals.totalCustomers.toLocaleString("es-AR")} customers tracked`}
          />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Funnel reach by day</p>
                <p className="text-xs text-muted-foreground">
                  Distinct customers who reached each stage on that day.
                </p>
              </div>
              {recentFunnelRows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Window: {formatLongDate(recentFunnelRows[0].date)} to{" "}
                  {formatLongDate(recentFunnelRows[recentFunnelRows.length - 1].date)}
                </p>
              )}
            </div>
            {loading ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                Loading funnel data...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {error}. Run the CRM funnel migration and refresh the app types.
              </div>
            ) : recentFunnelRows.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                No funnel activity yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={recentFunnelRows}
                  margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-border/70"
                  />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={34} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, borderColor: "rgba(148,163,184,0.2)" }}
                    formatter={(value, key) => [
                      Number(value || 0),
                      STAGE_LABELS[String(key)] || String(key),
                    ]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  {STAGE_ORDER.map((stage) => (
                    <Bar
                      key={stage}
                      dataKey={stage}
                      stackId="funnel"
                      fill={STAGE_COLORS[stage]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium">Conversation pulse</p>
              <p className="text-xs text-muted-foreground">
                Daily mention volume across products, payments, topics, brands and applied tags.
              </p>
            </div>
            {loading ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Loading conversation signals...
              </div>
            ) : interactionTrend.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                No signal activity yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={interactionTrend}
                  margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-border/70"
                  />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={34} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, borderColor: "rgba(148,163,184,0.2)" }}
                    formatter={(value, key) => [
                      Number(value || 0),
                      String(key) === "interactions" ? "Interacciones" : "Personas",
                    ]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <Line type="monotone" dataKey="interactions" stroke="#0ea5e9" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="uniqueCustomers" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
              <Funnel className="h-4 w-4 text-primary" />
              Current stage mix
            </div>
            {currentStageCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            ) : (
              <div className="space-y-3">
                {currentStageCounts.map((stage) => {
                  const max = Math.max(...currentStageCounts.map((item) => item.value), 1);
                  return (
                    <div key={stage.stage}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{stage.label}</span>
                        <span className="text-xs text-muted-foreground">{stage.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${(stage.value / max) * 100}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SignalList
            title="Top payment mentions"
            icon={CreditCard}
            rows={topSignalsByType.payment}
            empty="No payment data yet."
          />
          <SignalList
            title="Top products mentioned"
            icon={PackageSearch}
            rows={topSignalsByType.product}
            empty="No product mentions yet."
          />
          <SignalList
            title="Top conversation topics"
            icon={Tags}
            rows={topSignalsByType.topic}
            empty="No topic tags yet."
          />
          <SignalList
            title="Top brands mentioned"
            icon={TrendingUp}
            rows={topSignalsByType.brand}
            empty="No brand signals yet."
          />
        </div>
      </div>

      <div className="border-t p-4 sm:p-5">
        <div className="rounded-2xl border bg-background/70 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Tags className="h-4 w-4 text-primary" />
            Operational tags driving the funnel
          </div>
          {topSignalsByType.tag.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operational tags recorded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topSignalsByType.tag.map((row) => (
                <span
                  key={row.key}
                  className="rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {normalizeSignal(row.key)} · {row.mentions}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
