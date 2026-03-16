"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Search,
  Sparkles,
  Tag,
  UserRound,
} from "lucide-react";
import {
  humanizeCrmTagKey,
  inferCrmTagGroup,
  normalizeCrmColorHex,
} from "@/lib/crm-tags";
import { supabase } from "@/lib/supabase";
import type { Conversation, CrmTagDefinition, VCustomerContext } from "@/types/database";

const STAGE_LABELS: Record<string, string> = {
  new: "Nuevo",
  browsing: "Explorando",
  interested: "Interesado",
  closing: "Cierre",
  human_handoff: "Asesor",
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

const cleanStringArray = (items: string[] | null | undefined) =>
  uniqueStrings((items || []).map((item) => String(item || "").trim()).filter(Boolean));

const compactPreview = (value: string | null | undefined, limit = 240) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const DEFAULT_VISIBLE_EVENTS = 4;

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

const getCustomTagStyle = (colorHex: string | null | undefined): CSSProperties | undefined => {
  const normalized = normalizeCrmColorHex(colorHex);
  if (!normalized) return undefined;

  return {
    borderColor: `${normalized}55`,
    backgroundColor: `${normalized}18`,
    color: normalized,
  };
};

type EventChip = {
  key: string;
  label: string;
  group: string;
  colorHex: string | null;
};

type ConversationEvent = {
  id: number;
  at: string;
  role: string;
  timeLabel: string;
  preview: string;
  summary: string;
  insights: string[];
  stageLabel: string;
  leadScore: number;
  tags: EventChip[];
  payments: string[];
  products: string[];
  brands: string[];
  topics: string[];
};

type ConversationCard = {
  customerId: number;
  label: string;
  phone: string;
  city: string;
  preferredBrand: string;
  currentProduct: string;
  paymentLast: string;
  finalStageLabel: string;
  leadScore: number;
  firstEventAt: string;
  lastEventAt: string;
  dailySummary: string;
  insightHighlights: string[];
  productsToday: string[];
  paymentsToday: string[];
  topicsToday: string[];
  brandsToday: string[];
  events: ConversationEvent[];
};

const formatSignalList = (items: string[], limit = 3) =>
  uniqueStrings(items.map((item) => normalizeSignal(item)).filter(Boolean))
    .slice(0, limit)
    .join(", ");

const quotePreview = (value: string | null | undefined, limit = 120) => {
  const compact = compactPreview(value, limit);
  if (!compact) return "";
  return compact.length >= limit ? `${compact.slice(0, limit - 1).trim()}...` : compact;
};

const getResponseStats = (events: ConversationEvent[]) => {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  let userTurns = 0;
  let answeredTurns = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event.role !== "user") continue;
    userTurns += 1;

    let replied = false;
    for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
      const nextEvent = ordered[cursor];
      if (nextEvent.role === "user") break;
      if (nextEvent.role === "bot") {
        replied = true;
        break;
      }
    }

    if (replied) answeredTurns += 1;
  }

  return {
    userTurns,
    answeredTurns,
    pendingTurns: Math.max(userTurns - answeredTurns, 0),
    lastRole: ordered[ordered.length - 1]?.role || "",
  };
};

const describeResponseQuality = (events: ConversationEvent[]) => {
  const { userTurns, answeredTurns, pendingTurns, lastRole } = getResponseStats(events);
  if (userTurns === 0) return "Sin turnos claros del cliente";

  const coverage = answeredTurns / userTurns;
  if (pendingTurns === 0 && lastRole === "bot" && coverage >= 0.8) {
    return `El bot respondió bien (${answeredTurns}/${userTurns} turnos)`;
  }
  if (coverage >= 0.6) {
    return `La respuesta fue bastante completa (${answeredTurns}/${userTurns})`;
  }
  if (lastRole === "user") {
    return `Quedaron mensajes sin responder (${pendingTurns})`;
  }
  return `La respuesta fue parcial (${answeredTurns}/${userTurns})`;
};

