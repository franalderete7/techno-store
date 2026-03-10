"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
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
  CalendarDays,
  CreditCard,
  Funnel,
  GitCommitHorizontal,
  MessageSquareText,
  PackageSearch,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  VConversationSignalDaily,
  VCustomerContext,
  VCustomerTimelineEvent,
  VFunnelDaily,
} from "@/types/database";

const STAGE_ORDER = ["new", "browsing", "interested", "closing", "human_handoff"] as const;
type StageKey = (typeof STAGE_ORDER)[number];
type DashboardTab = "overview" | "journeys";

const STAGE_LABELS: Record<string, string> = {
  new: "Nuevo",
  browsing: "Explorando",
  interested: "Interesado",
  closing: "Cierre",
  human_handoff: "Asesor",
};

const STAGE_COLORS: Record<StageKey, string> = {
  new: "#64748b",
  browsing: "#38bdf8",
  interested: "#f59e0b",
  closing: "#22c55e",
  human_handoff: "#ef4444",
};

const STAGE_INDEX: Record<StageKey, number> = {
  new: 0,
  browsing: 1,
  interested: 2,
  closing: 3,
  human_handoff: 4,
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

const uniqueStrings = (items: string[]) => [...new Set(items.filter(Boolean))];

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

const formatTime = (value: string | null | undefined) => {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStageIndex = (stage: string | null | undefined) =>
  STAGE_INDEX[stage as StageKey] ?? -1;

const getTagTone = (group: string | null | undefined) => {
  switch (group) {
    case "payment":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "topic":
      return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
    case "brand":
      return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "stage":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "intent":
      return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "location":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border bg-muted/60 text-foreground";
  }
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

type JourneyTag = {
  key: string;
  label: string;
  group: string;
  at: string;
  preview: string;
};

type JourneyStageEvent = {
  key: string;
  label: string;
  at: string;
};

type JourneyRow = {
  customerId: number;
  label: string;
  phone: string;
  firstEventAt: string;
  lastEventAt: string;
  eventCount: number;
  furthestStage: string;
  furthestIndex: number;
  stageEventsToday: JourneyStageEvent[];
  tagsToday: JourneyTag[];
  previews: string[];
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
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
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedJourneyDate, setSelectedJourneyDate] = useState("");
  const [journeySearch, setJourneySearch] = useState("");
  const [funnelRows, setFunnelRows] = useState<VFunnelDaily[]>([]);
  const [signalRows, setSignalRows] = useState<VConversationSignalDaily[]>([]);
  const [customerRows, setCustomerRows] = useState<VCustomerContext[]>([]);
  const [timelineRows, setTimelineRows] = useState<VCustomerTimelineEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [funnelRes, signalRes, customerRes, timelineRes] = await Promise.all([
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
            "id,manychat_id,first_name,phone,whatsapp_phone,city,is_salta_capital,preferred_brand,payment_method_last,payment_methods_mentioned,products_mentioned,brands_mentioned,topics_mentioned,funnel_stage,last_funnel_change_at,last_intent,lead_score,tags,total_interactions,first_seen_at,lead_source,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase
          .from("v_customer_timeline_events")
          .select(
            "activity_date,conversation_id,conversation_role,customer_id,customer_label,customer_phone,event_at,event_type,message_preview,stage_key,stage_label,stage_sort_order,tag_group,tag_key,tag_label"
          )
          .order("event_at", { ascending: false })
          .limit(12000),
      ]);

      if (cancelled) return;

      const firstError =
        funnelRes.error || signalRes.error || customerRes.error || timelineRes.error;

      if (firstError) {
        setError(firstError.message);
        setFunnelRows([]);
        setSignalRows([]);
        setCustomerRows([]);
        setTimelineRows([]);
      } else {
        setFunnelRows((funnelRes.data || []) as VFunnelDaily[]);
        setSignalRows((signalRes.data || []) as VConversationSignalDaily[]);
        setCustomerRows((customerRes.data || []) as VCustomerContext[]);
        setTimelineRows((timelineRes.data || []) as VCustomerTimelineEvent[]);
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
        map.set(date, {
          date,
          label: formatShortDate(date),
          total: 0,
          new: 0,
          browsing: 0,
          interested: 0,
          closing: 0,
          human_handoff: 0,
        });
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

  const overviewTotals = useMemo(() => {
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

  const journeyDates = useMemo(
    () =>
      uniqueStrings(
        timelineRows.map((row) => String(row.activity_date || "").trim()).filter(Boolean)
      ).sort((a, b) => b.localeCompare(a)),
    [timelineRows]
  );

  useEffect(() => {
    if (!journeyDates.length) return;
    if (!selectedJourneyDate || !journeyDates.includes(selectedJourneyDate)) {
      setSelectedJourneyDate(journeyDates[0]);
    }
  }, [journeyDates, selectedJourneyDate]);

  const journeyRows = useMemo(() => {
    if (!selectedJourneyDate) return [] as JourneyRow[];

    const activeRows = timelineRows.filter(
      (row) => row.activity_date === selectedJourneyDate && row.customer_id !== null
    );
    if (activeRows.length === 0) return [] as JourneyRow[];

    const selectedCustomerIds = new Set(
      activeRows
        .map((row) => Number(row.customer_id))
        .filter((value) => Number.isFinite(value))
    );

    const endOfDay = new Date(`${selectedJourneyDate}T23:59:59.999`);
    const grouped = new Map<
      number,
      { label: string; phone: string; all: VCustomerTimelineEvent[]; today: VCustomerTimelineEvent[] }
    >();

    for (const row of timelineRows) {
      const customerId = Number(row.customer_id);
      if (!Number.isFinite(customerId) || !selectedCustomerIds.has(customerId)) continue;
      if (!row.event_at) continue;

      const eventDate = new Date(row.event_at);
      if (Number.isNaN(eventDate.getTime()) || eventDate > endOfDay) continue;

      const entry = grouped.get(customerId) || {
        label: String(row.customer_label || `Cliente #${customerId}`).trim(),
        phone: String(row.customer_phone || "").trim(),
        all: [],
        today: [],
      };

      entry.all.push(row);
      if (row.activity_date === selectedJourneyDate) entry.today.push(row);
      grouped.set(customerId, entry);
    }

    const search = journeySearch.trim().toLowerCase();

    return Array.from(grouped.entries())
      .map(([customerId, entry]) => {
        const allRows = [...entry.all].sort((a, b) =>
          String(a.event_at || "").localeCompare(String(b.event_at || ""))
        );
        const todayRows = [...entry.today].sort((a, b) =>
          String(a.event_at || "").localeCompare(String(b.event_at || ""))
        );

        const furthestStageRow =
          [...allRows]
            .filter((row) => getStageIndex(row.stage_key) >= 0)
            .sort((a, b) => {
              const byStage =
                Number(a.stage_sort_order || -1) - Number(b.stage_sort_order || -1);
              return byStage || String(a.event_at || "").localeCompare(String(b.event_at || ""));
            })
            .at(-1) || null;

        const stageEventsToday = todayRows
          .filter((row) => row.event_type === "stage" && row.stage_key)
          .map((row) => ({
            key: String(row.stage_key),
            label: String(row.stage_label || STAGE_LABELS[String(row.stage_key)] || row.stage_key),
            at: String(row.event_at || ""),
          }));

        const tagsToday = todayRows
          .filter((row) => row.event_type === "tag" && row.tag_key)
          .map((row) => ({
            key: String(row.tag_key),
            label: String(row.tag_label || normalizeSignal(row.tag_key)),
            group: String(row.tag_group || "tag"),
            at: String(row.event_at || ""),
            preview: String(row.message_preview || "").trim(),
          }));

        const previews = uniqueStrings(
          todayRows.map((row) => String(row.message_preview || "").trim()).filter(Boolean)
        ).slice(0, 3);

        return {
          customerId,
          label: entry.label,
          phone: entry.phone,
          firstEventAt: String(todayRows[0]?.event_at || ""),
          lastEventAt: String(todayRows.at(-1)?.event_at || ""),
          eventCount: todayRows.length,
          furthestStage: String(furthestStageRow?.stage_key || "new"),
          furthestIndex: getStageIndex(furthestStageRow?.stage_key || "new"),
          stageEventsToday,
          tagsToday,
          previews,
        } satisfies JourneyRow;
      })
      .filter((row) => {
        if (!search) return true;
        const haystack = [
          row.label,
          row.phone,
          row.furthestStage,
          ...row.tagsToday.map((tag) => `${tag.key} ${tag.label}`),
          ...row.previews,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        const byStage = b.furthestIndex - a.furthestIndex;
        if (byStage !== 0) return byStage;
        const byTime = String(b.lastEventAt).localeCompare(String(a.lastEventAt));
        if (byTime !== 0) return byTime;
        return a.label.localeCompare(b.label);
      });
  }, [journeySearch, selectedJourneyDate, timelineRows]);

  const journeyTotals = useMemo(() => {
    const stageMoves = journeyRows.reduce((sum, row) => sum + row.stageEventsToday.length, 0);
    const tagBursts = journeyRows.reduce((sum, row) => sum + row.tagsToday.length, 0);
    const reachedClosing = journeyRows.filter(
      (row) => row.furthestIndex >= STAGE_INDEX.closing
    ).length;
    const handoff = journeyRows.filter(
      (row) => row.furthestStage === "human_handoff"
    ).length;

    return {
      people: journeyRows.length,
      stageMoves,
      tagBursts,
      reachedClosing,
      handoff,
    };
  }, [journeyRows]);

  const latestJourneyDates = journeyDates.slice(0, 12);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.14),transparent_26%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Funnel className="h-4 w-4" />
              CRM analytics
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {activeTab === "overview"
                  ? "Daily funnel and conversation signals"
                  : "Customer journeys by day"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {activeTab === "overview"
                  ? "This view uses Supabase as source of truth for stage progression, tags, products mentioned, payment mentions, and conversation topics."
                  : "Follow each person from left to right across the funnel, with the exact tags and timestamps captured from conversations on the selected day."}
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-2xl border bg-background/80 p-1 shadow-sm">
            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
              Overview
            </TabButton>
            <TabButton active={activeTab === "journeys"} onClick={() => setActiveTab("journeys")}>
              Journeys
            </TabButton>
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={MessageSquareText}
              label="Interactions (14d)"
              value={overviewTotals.interactions14d.toLocaleString("es-AR")}
              hint="Conversation signals captured from Supabase"
            />
            <MetricCard
              icon={TrendingUp}
              label="Active leads"
              value={overviewTotals.activeLeads.toLocaleString("es-AR")}
              hint="Customers currently in browsing, interested or closing"
            />
            <MetricCard
              icon={Activity}
              label="Human handoff"
              value={overviewTotals.handoff.toLocaleString("es-AR")}
              hint="Customers currently waiting on an advisor"
            />
            <MetricCard
              icon={Funnel}
              label="Largest stage"
              value={overviewTotals.hottestStage}
              hint={`${overviewTotals.totalCustomers.toLocaleString("es-AR")} customers tracked`}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={Users}
              label="People active"
              value={journeyTotals.people.toLocaleString("es-AR")}
              hint={
                selectedJourneyDate
                  ? `Customers with movement on ${formatLongDate(selectedJourneyDate)}`
                  : "Select a day with activity"
              }
            />
            <MetricCard
              icon={GitCommitHorizontal}
              label="Stage moves"
              value={journeyTotals.stageMoves.toLocaleString("es-AR")}
              hint="Explicit funnel stage transitions recorded that day"
            />
            <MetricCard
              icon={Tags}
              label="Tag events"
              value={journeyTotals.tagBursts.toLocaleString("es-AR")}
              hint="Applied tag events taken from conversation writes"
            />
            <MetricCard
              icon={Funnel}
              label="Reached closing+"
              value={journeyTotals.reachedClosing.toLocaleString("es-AR")}
              hint="Customers at closing or handoff by end of that day"
            />
            <MetricCard
              icon={Activity}
              label="Advisor queue"
              value={journeyTotals.handoff.toLocaleString("es-AR")}
              hint="Customers that ended the day in human handoff"
            />
          </div>
        )}
      </div>

      {activeTab === "overview" ? (
        <>
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
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        width={34}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          borderColor: "rgba(148,163,184,0.2)",
                        }}
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
                    Daily mention volume across products, payments, topics, brands and applied
                    tags.
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
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        width={34}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          borderColor: "rgba(148,163,184,0.2)",
                        }}
                        formatter={(value, key) => [
                          Number(value || 0),
                          String(key) === "interactions" ? "Interacciones" : "Personas",
                        ]}
                        labelFormatter={(label) => `Dia ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="interactions"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="uniqueCustomers"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                      />
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
        </>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Journey lanes
                </div>
                <p className="text-sm text-muted-foreground">
                  Each row is one person with activity on the selected day. The lane extends to the
                  furthest stage reached by end of that day, while the chips below show tag events
                  and message context captured from conversations.
                </p>
              </div>

              <div className="w-full max-w-sm">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Search person, phone or tag
                </label>
                <input
                  value={journeySearch}
                  onChange={(event) => setJourneySearch(event.target.value)}
                  placeholder="Ej. Francisco, 387, pay_naranja"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {latestJourneyDates.length === 0 ? (
                <span className="text-sm text-muted-foreground">No dates with CRM activity yet.</span>
              ) : (
                latestJourneyDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedJourneyDate(date)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      date === selectedJourneyDate
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {formatLongDate(date)}
                  </button>
                ))
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border bg-background/70 text-sm text-muted-foreground">
              Loading customer journeys...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {error}. Run the CRM funnel migration and refresh the app types.
            </div>
          ) : journeyRows.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed bg-background/70 text-sm text-muted-foreground">
              No people with CRM movement on {selectedJourneyDate ? formatLongDate(selectedJourneyDate) : "that day"}.
            </div>
          ) : (
            <div className="rounded-2xl border bg-background/70">
              <div className="overflow-x-auto">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[300px_repeat(5,minmax(140px,1fr))] border-b bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <div>Person / activity</div>
                    {STAGE_ORDER.map((stage) => (
                      <div key={stage} className="text-center">
                        {STAGE_LABELS[stage]}
                      </div>
                    ))}
                  </div>

                  <div className="max-h-[780px] overflow-y-auto">
                    {journeyRows.map((row) => (
                      <div key={row.customerId} className="border-b last:border-b-0">
                        <div className="grid grid-cols-[300px_repeat(5,minmax(140px,1fr))] px-4 py-4">
                          <div className="pr-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{row.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.phone || `Cliente #${row.customerId}`}
                                </p>
                              </div>
                              <span className="rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                {row.eventCount} eventos
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              <span>
                                {formatTime(row.firstEventAt)} - {formatTime(row.lastEventAt)}
                              </span>
                              <span>Etapa final: {STAGE_LABELS[row.furthestStage] || row.furthestStage}</span>
                            </div>

                            {row.stageEventsToday.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {row.stageEventsToday.map((event) => (
                                  <span
                                    key={`${row.customerId}-${event.key}-${event.at}`}
                                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                                  >
                                    {formatTime(event.at)} · {event.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {STAGE_ORDER.map((stage, index) => {
                            const reached = row.furthestIndex >= index;
                            const isCurrent = row.furthestStage === stage;
                            const movedToday = row.stageEventsToday.find((event) => event.key === stage);

                            return (
                              <div
                                key={`${row.customerId}-${stage}`}
                                className="relative flex min-h-[104px] items-center justify-center border-l px-3"
                              >
                                {index < STAGE_ORDER.length - 1 && (
                                  <div
                                    className={`pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-full -translate-y-1/2 ${
                                      row.furthestIndex > index ? "bg-primary/35" : "bg-border/60"
                                    }`}
                                  />
                                )}

                                <div className="relative z-10 flex flex-col items-center gap-2">
                                  <div
                                    className={`h-4 w-4 rounded-full border-2 ${
                                      reached
                                        ? "border-primary bg-primary"
                                        : "border-border bg-background"
                                    } ${isCurrent ? "ring-4 ring-primary/15" : ""}`}
                                  />
                                  <span
                                    className={`text-xs font-medium ${
                                      isCurrent
                                        ? "text-foreground"
                                        : reached
                                          ? "text-primary"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {isCurrent ? "Actual" : reached ? "Hecho" : "Pendiente"}
                                  </span>
                                  {movedToday ? (
                                    <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                      {formatTime(movedToday.at)}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground/70">
                                      {reached ? "Previo" : "—"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="border-t bg-muted/15 px-4 py-3">
                          <div className="space-y-3">
                            <div>
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Tag events
                              </p>
                              {row.tagsToday.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No tag activity captured for this person on the selected day.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {row.tagsToday.map((tag) => (
                                    <span
                                      key={`${row.customerId}-${tag.key}-${tag.at}`}
                                      className={`rounded-full border px-3 py-1 text-xs font-medium ${getTagTone(tag.group)}`}
                                      title={tag.preview || tag.label}
                                    >
                                      {formatTime(tag.at)} · {tag.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Conversation context
                              </p>
                              {row.previews.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No message preview saved for these events.
                                </p>
                              ) : (
                                <div className="grid gap-2">
                                  {row.previews.map((preview, index) => (
                                    <div
                                      key={`${row.customerId}-preview-${index}`}
                                      className="rounded-xl border bg-background/80 px-3 py-2 text-sm text-foreground"
                                    >
                                      {preview}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
