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
  Conversation,
  VConversationSignalDaily,
  VCustomerContext,
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

const inferTagGroup = (tagKey: string | null | undefined) => {
  const value = String(tagKey || "");
  if (value.startsWith("pay_")) return "payment";
  if (value.startsWith("topic_")) return "topic";
  if (value.startsWith("brand_")) return "brand";
  if (value.startsWith("stage_")) return "stage";
  if (value.startsWith("intent_")) return "intent";
  if (value.startsWith("prov_") || value.startsWith("loc_") || value.startsWith("phone_")) {
    return "location";
  }
  return "tag";
};

const cleanStringArray = (items: string[] | null | undefined) =>
  uniqueStrings((items || []).map((item) => String(item || "").trim()).filter(Boolean));

const compactPreview = (value: string | null | undefined) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

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

type JourneyEvent = {
  id: number;
  at: string;
  role: string;
  stage: string;
  stageLabel: string;
  stageIndex: number;
  leadScore: number;
  preview: string;
  summary: string;
  insights: string[];
  tags: JourneyTag[];
  payments: string[];
  products: string[];
  brands: string[];
  topics: string[];
  stageChanged: boolean;
  hasSignal: boolean;
};

type JourneyRow = {
  customerId: number;
  label: string;
  phone: string;
  city: string;
  budget: string;
  budgetLabel: string;
  preferredBrand: string;
  currentProduct: string;
  paymentLast: string;
  leadScore: number;
  firstEventAt: string;
  lastEventAt: string;
  conversationCount: number;
  furthestStage: string;
  furthestIndex: number;
  stageMoveCount: number;
  points: JourneyEvent[];
  productsToday: string[];
  paymentsToday: string[];
  topicsToday: string[];
  dailySummary: string;
  insightHighlights: string[];
  latestSummary: string;
};

type ChartPoint = {
  key: string;
  customerId: number;
  customerLabel: string;
  customerPhone: string;
  customerCity: string;
  customerBudgetLabel: string;
  preferredBrand: string;
  currentProduct: string;
  paymentLast: string;
  dailySummary: string;
  event: JourneyEvent;
  lineColor: string;
  x: number;
  y: number;
};

type JourneyChartRow = {
  customerId: number;
  label: string;
  color: string;
  path: string;
  points: ChartPoint[];
  latestPoint: ChartPoint | null;
};

const BUDGET_ORDER = ["premium", "mid", "budget", "unknown"] as const;

const BUDGET_LABELS: Record<string, string> = {
  premium: "Premium",
  mid: "Medio",
  budget: "Entrada",
  unknown: "Sin dato",
  none: "Sin dato",
};

const BUDGET_TONES: Record<string, string> = {
  premium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  mid: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  budget: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  unknown: "border-border bg-muted/60 text-muted-foreground",
};

const getBudgetKey = (value: string | null | undefined) => {
  const normalized = normalizeSignal(value);
  if (!normalized) return "unknown";
  if (["premium", "alta", "high"].includes(normalized)) return "premium";
  if (["mid", "medio", "media"].includes(normalized)) return "mid";
  if (["budget", "entrada", "economico", "economico / entrada"].includes(normalized)) {
    return "budget";
  }
  return "unknown";
};

const getBudgetLabel = (value: string | null | undefined) =>
  BUDGET_LABELS[getBudgetKey(value)] || "Sin dato";

const getBudgetTone = (value: string | null | undefined) =>
  BUDGET_TONES[getBudgetKey(value)] || BUDGET_TONES.unknown;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const titleCase = (value: string | null | undefined) =>
  String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatAxisTime = (hour: number) =>
  `${String(hour).padStart(2, "0")}:00`;

const buildFallbackInsights = ({
  stage,
  products,
  payments,
  topics,
  brands,
}: {
  stage: string;
  products: string[];
  payments: string[];
  topics: string[];
  brands: string[];
}) =>
  uniqueStrings([
    stage ? `Etapa ${STAGE_LABELS[stage] || titleCase(stage)}` : "",
    ...products.slice(0, 2).map((product) => `Producto ${product}`),
    ...payments.slice(0, 2).map((payment) => `Pago ${normalizeSignal(payment)}`),
    ...topics.slice(0, 2).map((topic) => `Tema ${normalizeSignal(topic)}`),
    ...brands.slice(0, 2).map((brand) => `Marca ${normalizeSignal(brand)}`),
  ]).slice(0, 6);

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