const buildDailySummary = (card: ConversationCard) => {
  const orderedEvents = [...card.events].sort((a, b) => a.at.localeCompare(b.at));
  const userEvents = orderedEvents.filter((event) => event.role === "user");
  const botEvents = orderedEvents.filter((event) => event.role === "bot");
  const firstUserMessage = quotePreview(userEvents[0]?.preview || userEvents[0]?.summary, 110);
  const lastBotMessage = quotePreview(
    botEvents[botEvents.length - 1]?.summary || botEvents[botEvents.length - 1]?.preview,
    120
  );
  const products = formatSignalList(card.productsToday, 3);
  const payments = formatSignalList(card.paymentsToday, 3);
  const topics = formatSignalList(card.topicsToday, 4);
  const brands = formatSignalList(card.brandsToday, 3);

  const parts = [];
  if (firstUserMessage) {
    parts.push(`Arrancó con "${firstUserMessage}"`);
  } else if (products) {
    parts.push(`Consultó por ${products}`);
  } else if (brands) {
    parts.push(`Consultó por ${brands}`);
  } else {
    parts.push("Tuvo una charla corta sin pedido claro");
  }

  const signalParts = [];
  if (products) signalParts.push(`productos ${products}`);
  if (payments) signalParts.push(`pago ${payments}`);
  if (topics) signalParts.push(`temas ${topics}`);
  if (!products && brands) signalParts.push(`marcas ${brands}`);
  if (signalParts.length > 0) {
    parts.push(`En el día aparecieron ${signalParts.join(" · ")}`);
  }

  parts.push(describeResponseQuality(orderedEvents));
  parts.push(`Terminó en ${card.finalStageLabel.toLowerCase()} con score ${card.leadScore}`);

  if (lastBotMessage) {
    parts.push(`Última respuesta: "${lastBotMessage}"`);
  }

  return parts.join(". ").slice(0, 420);
};

