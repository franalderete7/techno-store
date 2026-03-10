"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Conversation, VCustomerContext } from "@/types/database";

const STAGE_LABELS: Record<string, string> = {
  new: "Nuevo",
  browsing: "Explorando",
  interested: "Interesado",
  closing: "Cierre",
  human_handoff: "Asesor",
};

const LINE_COLORS = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#3b82f6",
  "#84cc16",
  "#f43f5e",
  "#06b6d4",
];

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

const cleanStringArray = (items: string[] | null | undefined) =>
  uniqueStrings((items || []).map((item) => String(item || "").trim()).filter(Boolean));

const compactPreview = (value: string | null | undefined, limit = 180) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const formatAxisTime = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const colorForCustomer = (customerId: number) =>
  LINE_COLORS[Math.abs(customerId) % LINE_COLORS.length];

type JourneyTag = {
  key: string;
  label: string;
  group: string;
};

type JourneyEvent = {
  id: number;
  at: string;
  role: string;
  stageLabel: string;
  leadScore: number;
  preview: string;
  summary: string;
  insights: string[];
  tags: JourneyTag[];
  payments: string[];
  products: string[];
  brands: string[];
  topics: string[];
};

type JourneyRow = {
  customerId: number;
  label: string;
  phone: string;
  city: string;
  preferredBrand: string;
  currentProduct: string;
  paymentLast: string;
  leadScore: number;
  firstEventAt: string;
  lastEventAt: string;
  dailySummary: string;
  insightHighlights: string[];
  points: JourneyEvent[];
  color: string;
};