function JourneyTimelinePoint({ point }: { point: ChartPoint }) {
  const { event } = point;
  const signalCount =
    event.tags.length +
    event.payments.length +
    event.products.length +
    event.brands.length +
    event.topics.length;

  return (
    <div
      className="group absolute z-20"
      style={{
        left: `${point.x}px`,
        top: `${point.y}px`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <button
        type="button"
        className={`rounded-full border border-background shadow-[0_0_18px_rgba(14,165,233,0.28)] transition hover:scale-110 ${
          event.stageChanged
            ? "h-[18px] w-[18px] animate-pulse bg-primary"
            : event.hasSignal
              ? "h-4 w-4 bg-sky-400"
              : "h-3 w-3 bg-slate-400/80"
        }`}
        aria-label={`${event.stageLabel} ${formatTime(event.at)}`}
      />
      <div className="pointer-events-none absolute left-1/2 top-full z-30 hidden w-[380px] -translate-x-1/2 pt-3 group-hover:block">
        <div className="rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {point.customerLabel} · {event.stageLabel}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {formatTime(event.at)} · {event.role === "user" ? "Cliente" : "Bot"} · score{" "}
                {event.leadScore} · {signalCount} señales
              </p>
            </div>
            {event.stageChanged ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                Cambio de etapa
              </span>
            ) : null}
          </div>

          <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              {point.customerPhone ? <span>{point.customerPhone}</span> : null}
              {point.customerCity ? <span>{point.customerCity}</span> : null}
              {point.customerBudgetLabel !== "Sin dato" ? <span>{point.customerBudgetLabel}</span> : null}
              {point.preferredBrand ? <span>{normalizeSignal(point.preferredBrand)}</span> : null}
              {point.paymentLast ? <span>{normalizeSignal(point.paymentLast)}</span> : null}
            </div>
            {point.dailySummary ? (
              <p className="mt-2 text-foreground">{point.dailySummary}</p>
            ) : null}
          </div>

          {event.summary ? (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
              {event.summary}
            </div>
          ) : null}

          {event.preview ? (
            <div className="mt-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-foreground">
              {event.preview}
            </div>
          ) : null}

          <div className="mt-3 space-y-2 text-xs">
            {event.insights.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {event.insights.map((insight) => (
                  <span
                    key={`${event.id}-insight-${insight}`}
                    className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 font-medium text-primary"
                  >
                    {insight}
                  </span>
                ))}
              </div>
            ) : null}
            {event.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {event.tags.map((tag) => (
                  <span
                    key={`${event.id}-${tag.key}`}
                    className={`rounded-full border px-2 py-1 font-medium ${getTagTone(tag.group)}`}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            ) : null}
            {event.products.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {event.products.map((product) => (
                  <span
                    key={`${event.id}-product-${product}`}
                    className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 font-medium text-orange-700 dark:text-orange-300"
                  >
                    {product}
                  </span>
                ))}
              </div>
            ) : null}
            {event.payments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {event.payments.map((payment) => (
                  <span
                    key={`${event.id}-payment-${payment}`}
                    className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-medium text-sky-700 dark:text-sky-300"
                  >
                    {normalizeSignal(payment)}
                  </span>
                ))}
              </div>
            ) : null}
            {event.topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {event.topics.map((topic) => (
                  <span
                    key={`${event.id}-topic-${topic}`}
                    className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 font-medium text-fuchsia-700 dark:text-fuchsia-300"
                  >
                    {normalizeSignal(topic)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
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
  const [conversationRows, setConversationRows] = useState<Conversation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [funnelRes, signalRes, customerRes, conversationRes] = await Promise.all([
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
            "id,manychat_id,first_name,phone,whatsapp_phone,city,is_salta_capital,preferred_brand,preferred_budget,payment_method_last,payment_methods_mentioned,interested_product,products_mentioned,brands_mentioned,topics_mentioned,funnel_stage,last_funnel_change_at,last_intent,lead_score,tags,total_interactions,first_seen_at,lead_source,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase
          .from("conversations")
          .select(
            "id,customer_id,manychat_id,role,message,message_type,intent_detected,products_mentioned,triggered_human,was_audio,audio_transcription,created_at,channel,external_message_id,whatsapp_phone_number_id,applied_tags,payment_methods_detected,brands_detected,topics_detected,funnel_stage_after,conversation_summary,conversation_insights,lead_score_after"
          )
          .order("created_at", { ascending: false })
          .limit(12000),
      ]);

      if (cancelled) return;

      const firstError =
        funnelRes.error || signalRes.error || customerRes.error || conversationRes.error;

      if (firstError) {
        setError(firstError.message);
        setFunnelRows([]);
        setSignalRows([]);
        setCustomerRows([]);
        setConversationRows([]);
      } else {
        setFunnelRows((funnelRes.data || []) as VFunnelDaily[]);
        setSignalRows((signalRes.data || []) as VConversationSignalDaily[]);
        setCustomerRows((customerRes.data || []) as VCustomerContext[]);
        setConversationRows((conversationRes.data || []) as Conversation[]);
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

  const customerById = useMemo(
    () => new Map(customerRows.map((row) => [row.id, row])),
    [customerRows]
  );

  const orderedConversations = useMemo(
    () =>
      [...conversationRows]
        .filter((row) => row.customer_id !== null && row.created_at)
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    [conversationRows]
  );

  const journeyDates = useMemo(
    () =>
      uniqueStrings(
        orderedConversations
          .map((row) => String(row.created_at || "").slice(0, 10))
          .filter(Boolean)
      ).sort((a, b) => b.localeCompare(a)),
    [orderedConversations]
  );

  useEffect(() => {
    if (!journeyDates.length) return;
    if (!selectedJourneyDate || !journeyDates.includes(selectedJourneyDate)) {
      setSelectedJourneyDate(journeyDates[0]);
    }
  }, [journeyDates, selectedJourneyDate]);

  const journeyRows = useMemo(() => {
    if (!selectedJourneyDate) return [] as JourneyRow[];

    const endOfDay = new Date(`${selectedJourneyDate}T23:59:59.999`);
    const search = journeySearch.trim().toLowerCase();
    const seenByCustomer = new Map<
      number,
      {
        stage: string;
        tags: Set<string>;
        payments: Set<string>;
        brands: Set<string>;
        topics: Set<string>;
        products: Set<string>;
      }
    >();
    const grouped = new Map<number, JourneyRow>();

    for (const row of orderedConversations) {
      const customerId = Number(row.customer_id);
      if (!Number.isFinite(customerId) || !row.created_at) continue;

      const eventDate = new Date(row.created_at);
      if (Number.isNaN(eventDate.getTime()) || eventDate > endOfDay) continue;

      const customer = customerById.get(customerId);
      const state =
        seenByCustomer.get(customerId) ||
        {
          stage: "",
          tags: new Set<string>(),
          payments: new Set<string>(),
          brands: new Set<string>(),
          topics: new Set<string>(),
          products: new Set<string>(),
        };

      const stageKey = String(row.funnel_stage_after || state.stage || "new");
      const stageChanged = Boolean(
        row.funnel_stage_after &&
          String(row.funnel_stage_after).trim() &&
          String(row.funnel_stage_after) !== state.stage
      );
      if (row.funnel_stage_after) {
        state.stage = String(row.funnel_stage_after);
      }

      const currentTags = cleanStringArray(row.applied_tags);
      const currentPayments = cleanStringArray(row.payment_methods_detected);
      const currentBrands = cleanStringArray(row.brands_detected);
      const currentTopics = cleanStringArray(row.topics_detected);
      const currentProducts = cleanStringArray(row.products_mentioned);

      const freshTags = currentTags.filter((value) => !state.tags.has(value));
      const freshPayments = currentPayments.filter((value) => !state.payments.has(value));
      const freshBrands = currentBrands.filter((value) => !state.brands.has(value));
      const freshTopics = currentTopics.filter((value) => !state.topics.has(value));
      const freshProducts = currentProducts.filter((value) => !state.products.has(value));

      currentTags.forEach((value) => state.tags.add(value));
      currentPayments.forEach((value) => state.payments.add(value));
      currentBrands.forEach((value) => state.brands.add(value));
      currentTopics.forEach((value) => state.topics.add(value));
      currentProducts.forEach((value) => state.products.add(value));
      seenByCustomer.set(customerId, state);

      const activityDate = String(row.created_at).slice(0, 10);
      if (activityDate !== selectedJourneyDate) continue;

      const baseLabel = String(
        customer?.first_name ||
          customer?.whatsapp_phone ||
          customer?.phone ||
          customer?.manychat_id ||
          `Cliente #${customerId}`
      ).trim();
      const phone = String(customer?.whatsapp_phone || customer?.phone || customer?.manychat_id || "").trim();
      const entry =
        grouped.get(customerId) ||
        ({
          customerId,
          label: baseLabel || `Cliente #${customerId}`,
          phone,
          city: String(customer?.city || "").trim(),
          budget: String(customer?.preferred_budget || "unknown").trim(),
          budgetLabel: getBudgetLabel(customer?.preferred_budget),
          preferredBrand: String(customer?.preferred_brand || "").trim(),
          currentProduct: String(customer?.interested_product || "").trim(),
          paymentLast: String(customer?.payment_method_last || "").trim(),
          leadScore: Number(customer?.lead_score || 0),
          firstEventAt: String(row.created_at),
          lastEventAt: String(row.created_at),
          conversationCount: 0,
          furthestStage: stageKey,
          furthestIndex: getStageIndex(stageKey),
          stageMoveCount: 0,
          points: [],
          productsToday: [],
          paymentsToday: [],
          topicsToday: [],
          dailySummary: "",
          insightHighlights: [],
          latestSummary: "",
        } satisfies JourneyRow);

      entry.conversationCount += 1;
      entry.lastEventAt = String(row.created_at);
      if (!entry.firstEventAt) entry.firstEventAt = String(row.created_at);

      const preview = compactPreview(row.was_audio ? row.audio_transcription || row.message : row.message);
      const summary = compactPreview(row.conversation_summary || preview);
      const insights = cleanStringArray(row.conversation_insights);
      const tags = freshTags.map((key) => ({
        key,
        label: normalizeSignal(key),
        group: inferTagGroup(key),
        at: String(row.created_at),
        preview,
      }));

      const point: JourneyEvent = {
        id: row.id,
        at: String(row.created_at),
        role: String(row.role || "user"),
        stage: stageKey,
        stageLabel: STAGE_LABELS[stageKey] || stageKey,
        stageIndex: getStageIndex(stageKey),
        leadScore: clamp(
          Number(
            row.lead_score_after ??
              customer?.lead_score ??
              0
          ) || 0,
          0,
          100
        ),
        preview,
        summary,
        insights:
          insights.length > 0
            ? insights
            : buildFallbackInsights({
                stage: stageKey,
                products: currentProducts,
                payments: currentPayments,
                topics: currentTopics,
                brands: currentBrands,
              }),
        tags,
        payments: freshPayments,
        products: freshProducts,
        brands: freshBrands,
        topics: freshTopics,
        stageChanged,
        hasSignal:
          stageChanged ||
          tags.length > 0 ||
          freshPayments.length > 0 ||
          freshBrands.length > 0 ||
          freshTopics.length > 0 ||
          freshProducts.length > 0,
      };

      entry.points.push(point);
      entry.productsToday = uniqueStrings([...entry.productsToday, ...currentProducts]);
      entry.paymentsToday = uniqueStrings([...entry.paymentsToday, ...currentPayments]);
      entry.topicsToday = uniqueStrings([...entry.topicsToday, ...currentTopics]);
      if (point.stageChanged) entry.stageMoveCount += 1;
      if (point.stageIndex >= entry.furthestIndex) {
        entry.furthestIndex = point.stageIndex;
        entry.furthestStage = point.stage;
      }

      grouped.set(customerId, entry);
    }

    return Array.from(grouped.values())
      .map((row) => {
        const orderedPoints = [...row.points].sort((a, b) => a.at.localeCompare(b.at));
        const summaryCandidates = uniqueStrings(
          orderedPoints.map((point) => point.summary).filter(Boolean)
        );
        const insightHighlights = uniqueStrings(
          orderedPoints.flatMap((point) => point.insights)
        ).slice(0, 10);

        return {
          ...row,
          points: orderedPoints,
          leadScore: orderedPoints[orderedPoints.length - 1]?.leadScore ?? row.leadScore,
          latestSummary:
            orderedPoints[orderedPoints.length - 1]?.summary ||
            summaryCandidates[summaryCandidates.length - 1] ||
            "",
          dailySummary: summaryCandidates.slice(-2).join(" · "),
          insightHighlights,
        };
      })
      .filter((row) => {
        if (!search) return true;
        const haystack = [
          row.label,
          row.phone,
          row.city,
          row.budget,
          row.preferredBrand,
          row.currentProduct,
          row.paymentLast,
          row.dailySummary,
          ...row.insightHighlights,
          ...row.points.flatMap((point) => [
            point.preview,
            point.summary,
            ...point.insights,
            ...point.tags.map((tag) => `${tag.key} ${tag.label}`),
            ...point.payments,
            ...point.products,
            ...point.brands,
            ...point.topics,
          ]),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        const byScore = b.leadScore - a.leadScore;
        if (byScore !== 0) return byScore;
        const byStage = b.furthestIndex - a.furthestIndex;
        if (byStage !== 0) return byStage;
        return String(b.lastEventAt).localeCompare(String(a.lastEventAt));
      });
  }, [customerById, journeySearch, orderedConversations, selectedJourneyDate]);

  const journeyTotals = useMemo(() => {
    const stageMoves = journeyRows.reduce((sum, row) => sum + row.stageMoveCount, 0);
    const signalBursts = journeyRows.reduce(
      (sum, row) => sum + row.points.reduce((inner, point) => inner + point.tags.length, 0),
      0
    );
    const reachedClosing = journeyRows.filter(
      (row) => row.furthestIndex >= STAGE_INDEX.closing
    ).length;
    const handoff = journeyRows.filter(
      (row) => row.furthestStage === "human_handoff"
    ).length;

    return {
      people: journeyRows.length,
      conversations: journeyRows.reduce((sum, row) => sum + row.conversationCount, 0),
      stageMoves,
      tagBursts: signalBursts,
      reachedClosing,
      handoff,
    };
  }, [journeyRows]);

  const journeyChart = useMemo(() => {
    const chartWidth = 1320;
    const chartHeight = 720;
    const paddingLeft = 64;
    const paddingRight = 32;
    const paddingTop = 24;
    const paddingBottom = 48;
    const innerWidth = chartWidth - paddingLeft - paddingRight;
    const innerHeight = chartHeight - paddingTop - paddingBottom;
    const scoreTicks = [0, 25, 50, 75, 100];
    const timeTicks = Array.from({ length: 9 }, (_, index) => index * 3);
    const dayStart = new Date(`${selectedJourneyDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${selectedJourneyDate}T23:59:59.999`).getTime();
    const span = Math.max(dayEnd - dayStart, 1);

    const rows: JourneyChartRow[] = journeyRows.map((row) => {
      const lineColor = STAGE_COLORS[row.furthestStage as StageKey] || "#94a3b8";
      const points: ChartPoint[] = row.points.map((event) => {
        const eventTime = new Date(event.at).getTime();
        const ratio = clamp((eventTime - dayStart) / span, 0, 1);
        const x = paddingLeft + ratio * innerWidth;
        const y =
          paddingTop + innerHeight - (clamp(event.leadScore, 0, 100) / 100) * innerHeight;

        return {
          key: `${row.customerId}-${event.id}`,
          customerId: row.customerId,
          customerLabel: row.label,
          customerPhone: row.phone,
          customerCity: row.city,
          customerBudgetLabel: row.budgetLabel,
          preferredBrand: row.preferredBrand,
          currentProduct: row.currentProduct,
          paymentLast: row.paymentLast,
          dailySummary: row.dailySummary || row.latestSummary,
          event,
          lineColor,
          x,
          y,
        };
      });

      return {
        customerId: row.customerId,
        label: row.label,
        color: lineColor,
        path: points.map((point) => `${point.x},${point.y}`).join(" "),
        points,
        latestPoint: points[points.length - 1] || null,
      };
    });

    return {
      chartWidth,
      chartHeight,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      innerWidth,
      innerHeight,
      rows,
      scoreTicks,
      timeTicks,
    };
  }, [journeyRows, selectedJourneyDate]);

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
                  : "Customer journey score map"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {activeTab === "overview"
                  ? "This view uses Supabase as source of truth for stage progression, tags, products mentioned, payment mentions, and conversation topics."
                  : "One day, one chart. Each conversation turn becomes a timed point positioned by lead score, with hover cards that expose summary, insights, products, payments, and newly applied tags."}
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
              hint="Only new signal captured on that turn, not repeated history"
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
                  Journey score timeline
                </div>
                <p className="text-sm text-muted-foreground">
                  One chart per day. Horizontal axis = time of each interaction. Vertical axis =
                  lead score after that turn. Hover any point to inspect message context, compact
                  summary, products, payments, topics, and the tags that were newly assigned there.
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
            <div className="space-y-4">
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-medium text-primary">
                    Eje vertical: lead score 0-100
                  </span>
                  <span>
                    Cada punto es una interacción real. Los puntos luminosos marcan cambios de
                    etapa o nuevas señales; los puntos tenues marcan continuidad sin ruido nuevo.
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border bg-background/70 p-4 shadow-sm">
                <div className="overflow-x-auto">
                  <div
                    className="relative min-w-[1180px] rounded-2xl border bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.10),transparent_22%)]"
                    style={{ height: `${journeyChart.chartHeight}px` }}
                  >
                    <svg
                      viewBox={`0 0 ${journeyChart.chartWidth} ${journeyChart.chartHeight}`}
                      className="absolute inset-0 h-full w-full"
                      role="img"
                      aria-label="Journey score timeline"
                    >
                      {journeyChart.scoreTicks.map((tick) => {
                        const y =
                          journeyChart.paddingTop +
                          journeyChart.innerHeight -
                          (tick / 100) * journeyChart.innerHeight;
                        return (
                          <g key={`score-${tick}`}>
                            <line
                              x1={journeyChart.paddingLeft}
                              y1={y}
                              x2={journeyChart.chartWidth - journeyChart.paddingRight}
                              y2={y}
                              stroke="currentColor"
                              strokeDasharray="4 6"
                              className="text-border/70"
                            />
                            <text
                              x={journeyChart.paddingLeft - 12}
                              y={y + 4}
                              textAnchor="end"
                              className="fill-muted-foreground text-[11px]"
                            >
                              {tick}
                            </text>
                          </g>
                        );
                      })}

                      {journeyChart.timeTicks.map((hour) => {
                        const x =
                          journeyChart.paddingLeft +
                          (hour / 24) * journeyChart.innerWidth;
                        return (
                          <g key={`hour-${hour}`}>
                            <line
                              x1={x}
                              y1={journeyChart.paddingTop}
                              x2={x}
                              y2={journeyChart.chartHeight - journeyChart.paddingBottom}
                              stroke="currentColor"
                              strokeDasharray="3 8"
                              className="text-border/60"
                            />
                            <text
                              x={x}
                              y={journeyChart.chartHeight - 18}
                              textAnchor="middle"
                              className="fill-muted-foreground text-[11px]"
                            >
                              {formatAxisTime(hour)}
                            </text>
                          </g>
                        );
                      })}

                      <text
                        x={journeyChart.paddingLeft}
                        y={16}
                        className="fill-muted-foreground text-[11px]"
                      >
                        Lead score
                      </text>
                      <text
                        x={journeyChart.chartWidth - journeyChart.paddingRight}
                        y={journeyChart.chartHeight - 18}
                        textAnchor="end"
                        className="fill-muted-foreground text-[11px]"
                      >
                        Hora de interaccion
                      </text>

                      {journeyChart.rows.map((row) =>
                        row.points.length >= 2 ? (
                          <polyline
                            key={`line-${row.customerId}`}
                            points={row.path}
                            fill="none"
                            stroke={row.color}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.42}
                          />
                        ) : null
                      )}

                      {journeyChart.rows.length <= 12
                        ? journeyChart.rows.map((row) =>
                            row.latestPoint ? (
                              <text
                                key={`label-${row.customerId}`}
                                x={Math.min(row.latestPoint.x + 10, journeyChart.chartWidth - 32)}
                                y={Math.max(row.latestPoint.y - 8, 18)}
                                className="fill-foreground text-[11px] font-medium"
                              >
                                {row.label}
                              </text>
                            ) : null
                          )
                        : null}
                    </svg>

                    {journeyChart.rows.flatMap((row) =>
                      row.points.map((point) => (
                        <JourneyTimelinePoint key={point.key} point={point} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {journeyRows.slice(0, 9).map((row) => (
                  <div key={`summary-${row.customerId}`} className="rounded-2xl border bg-background/70 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.phone || `Cliente #${row.customerId}`} · score {row.leadScore}
                        </p>
                      </div>
                      <span
                        className="h-3 w-3 rounded-full shadow-[0_0_16px_rgba(14,165,233,0.35)]"
                        style={{
                          backgroundColor:
                            STAGE_COLORS[row.furthestStage as StageKey] || "#94a3b8",
                        }}
                      />
                    </div>

                    {row.dailySummary ? (
                      <p className="mt-3 text-sm text-foreground">{row.dailySummary}</p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sin resumen compacto para este dia todavia.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full border bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        {row.conversationCount} interacciones
                      </span>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {STAGE_LABELS[row.furthestStage] || row.furthestStage}
                      </span>
                      {row.preferredBrand ? (
                        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300">
                          {normalizeSignal(row.preferredBrand)}
                        </span>
                      ) : null}
                      {row.paymentLast ? (
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          {normalizeSignal(row.paymentLast)}
                        </span>
                      ) : null}
                    </div>

                    {row.insightHighlights.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {row.insightHighlights.slice(0, 4).map((insight) => (
                          <span
                            key={`${row.customerId}-insight-${insight}`}
                            className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                          >
                            {insight}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