function EventBubble({
  event,
  expanded,
  onToggle,
}: {
  event: ConversationEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isUser = event.role === "user";
  const signalCount =
    event.tags.length +
    event.payments.length +
    event.products.length +
    event.brands.length +
    event.topics.length;
  const hasExtraDetail =
    (event.summary && event.summary !== event.preview) ||
    event.insights.length > 0 ||
    event.tags.length > 0 ||
    event.products.length > 0 ||
    event.payments.length > 0 ||
    event.topics.length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[min(100%,740px)] rounded-2xl border px-4 py-3 shadow-sm ${
          isUser
            ? "border-primary/20 bg-primary/[0.08]"
            : "border-border bg-background/80"
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            {isUser ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {isUser ? "Cliente" : "Bot"}
          </span>
          <span>{event.timeLabel}</span>
          <span>{event.stageLabel}</span>
          <span>score {event.leadScore}</span>
          {signalCount > 0 ? <span>{signalCount} señales</span> : null}
        </div>

        {event.preview ? <p className="text-sm leading-6 text-foreground">{event.preview}</p> : null}

        {hasExtraDetail ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-3 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Ocultar detalles
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Ver detalles
              </>
            )}
          </button>
        ) : null}

        {expanded ? (
          <>
            {event.summary && event.summary !== event.preview ? (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                {event.summary}
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
                    key={`${event.id}-${tag.key}`}
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
                      tag.colorHex ? "" : getTagTone(tag.group)
                    }`}
                    style={getCustomTagStyle(tag.colorHex)}
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
          </>
        ) : null}
      </div>
    </div>
  );
}

export function CrmDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});
  const [showAllEventsByCard, setShowAllEventsByCard] = useState<Record<number, boolean>>({});
  const [customerRows, setCustomerRows] = useState<VCustomerContext[]>([]);
  const [conversationRows, setConversationRows] = useState<Conversation[]>([]);
  const [tagDefinitionRows, setTagDefinitionRows] = useState<CrmTagDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [customerRes, conversationRes, tagDefinitionRes] = await Promise.all([
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
        supabase
          .from("crm_tag_definitions")
          .select("*")
          .order("tag_group", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("tag_key", { ascending: true }),
      ]);

      if (cancelled) return;

      const firstError = customerRes.error || conversationRes.error || tagDefinitionRes.error;
      if (firstError) {
        setError(firstError.message);
        setCustomerRows([]);
        setConversationRows([]);
        setTagDefinitionRows([]);
      } else {
        setCustomerRows((customerRes.data || []) as VCustomerContext[]);
        setConversationRows((conversationRes.data || []) as Conversation[]);
        setTagDefinitionRows((tagDefinitionRes.data || []) as CrmTagDefinition[]);
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

  const tagDefinitionByKey = useMemo(
    () => new Map(tagDefinitionRows.map((row) => [row.tag_key, row])),
    [tagDefinitionRows]
  );

  const orderedConversations = useMemo(
    () =>
      [...conversationRows]
        .filter((row) => row.customer_id !== null && row.created_at)
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    [conversationRows]
  );

  const availableDates = useMemo(
    () =>
      uniqueStrings(
        orderedConversations.map((row) => String(row.created_at || "").slice(0, 10)).filter(Boolean)
      ).sort((a, b) => b.localeCompare(a)),
    [orderedConversations]
  );

  useEffect(() => {
    if (!availableDates.length) return;
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  const cards = useMemo(() => {
    if (!selectedDate) return [] as ConversationCard[];

    const searchNeedle = search.trim().toLowerCase();
    const grouped = new Map<number, ConversationCard>();

    for (const row of orderedConversations) {
      const customerId = Number(row.customer_id);
      if (!Number.isFinite(customerId) || !row.created_at) continue;
      if (String(row.created_at).slice(0, 10) !== selectedDate) continue;

      const customer = customerById.get(customerId);
      const label = String(
        customer?.first_name ||
          customer?.whatsapp_phone ||
          customer?.phone ||
          customer?.manychat_id ||
          `Cliente #${customerId}`
      ).trim();
      const phone = String(customer?.whatsapp_phone || customer?.phone || customer?.manychat_id || "").trim();
      const stageKey = String(row.funnel_stage_after || customer?.funnel_stage || "new").trim() || "new";
      const stageLabel = STAGE_LABELS[stageKey] || stageKey;

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
          finalStageLabel: stageLabel,
          leadScore: clamp(Number(customer?.lead_score || 0) || 0, 0, 100),
          firstEventAt: String(row.created_at),
          lastEventAt: String(row.created_at),
          dailySummary: "",
          insightHighlights: [],
          productsToday: [],
          paymentsToday: [],
          topicsToday: [],
          brandsToday: [],
          events: [],
        } satisfies ConversationCard);

      const preview = compactPreview(row.was_audio ? row.audio_transcription || row.message : row.message, 240);
      const summary = compactPreview(row.conversation_summary || preview, 220);
      const insights = cleanStringArray(row.conversation_insights).slice(0, 5);
      const tags = cleanStringArray(row.applied_tags).map((key) => {
        const definition = tagDefinitionByKey.get(key);

        return {
          key,
          label: definition?.label || humanizeCrmTagKey(key),
          group: definition?.tag_group || inferCrmTagGroup(key),
          colorHex: definition?.color_hex || null,
        };
      });
      const payments = cleanStringArray(row.payment_methods_detected);
      const products = cleanStringArray(row.products_mentioned);
      const brands = cleanStringArray(row.brands_detected);
      const topics = cleanStringArray(row.topics_detected);
      const leadScore = clamp(Number(row.lead_score_after ?? customer?.lead_score ?? 0) || 0, 0, 100);

      existing.events.push({
        id: row.id,
        at: String(row.created_at),
        role: String(row.role || "user"),
        timeLabel: formatTime(row.created_at),
        preview,
        summary,
        insights,
        stageLabel,
        leadScore,
        tags,
        payments,
        products,
        brands,
        topics,
      });

      existing.lastEventAt = String(row.created_at);
      existing.finalStageLabel = stageLabel;
      existing.leadScore = leadScore;
      existing.productsToday = uniqueStrings([...existing.productsToday, ...products]);
      existing.paymentsToday = uniqueStrings([...existing.paymentsToday, ...payments]);
      existing.topicsToday = uniqueStrings([...existing.topicsToday, ...topics]);
      existing.brandsToday = uniqueStrings([...existing.brandsToday, ...brands]);

      grouped.set(customerId, existing);
    }

    return Array.from(grouped.values())
      .map((card) => {
        const orderedEvents = [...card.events].sort((a, b) => a.at.localeCompare(b.at));

        return {
          ...card,
          events: orderedEvents,
          dailySummary: buildDailySummary({ ...card, events: orderedEvents }),
          insightHighlights: uniqueStrings(
            orderedEvents.flatMap((event) => event.insights)
          ).slice(0, 8),
        };
      })
      .filter((card) => {
        if (!searchNeedle) return true;
        const haystack = [
          card.label,
          card.phone,
          card.city,
          card.preferredBrand,
          card.currentProduct,
          card.paymentLast,
          card.finalStageLabel,
          card.dailySummary,
          ...card.productsToday,
          ...card.paymentsToday,
          ...card.topicsToday,
          ...card.brandsToday,
          ...card.insightHighlights,
          ...card.events.flatMap((event) => [
            event.preview,
            event.summary,
            ...event.insights,
            ...event.tags.map((tag) => `${tag.key} ${tag.label}`),
            ...event.products,
            ...event.payments,
            ...event.brands,
            ...event.topics,
          ]),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchNeedle);
      })
      .sort((a, b) => String(b.lastEventAt).localeCompare(String(a.lastEventAt)));
  }, [customerById, orderedConversations, search, selectedDate, tagDefinitionByKey]);

  const stats = useMemo(() => {
    const interactions = cards.reduce((sum, card) => sum + card.events.length, 0);
    const tags = cards.reduce(
      (sum, card) => sum + card.events.reduce((inner, event) => inner + event.tags.length, 0),
      0
    );

    return {
      people: cards.length,
      interactions,
      tags,
    };
  }, [cards]);

  useEffect(() => {
    setExpandedEvents({});
    setShowAllEventsByCard({});
    setExpandedCards((current) => {
      const next = { ...current };
      const allowedIds = new Set(cards.map((card) => card.customerId));
      Object.keys(next).forEach((key) => {
        if (!allowedIds.has(Number(key))) {
          delete next[Number(key)];
        }
      });
      cards.slice(0, 2).forEach((card) => {
        if (next[card.customerId] === undefined) {
          next[card.customerId] = true;
        }
      });
      return next;
    });
  }, [cards, selectedDate]);

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,146,60,0.12),transparent_24%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              CRM journeys
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Daily conversation timeline
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                One card per customer per day. You see the exact human and bot turns, their time,
                the tags captured on each interaction, and the compact summary stored in Supabase.
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ej. Francisco, iPhone, pay_naranja"
                className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {availableDates.length === 0 ? (
            <span className="text-sm text-muted-foreground">No dates with CRM activity yet.</span>
          ) : (
            availableDates.slice(0, 12).map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  date === selectedDate
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {formatLongDate(date)}
              </button>
            ))
          )}
        </div>

        {!loading && !error && selectedDate ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {stats.people} personas
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {stats.interactions} interacciones
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 font-medium text-foreground">
              {stats.tags} tags visibles
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="flex h-[420px] items-center justify-center rounded-2xl border bg-background/70 text-sm text-muted-foreground">
            Loading customer journeys...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {error}. Run the CRM timeline migrations and refresh the app types.
          </div>
        ) : cards.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed bg-background/70 text-sm text-muted-foreground">
            No people with CRM movement on {selectedDate ? formatLongDate(selectedDate) : "that day"}.
          </div>
        ) : (
          <div className="space-y-5">
            {cards.map((card) => (
              (() => {
                const isCardExpanded =
                  expandedCards[card.customerId] ?? (search.trim().length > 0 || cards.indexOf(card) < 2);
                const showAllEvents = showAllEventsByCard[card.customerId] ?? false;
                const visibleEvents =
                  isCardExpanded && (showAllEvents || search.trim().length > 0)
                    ? card.events
                    : isCardExpanded
                      ? card.events.slice(-DEFAULT_VISIBLE_EVENTS)
                      : [];
                const hiddenEventsCount = Math.max(card.events.length - visibleEvents.length, 0);

                return (
                  <article
                    key={`card-${card.customerId}`}
                    className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.08),transparent_24%)] shadow-sm"
                  >
                    <header className="border-b bg-background/85 px-5 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{card.label}</h3>
                        <p className="text-sm text-muted-foreground">
                          {card.phone || `Cliente #${card.customerId}`}
                          {card.city ? ` · ${card.city}` : ""}
                          {card.firstEventAt ? ` · desde ${formatTime(card.firstEventAt)}` : ""}
                          {card.lastEventAt ? ` hasta ${formatTime(card.lastEventAt)}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                          {card.finalStageLabel}
                        </span>
                        <span className="rounded-full border bg-muted/60 px-2 py-1 font-medium text-foreground">
                          score {card.leadScore}
                        </span>
                        {card.preferredBrand ? (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 font-medium text-orange-700 dark:text-orange-300">
                            {normalizeSignal(card.preferredBrand)}
                          </span>
                        ) : null}
                        {card.currentProduct ? (
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 font-medium text-primary">
                            {card.currentProduct}
                          </span>
                        ) : null}
                        {card.paymentLast ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-medium text-sky-700 dark:text-sky-300">
                            {normalizeSignal(card.paymentLast)}
                          </span>
                        ) : null}
                        <span className="rounded-full border bg-background/80 px-2 py-1 font-medium text-foreground">
                          {card.events.length} interacciones
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:max-w-md xl:items-end">
                      <div className="rounded-2xl border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <CalendarDays className="h-4 w-4 text-primary" />
                          Summary
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {card.dailySummary || "Sin resumen compacto para este dia todavia."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCards((current) => ({
                            ...current,
                            [card.customerId]: !isCardExpanded,
                          }))
                        }
                        className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/30 hover:text-primary"
                      >
                        {isCardExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Ocultar conversación
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Ver conversación
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </header>

                {isCardExpanded ? (
                  <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      {hiddenEventsCount > 0 ? (
                        <div className="flex items-center justify-between rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                          <span>
                            Mostrando las ultimas {visibleEvents.length} interacciones de {card.events.length}.
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setShowAllEventsByCard((current) => ({
                                ...current,
                                [card.customerId]: !showAllEvents,
                              }))
                            }
                            className="font-medium text-primary hover:underline"
                          >
                            {showAllEvents ? "Ver menos" : `Ver ${hiddenEventsCount} mas`}
                          </button>
                        </div>
                      ) : null}

                      {visibleEvents.map((event) => (
                        <EventBubble
                          key={`${card.customerId}-${event.id}`}
                          event={event}
                          expanded={expandedEvents[event.id] ?? false}
                          onToggle={() =>
                            setExpandedEvents((current) => ({
                              ...current,
                              [event.id]: !(current[event.id] ?? false),
                            }))
                          }
                        />
                      ))}
                    </div>

                    <aside className="space-y-4">
                      <section className="rounded-2xl border bg-background/80 p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Tag className="h-4 w-4 text-primary" />
                          Highlights
                        </div>
                        {card.insightHighlights.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {card.insightHighlights.map((insight) => (
                              <span
                                key={`${card.customerId}-highlight-${insight}`}
                                className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                              >
                                {insight}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">
                            No insight highlights stored for this day yet.
                          </p>
                        )}
                      </section>

                      <section className="rounded-2xl border bg-background/80 p-4 shadow-sm">
                        <p className="text-sm font-medium text-foreground">Signals for the day</p>
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Products
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {card.productsToday.length > 0 ? (
                                card.productsToday.map((product) => (
                                  <span
                                    key={`${card.customerId}-product-${product}`}
                                    className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300"
                                  >
                                    {product}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No product mention</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Payment
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {card.paymentsToday.length > 0 ? (
                                card.paymentsToday.map((payment) => (
                                  <span
                                    key={`${card.customerId}-payment-${payment}`}
                                    className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                                  >
                                    {normalizeSignal(payment)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No payment signal</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Topics
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {card.topicsToday.length > 0 ? (
                                card.topicsToday.map((topic) => (
                                  <span
                                    key={`${card.customerId}-topic-${topic}`}
                                    className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 text-[11px] font-medium text-fuchsia-700 dark:text-fuchsia-300"
                                  >
                                    {normalizeSignal(topic)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No topic signal</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>
                    </aside>
                  </div>
                ) : (
                  <div className="px-5 py-4 text-sm text-muted-foreground">
                    Conversación colapsada. El resumen, highlights y señales quedan visibles arriba.
                  </div>
                )}
              </article>
                );
              })()
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