type ChartPoint = {
  key: string;
  customerId: number;
  customerLabel: string;
  customerPhone: string;
  customerCity: string;
  preferredBrand: string;
  currentProduct: string;
  paymentLast: string;
  customerDaySummary: string;
  lineColor: string;
  event: JourneyEvent;
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

function InteractionPoint({ point }: { point: ChartPoint }) {
  const { event } = point;
  const signalCount =
    event.tags.length +
    event.payments.length +
    event.products.length +
    event.brands.length +
    event.topics.length;

  const isInteresting = Boolean(signalCount || event.summary || event.insights.length);

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
        className={`rounded-full border border-background transition hover:scale-110 ${
          isInteresting
            ? "h-[14px] w-[14px] bg-primary shadow-[0_0_24px_rgba(14,165,233,0.45)]"
            : "h-[10px] w-[10px] bg-slate-400/80"
        }`}
        aria-label={`${point.customerLabel} ${formatTime(event.at)}`}
      />
      <div className="pointer-events-none absolute left-1/2 top-full z-30 hidden w-[420px] -translate-x-1/2 pt-3 group-hover:block">
        <div className="rounded-2xl border bg-background/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{point.customerLabel}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {formatTime(event.at)} · {event.role === "user" ? "Cliente" : "Bot"} · score{" "}
                {event.leadScore}
              </p>
            </div>
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: `${point.lineColor}55`,
                color: point.lineColor,
                backgroundColor: `${point.lineColor}12`,
              }}
            >
              {event.stageLabel}
            </span>
          </div>

          <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              {point.customerPhone ? <span>{point.customerPhone}</span> : null}
              {point.customerCity ? <span>{point.customerCity}</span> : null}
              {point.preferredBrand ? <span>{normalizeSignal(point.preferredBrand)}</span> : null}
              {point.paymentLast ? <span>{normalizeSignal(point.paymentLast)}</span> : null}
              {point.currentProduct ? <span>{point.currentProduct}</span> : null}
            </div>
            {point.customerDaySummary ? (
              <p className="mt-2 text-foreground">{point.customerDaySummary}</p>
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

          {event.insights.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.insights.map((insight) => (
                <span
                  key={`${event.id}-insight-${insight}`}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                >
                  {insight}
                </span>
              ))}
            </div>
          ) : null}

          {event.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.tags.map((tag) => (
                <span
                  key={`${event.id}-tag-${tag.key}`}
                  className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getTagTone(tag.group)}`}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          ) : null}

          {event.products.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.products.map((product) => (
                <span
                  key={`${event.id}-product-${product}`}
                  className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300"
                >
                  {product}
                </span>
              ))}
            </div>
          ) : null}

          {event.payments.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.payments.map((payment) => (
                <span
                  key={`${event.id}-payment-${payment}`}
                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                >
                  {normalizeSignal(payment)}
                </span>
              ))}
            </div>
          ) : null}

          {event.topics.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.topics.map((topic) => (
                <span
                  key={`${event.id}-topic-${topic}`}
                  className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 text-[11px] font-medium text-fuchsia-700 dark:text-fuchsia-300"
                >
                  {normalizeSignal(topic)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CrmDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJourneyDate, setSelectedJourneyDate] = useState("");
  const [journeySearch, setJourneySearch] = useState("");
  const [customerRows, setCustomerRows] = useState<VCustomerContext[]>([]);
  const [conversationRows, setConversationRows] = useState<Conversation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [customerRes, conversationRes] = await Promise.all([
        supabase
          .from("v_customer_context")
          .select(
            "id,manychat_id,first_name,phone,whatsapp_phone,city,preferred_brand,payment_method_last,interested_product,funnel_stage,lead_score,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase
          .from("conversations")
          .select(
            "id,customer_id,manychat_id,role,message,message_type,intent_detected,products_mentioned,triggered_human,was_audio,audio_transcription,created_at,applied_tags,payment_methods_detected,brands_detected,topics_detected,funnel_stage_after,conversation_summary,conversation_insights,lead_score_after"
          )
          .order("created_at", { ascending: false })
          .limit(12000),
      ]);

      if (cancelled) return;

      const firstError = customerRes.error || conversationRes.error;

      if (firstError) {
        setError(firstError.message);
        setCustomerRows([]);
        setConversationRows([]);
      } else {
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

    const search = journeySearch.trim().toLowerCase();
    const grouped = new Map<number, JourneyRow>();

    for (const row of orderedConversations) {
      const customerId = Number(row.customer_id);
      if (!Number.isFinite(customerId) || !row.created_at) continue;
      if (String(row.created_at).slice(0, 10) !== selectedJourneyDate) continue;

      const customer = customerById.get(customerId);
      const label = String(
        customer?.first_name ||
          customer?.whatsapp_phone ||
          customer?.phone ||
          customer?.manychat_id ||
          `Cliente #${customerId}`
      ).trim();
      const phone = String(customer?.whatsapp_phone || customer?.phone || customer?.manychat_id || "").trim();

      const existing =
        grouped.get(customerId) ||
        ({
          customerId,
          label: label || `Cliente #${customerId}`,
          phone,
          city: String(customer?.city || "").trim(),
          preferredBrand: String(customer?.preferred_brand || "").trim(),
          currentProduct: String(customer?.interested_product || "").trim(),
          paymentLast: String(customer?.payment_method_last || "").trim(),
          leadScore: clamp(Number(customer?.lead_score || 0) || 0, 0, 100),
          firstEventAt: String(row.created_at),
          lastEventAt: String(row.created_at),
          dailySummary: "",
          insightHighlights: [],
          points: [],
          color: colorForCustomer(customerId),
        } satisfies JourneyRow);

      const currentTags = cleanStringArray(row.applied_tags).map((key) => ({
        key,
        label: normalizeSignal(key),
        group: inferTagGroup(key),
      }));
      const currentPayments = cleanStringArray(row.payment_methods_detected);
      const currentBrands = cleanStringArray(row.brands_detected);
      const currentTopics = cleanStringArray(row.topics_detected);
      const currentProducts = cleanStringArray(row.products_mentioned);

      const preview = compactPreview(row.was_audio ? row.audio_transcription || row.message : row.message, 220);
      const summary = compactPreview(row.conversation_summary || preview, 220);
      const insights = cleanStringArray(row.conversation_insights).slice(0, 6);
      const stageKey = String(row.funnel_stage_after || customer?.funnel_stage || "new").trim() || "new";
      const stageLabel = STAGE_LABELS[stageKey] || stageKey;
      const leadScore = clamp(
        Number(row.lead_score_after ?? customer?.lead_score ?? 0) || 0,
        0,
        100
      );

      existing.points.push({
        id: row.id,
        at: String(row.created_at),
        role: String(row.role || "user"),
        stageLabel,
        leadScore,
        preview,
        summary,
        insights,
        tags: currentTags,
        payments: currentPayments,
        products: currentProducts,
        brands: currentBrands,
        topics: currentTopics,
      });
      existing.lastEventAt = String(row.created_at);

      grouped.set(customerId, existing);
    }

    return Array.from(grouped.values())
      .map((row) => {
        const orderedPoints = [...row.points].sort((a, b) => a.at.localeCompare(b.at));
        const dailySummary = uniqueStrings(
          orderedPoints.map((point) => point.summary).filter(Boolean)
        )
          .slice(-2)
          .join(" · ");

        return {
          ...row,
          points: orderedPoints,
          leadScore: orderedPoints[orderedPoints.length - 1]?.leadScore ?? row.leadScore,
          dailySummary,
          insightHighlights: uniqueStrings(
            orderedPoints.flatMap((point) => point.insights)
          ).slice(0, 8),
        };
      })
      .filter((row) => {
        if (!search) return true;
        const haystack = [
          row.label,
          row.phone,
          row.city,
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
        return String(b.lastEventAt).localeCompare(String(a.lastEventAt));
      });
  }, [customerById, journeySearch, orderedConversations, selectedJourneyDate]);

  const journeyStats = useMemo(() => {
    const interactionCount = journeyRows.reduce((sum, row) => sum + row.points.length, 0);
    const tagCount = journeyRows.reduce(
      (sum, row) => sum + row.points.reduce((inner, point) => inner + point.tags.length, 0),
      0
    );
    const avgScore = journeyRows.length
      ? Math.round(journeyRows.reduce((sum, row) => sum + row.leadScore, 0) / journeyRows.length)
      : 0;

    return {
      people: journeyRows.length,
      interactions: interactionCount,
      tags: tagCount,
      avgScore,
    };
  }, [journeyRows]);

  const journeyChart = useMemo(() => {
    const chartWidth = 1440;
    const chartHeight = 760;
    const paddingLeft = 72;
    const paddingRight = 32;
    const paddingTop = 30;
    const paddingBottom = 52;
    const innerWidth = chartWidth - paddingLeft - paddingRight;
    const innerHeight = chartHeight - paddingTop - paddingBottom;
    const scoreTicks = [0, 25, 50, 75, 100];
    const timeTicks = Array.from({ length: 13 }, (_, index) => index * 2);
    const dayStart = new Date(`${selectedJourneyDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${selectedJourneyDate}T23:59:59.999`).getTime();
    const span = Math.max(dayEnd - dayStart, 1);

    const rows: JourneyChartRow[] = journeyRows.map((row) => {
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
          preferredBrand: row.preferredBrand,
          currentProduct: row.currentProduct,
          paymentLast: row.paymentLast,
          customerDaySummary: row.dailySummary,
          lineColor: row.color,
          event,
          x,
          y,
        };
      });

      return {
        customerId: row.customerId,
        label: row.label,
        color: row.color,
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
      scoreTicks,
      timeTicks,
      rows,
    };
  }, [journeyRows, selectedJourneyDate]);

  const latestJourneyDates = journeyDates.slice(0, 12);

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(251,146,60,0.16),transparent_22%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              CRM journeys
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Lead score timeline
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                One chart per day. Horizontal axis = exact interaction time. Vertical axis = lead
                score after that turn. Each point is a real conversation event, and hover exposes
                summary, insights, products, payments, topics, and the tags saved in Supabase for
                that moment.
              </p>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search person, phone, product or tag
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={journeySearch}
                onChange={(event) => setJourneySearch(event.target.value)}
                placeholder="Ej. Francisco, iPhone, pay_naranja"
                className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
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

        {!loading && !error && selectedJourneyDate ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {journeyStats.people} personas
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {journeyStats.interactions} interacciones
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {journeyStats.tags} tags visibles
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              score medio {journeyStats.avgScore}
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="flex h-[540px] items-center justify-center rounded-2xl border bg-background/70 text-sm text-muted-foreground">
            Loading customer journeys...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {error}. Run the CRM timeline migrations and refresh the app types.
          </div>
        ) : journeyRows.length === 0 ? (
          <div className="flex h-[540px] items-center justify-center rounded-2xl border border-dashed bg-background/70 text-sm text-muted-foreground">
            No people with CRM movement on {selectedJourneyDate ? formatLongDate(selectedJourneyDate) : "that day"}.
          </div>
        ) : (
          <div className="rounded-2xl border bg-background/70 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                {selectedJourneyDate ? formatLongDate(selectedJourneyDate) : "Timeline"}
              </div>
              <p className="text-xs text-muted-foreground">
                Hover any point to inspect the event snapshot saved in Supabase.
              </p>
            </div>

            <div className="overflow-x-auto">
              <div
                className="relative min-w-[1280px] rounded-2xl border bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_24%)]"
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
                    const x = journeyChart.paddingLeft + (hour / 24) * journeyChart.innerWidth;
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
                    Hora real de interaccion
                  </text>

                  {journeyChart.rows.map((row) =>
                    row.points.length >= 2 ? (
                      <polyline
                        key={`line-${row.customerId}`}
                        points={row.path}
                        fill="none"
                        stroke={row.color}
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.58}
                      />
                    ) : null
                  )}

                  {journeyChart.rows.length <= 10
                    ? journeyChart.rows.map((row) =>
                        row.latestPoint ? (
                          <text
                            key={`label-${row.customerId}`}
                            x={Math.min(row.latestPoint.x + 10, journeyChart.chartWidth - 56)}
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
                  row.points.map((point) => <InteractionPoint key={point.key} point={point} />)
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
