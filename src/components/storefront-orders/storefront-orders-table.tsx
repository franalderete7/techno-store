"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  CheckCircle2,
  Eye,
  ImageIcon,
  Loader2,
  MessageCircle,
  Package,
  Search,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requireAuthenticatedUser } from "@/lib/auth-user";
import {
  getErrorMessage,
  isMissingColumnError,
  isMissingRelationError,
  isRowLevelSecurityError,
} from "@/lib/utils";
import type {
  StockUnit,
  StorefrontOrder,
  StorefrontOrderItem,
  StorefrontOrderUnitAssignment,
  StorefrontOrderUpdate,
} from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ORDER_STATUS_OPTIONS = [
  { value: "pending_whatsapp", label: "Pendiente WhatsApp" },
  { value: "whatsapp_started", label: "WhatsApp iniciado" },
  { value: "awaiting_payment_proof", label: "Esperando comprobante" },
  { value: "payment_under_review", label: "Pago en revision" },
  { value: "ready_for_dispatch", label: "Listo despacho" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

type StorefrontOrderStatus = (typeof ORDER_STATUS_OPTIONS)[number]["value"];
type StorefrontOrderStatusFilter = StorefrontOrderStatus | "all";

type OrderItemView = {
  rowId: number | null;
  productId: number | null;
  productKey: string;
  name: string;
  quantity: number;
  unitPriceArs: number | null;
  lineTotalArs: number | null;
  availability: string | null;
  imageUrl: string | null;
};

type StorefrontOrderSnapshotItem = {
  id?: unknown;
  product_key?: unknown;
  product_name?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  unit_price_ars?: unknown;
  line_total?: unknown;
  line_total_ars?: unknown;
  availability?: unknown;
  availability_code?: unknown;
  image_url?: unknown;
};

function normalizeOrderStatus(status: string | null | undefined): StorefrontOrderStatus {
  const normalized = String(status || "").trim();
  if (ORDER_STATUS_OPTIONS.some((option) => option.value === normalized)) {
    return normalized as StorefrontOrderStatus;
  }
  return "pending_whatsapp";
}

function getOrderStatusLabel(status: string | null | undefined) {
  const normalized = normalizeOrderStatus(status);
  return ORDER_STATUS_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

function getOrderStatusTone(status: string | null | undefined) {
  switch (normalizeOrderStatus(status)) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "ready_for_dispatch":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300";
    case "payment_under_review":
      return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300";
    case "awaiting_payment_proof":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "whatsapp_started":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "cancelled":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-muted-foreground/20 bg-muted/40 text-muted-foreground";
  }
}

function getPaymentTone(isConfirmed: boolean) {
  return isConfirmed
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function formatMoney(value: number | null | undefined, currency = "ARS") {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function getOrderFullName(order: StorefrontOrder) {
  return [order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "Sin nombre";
}

function getOrderContact(order: StorefrontOrder) {
  return String(order.phone || order.whatsapp_phone || order.email || "").trim();
}

function getWhatsAppLink(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function parseSnapshotItems(items: StorefrontOrder["items"]): OrderItemView[] {
  if (!Array.isArray(items)) return [];

  const parsed: Array<OrderItemView | null> = items.map((item, index) => {
      const snapshot = (item ?? {}) as StorefrontOrderSnapshotItem;
      const productKey = String(snapshot.product_key || "").trim();
      const productName = String(snapshot.product_name || "").trim();
      const quantity = Number(snapshot.quantity || 0);
      const unitPriceArs = Number(snapshot.unit_price_ars ?? snapshot.unit_price ?? NaN);
      const lineTotalArs = Number(snapshot.line_total_ars ?? snapshot.line_total ?? NaN);
      const availability =
        String(snapshot.availability_code ?? snapshot.availability ?? "").trim() || null;
      const imageUrl = String(snapshot.image_url || "").trim() || null;

      if (!productKey && !productName) return null;

      return {
        rowId: null,
        productId: Number.isFinite(Number(snapshot.id)) ? Number(snapshot.id) : null,
        productKey: productKey || `snapshot-${index}`,
        name: productName || productKey,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPriceArs: Number.isFinite(unitPriceArs) ? unitPriceArs : null,
        lineTotalArs: Number.isFinite(lineTotalArs) ? lineTotalArs : null,
        availability,
        imageUrl,
      };
    });

  return parsed.filter((item): item is OrderItemView => item !== null);
}

function buildItemViews(order: StorefrontOrder, itemRows: StorefrontOrderItem[]) {
  if (itemRows.length > 0) {
    return [...itemRows]
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((item, index) => ({
        rowId: item.id,
        productId: item.product_id,
        productKey: item.product_key || `item-${item.id}-${index}`,
        name: item.product_name || item.product_key,
        quantity: item.quantity,
        unitPriceArs: item.unit_price_ars,
        lineTotalArs: item.line_total_ars,
        availability: item.availability_code,
        imageUrl: item.image_url,
      }));
  }

  return parseSnapshotItems(order.items);
}

function buildOrderSearchText(order: StorefrontOrder, itemViews: OrderItemView[]) {
  return [
    order.id,
    order.first_name,
    order.last_name,
    order.email,
    order.phone,
    order.whatsapp_phone,
    order.city,
    order.province,
    order.address,
    order.manychat_id,
    order.whatsapp_wa_id,
    itemViews.map((item) => item.name).join(" "),
    itemViews.map((item) => item.productKey).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildUnitLabel(unit: StockUnit) {
  const parts = [
    `IMEI ${unit.imei1}`,
    unit.color ? `· ${unit.color}` : "",
    unit.battery_health != null ? `· Bat ${unit.battery_health}%` : "",
    unit.status ? `· ${unit.status}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function buildStorefrontOrderProofAssetKey(orderId: number) {
  return `order-${orderId}/payment-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function uploadStorefrontOrderProofImage(
  file: File,
  orderId: number
): Promise<{ secureUrl?: string; error?: string }> {
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("assetKey", buildStorefrontOrderProofAssetKey(orderId));
  uploadFormData.append("folder", "storefront-orders");

  const uploadResponse = await fetch("/api/cloudinary/upload", {
    method: "POST",
    body: uploadFormData,
  });

  const uploadResult = (await uploadResponse.json()) as { error?: string; secureUrl?: string };
  if (!uploadResponse.ok || !uploadResult.secureUrl) {
    return { error: uploadResult.error || "No pude subir el comprobante a Cloudinary." };
  }

  return { secureUrl: uploadResult.secureUrl };
}

async function deleteStorefrontOrderProofImage(imageUrl: string): Promise<string | null> {
  const response = await fetch("/api/cloudinary/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageUrl,
    }),
  });

  if (response.ok) return null;

  const result = (await response.json()) as { error?: string };
  return result.error || "No pude borrar el comprobante de Cloudinary.";
}

function OrderStatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-full border border-primary/15 bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value || "—"}</p>
    </div>
  );
}

export function StorefrontOrdersTable() {
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Map<number, StorefrontOrderItem[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StorefrontOrderStatusFilter>("all");
  const [detailOrder, setDetailOrder] = useState<StorefrontOrder | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<number | null>(null);
  const [uploadingProofOrderId, setUploadingProofOrderId] = useState<number | null>(null);
  const [deletingProofUrl, setDeletingProofUrl] = useState<string | null>(null);
  const [loadingDetailMeta, setLoadingDetailMeta] = useState(false);
  const [detailAssignmentRows, setDetailAssignmentRows] = useState<StorefrontOrderUnitAssignment[]>([]);
  const [detailStockUnits, setDetailStockUnits] = useState<StockUnit[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  const [busyAssignmentItemId, setBusyAssignmentItemId] = useState<number | null>(null);

  const updateOrderLocally = (orderId: number, patch: Partial<StorefrontOrder>) => {
    setOrders((current) =>
      current.map((currentOrder) =>
        currentOrder.id === orderId ? { ...currentOrder, ...patch } : currentOrder
      )
    );
    setDetailOrder((current) =>
      current && current.id === orderId ? { ...current, ...patch } : current
    );
  };

  const loadOrders = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const { data: orderRows, error: ordersError } = await supabase
        .from("storefront_orders")
        .select(
          "id,first_name,last_name,email,payment_method,currency,subtotal,item_count,items,transfer_aliases,notes,created_at,address,zip_code,city,province,delivery_instructions,phone,phone_normalized,customer_id,manychat_id,whatsapp_wa_id,whatsapp_phone,source_channel,status,whatsapp_handoff_token,whatsapp_handoff_started_at,payment_confirmed_at,payment_confirmed_by_user_id,payment_proof_urls"
        )
        .order("created_at", { ascending: false })
        .limit(250);

      if (ordersError) {
        throw ordersError;
      }

      const loadedOrders = (orderRows ?? []) as StorefrontOrder[];
      const orderIds = loadedOrders.map((order) => order.id);

      let itemsByOrderId = new Map<number, StorefrontOrderItem[]>();
      if (orderIds.length > 0) {
        const { data: itemRows, error: itemsError } = await supabase
          .from("storefront_order_items")
          .select(
            "id,order_id,sort_order,product_id,product_key,product_name,image_url,unit_price_ars,quantity,line_total_ars,availability_code,created_at"
          )
          .in("order_id", orderIds)
          .order("order_id", { ascending: false })
          .order("sort_order", { ascending: true });

        if (itemsError) {
          throw itemsError;
        }

        itemsByOrderId = (itemRows ?? []).reduce((map, item) => {
          const current = map.get(item.order_id) ?? [];
          current.push(item as StorefrontOrderItem);
          map.set(item.order_id, current);
          return map;
        }, new Map<number, StorefrontOrderItem[]>());
      }

      setOrders(loadedOrders);
      setOrderItemsByOrderId(itemsByOrderId);
    } catch (loadError) {
      if (
        isMissingRelationError(loadError, "storefront_orders") ||
        isMissingRelationError(loadError, "storefront_order_items")
      ) {
        setError(
          "Faltan las tablas de checkout web. Ejecuta `storefront_checkout.sql`, `storefront_checkout_delivery_fields.sql` y `storefront_order_items.sql` en Supabase."
        );
      } else if (
        isMissingColumnError(loadError, "phone") ||
        isMissingColumnError(loadError, "phone_normalized") ||
        isMissingColumnError(loadError, "customer_id") ||
        isMissingColumnError(loadError, "manychat_id") ||
        isMissingColumnError(loadError, "whatsapp_wa_id") ||
        isMissingColumnError(loadError, "whatsapp_phone") ||
        isMissingColumnError(loadError, "source_channel")
      ) {
        setError(
          "La tabla `storefront_orders` esta atrasada. Ejecuta `storefront_order_customer_identity.sql` en Supabase."
        );
      } else if (
        isMissingColumnError(loadError, "status") ||
        isMissingColumnError(loadError, "whatsapp_handoff_token") ||
        isMissingColumnError(loadError, "whatsapp_handoff_started_at")
      ) {
        setError(
          "La tabla `storefront_orders` todavia no tiene el flujo de WhatsApp. Ejecuta `storefront_order_whatsapp_handoff.sql` en Supabase."
        );
      } else if (
        isMissingColumnError(loadError, "payment_confirmed_at") ||
        isMissingColumnError(loadError, "payment_confirmed_by_user_id") ||
        isMissingColumnError(loadError, "payment_proof_urls")
      ) {
        setError(
          "Faltan columnas de confirmacion de pago. Ejecuta `storefront_order_fulfillment.sql` en Supabase."
        );
      } else if (isRowLevelSecurityError(loadError)) {
        setError("Supabase esta bloqueando la lectura de pedidos web por RLS.");
      } else {
        setError(getErrorMessage(loadError, "No pude cargar los pedidos del storefront."));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const orderItemViews = useMemo(() => {
    const map = new Map<number, OrderItemView[]>();
    orders.forEach((order) => {
      map.set(order.id, buildItemViews(order, orderItemsByOrderId.get(order.id) ?? []));
    });
    return map;
  }, [orders, orderItemsByOrderId]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const normalizedStatus = normalizeOrderStatus(order.status);
      if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) return true;

      return buildOrderSearchText(order, orderItemViews.get(order.id) ?? []).includes(
        normalizedSearch
      );
    });
  }, [orders, orderItemViews, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const confirmedOrders = orders.filter((order) => Boolean(order.payment_confirmed_at));
    const confirmedRevenue = confirmedOrders.reduce(
      (sum, order) => sum + Number(order.subtotal || 0),
      0
    );

    return {
      totalOrders: orders.length,
      pendingWhatsApp: orders.filter(
        (order) => normalizeOrderStatus(order.status) === "pending_whatsapp"
      ).length,
      awaitingProof: orders.filter(
        (order) => !order.payment_confirmed_at && normalizeOrderStatus(order.status) === "awaiting_payment_proof"
      ).length,
      confirmedOrders: confirmedOrders.length,
      confirmedRevenue,
    };
  }, [orders]);

  const handleStatusChange = async (order: StorefrontOrder, nextStatus: StorefrontOrderStatus) => {
    const previousStatus = normalizeOrderStatus(order.status);
    if (previousStatus === nextStatus) return;

    setUpdatingOrderId(order.id);
    setError(null);

    const patch: StorefrontOrderUpdate = { status: nextStatus };
    if (
      !order.whatsapp_handoff_started_at &&
      nextStatus !== "pending_whatsapp" &&
      nextStatus !== "cancelled"
    ) {
      patch.whatsapp_handoff_started_at = new Date().toISOString();
    }

    try {
      await requireAuthenticatedUser();
      const { error: updateError } = await supabase
        .from("storefront_orders")
        .update(patch)
        .eq("id", order.id);

      if (updateError) throw updateError;

      updateOrderLocally(order.id, {
        status: nextStatus,
        whatsapp_handoff_started_at:
          patch.whatsapp_handoff_started_at ?? order.whatsapp_handoff_started_at,
      });
    } catch (updateError) {
      if (isRowLevelSecurityError(updateError)) {
        setError("Supabase esta bloqueando la actualizacion de pedidos web por RLS.");
      } else {
        setError(getErrorMessage(updateError, "No pude actualizar el estado del pedido."));
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handlePaymentConfirmation = async (order: StorefrontOrder, confirmed: boolean) => {
    setConfirmingOrderId(order.id);
    setError(null);

    try {
      const user = await requireAuthenticatedUser();
      const previousStatus = normalizeOrderStatus(order.status);
      const patch: StorefrontOrderUpdate = {
        payment_confirmed_at: confirmed ? new Date().toISOString() : null,
        payment_confirmed_by_user_id: confirmed ? user.id : null,
        status: confirmed
          ? previousStatus === "completed" || previousStatus === "cancelled"
            ? previousStatus
            : "ready_for_dispatch"
          : previousStatus === "ready_for_dispatch"
            ? "awaiting_payment_proof"
            : previousStatus,
      };

      const { error: updateError } = await supabase
        .from("storefront_orders")
        .update(patch)
        .eq("id", order.id);

      if (updateError) throw updateError;

      updateOrderLocally(order.id, {
        payment_confirmed_at: patch.payment_confirmed_at ?? null,
        payment_confirmed_by_user_id: patch.payment_confirmed_by_user_id ?? null,
        status: patch.status ?? order.status,
      });
    } catch (confirmError) {
      if (isMissingColumnError(confirmError, "payment_confirmed_at")) {
        setError("Falta la columna de confirmacion de pago. Ejecuta `storefront_order_fulfillment.sql`.");
      } else if (isRowLevelSecurityError(confirmError)) {
        setError("Supabase esta bloqueando la confirmacion de pago por RLS.");
      } else {
        setError(getErrorMessage(confirmError, "No pude confirmar el comprobante."));
      }
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleUploadProof = async (order: StorefrontOrder, files: FileList | null) => {
    const selectedFiles = files ? Array.from(files).filter((file) => file.type.startsWith("image/")) : [];
    if (selectedFiles.length === 0) return;

    setUploadingProofOrderId(order.id);
    setError(null);

    try {
      await requireAuthenticatedUser();

      const uploadedUrls: string[] = [];
      for (const file of selectedFiles) {
        const uploadResult = await uploadStorefrontOrderProofImage(file, order.id);
        if (!uploadResult.secureUrl) {
          throw new Error(uploadResult.error || "No pude subir uno de los comprobantes.");
        }
        uploadedUrls.push(uploadResult.secureUrl);
      }

      const nextProofUrls = [
        ...(Array.isArray(order.payment_proof_urls) ? order.payment_proof_urls : []),
        ...uploadedUrls,
      ];

      const { error: updateError } = await supabase
        .from("storefront_orders")
        .update({
          payment_proof_urls: nextProofUrls,
        })
        .eq("id", order.id);

      if (updateError) throw updateError;

      updateOrderLocally(order.id, {
        payment_proof_urls: nextProofUrls,
      });
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "No pude guardar el comprobante del pedido."));
    } finally {
      setUploadingProofOrderId(null);
    }
  };

  const handleRemoveProof = async (order: StorefrontOrder, imageUrl: string) => {
    setDeletingProofUrl(imageUrl);
    setError(null);

    try {
      await requireAuthenticatedUser();

      const nextProofUrls = (Array.isArray(order.payment_proof_urls) ? order.payment_proof_urls : []).filter(
        (url) => url !== imageUrl
      );

      const { error: updateError } = await supabase
        .from("storefront_orders")
        .update({
          payment_proof_urls: nextProofUrls.length > 0 ? nextProofUrls : null,
        })
        .eq("id", order.id);

      if (updateError) throw updateError;

      const deleteError = await deleteStorefrontOrderProofImage(imageUrl);
      if (deleteError) {
        console.error(deleteError);
      }

      updateOrderLocally(order.id, {
        payment_proof_urls: nextProofUrls.length > 0 ? nextProofUrls : null,
      });
    } catch (removeError) {
      setError(getErrorMessage(removeError, "No pude quitar el comprobante del pedido."));
    } finally {
      setDeletingProofUrl(null);
    }
  };

  const selectedOrderItemViews = detailOrder ? orderItemViews.get(detailOrder.id) ?? [] : [];

  useEffect(() => {
    let cancelled = false;

    async function loadDetailMeta() {
      if (!detailOrder) {
        setDetailAssignmentRows([]);
        setDetailStockUnits([]);
        setAssignmentDrafts({});
        return;
      }

      const itemRows = orderItemsByOrderId.get(detailOrder.id) ?? [];
      const orderItemIds = itemRows.map((item) => item.id);
      const productKeys = [...new Set(itemRows.map((item) => item.product_key).filter(Boolean))];

      if (orderItemIds.length === 0 || productKeys.length === 0) {
        setDetailAssignmentRows([]);
        setDetailStockUnits([]);
        setAssignmentDrafts({});
        return;
      }

      setLoadingDetailMeta(true);

      const [assignmentRes, stockRes] = await Promise.all([
        supabase
          .from("storefront_order_unit_assignments")
          .select("id,order_item_id,stock_unit_id,assigned_at,assigned_by_user_id")
          .in("order_item_id", orderItemIds)
          .order("assigned_at", { ascending: false }),
        supabase
          .from("stock_units")
          .select("*")
          .in("product_key", productKeys)
          .order("date_received", { ascending: false }),
      ]);

      if (cancelled) return;

      if (assignmentRes.error || stockRes.error) {
        const detailError = assignmentRes.error || stockRes.error;

        if (
          isMissingRelationError(detailError, "storefront_order_unit_assignments") ||
          isMissingColumnError(detailError, "payment_confirmed_at")
        ) {
          setError(
            "Falta la estructura de fulfillment web. Ejecuta `storefront_order_fulfillment.sql` en Supabase."
          );
        } else {
          setError(getErrorMessage(detailError, "No pude cargar asignaciones de stock para este pedido."));
        }

        setDetailAssignmentRows([]);
        setDetailStockUnits([]);
      } else {
        setDetailAssignmentRows((assignmentRes.data || []) as StorefrontOrderUnitAssignment[]);
        setDetailStockUnits((stockRes.data || []) as StockUnit[]);
      }

      setLoadingDetailMeta(false);
    }

    void loadDetailMeta();

    return () => {
      cancelled = true;
    };
  }, [detailOrder, orderItemsByOrderId]);

  const stockUnitsById = useMemo(
    () => new Map(detailStockUnits.map((unit) => [unit.id, unit])),
    [detailStockUnits]
  );

  const assignmentsByOrderItemId = useMemo(() => {
    const map = new Map<number, StorefrontOrderUnitAssignment[]>();
    detailAssignmentRows.forEach((assignment) => {
      const current = map.get(assignment.order_item_id) ?? [];
      current.push(assignment);
      map.set(assignment.order_item_id, current);
    });
    return map;
  }, [detailAssignmentRows]);

  const assignedOrderItemByStockUnitId = useMemo(() => {
    const map = new Map<number, number>();
    detailAssignmentRows.forEach((assignment) => {
      map.set(assignment.stock_unit_id, assignment.order_item_id);
    });
    return map;
  }, [detailAssignmentRows]);

  const selectedWhatsAppLink = detailOrder
    ? getWhatsAppLink(detailOrder.phone || detailOrder.whatsapp_phone)
    : null;
  const selectedProofUrls =
    detailOrder && Array.isArray(detailOrder.payment_proof_urls)
      ? detailOrder.payment_proof_urls
      : [];

  const handleAssignUnit = async (orderItem: OrderItemView) => {
    if (!orderItem.rowId) return;

    const selectedValue = assignmentDrafts[orderItem.rowId];
    const stockUnitId = Number(selectedValue);
    if (!Number.isFinite(stockUnitId) || stockUnitId <= 0) return;

    setBusyAssignmentItemId(orderItem.rowId);
    setError(null);

    try {
      const user = await requireAuthenticatedUser();

      const { data, error: insertError } = await supabase
        .from("storefront_order_unit_assignments")
        .insert({
          order_item_id: orderItem.rowId,
          stock_unit_id: stockUnitId,
          assigned_by_user_id: user.id,
        })
        .select("id,order_item_id,stock_unit_id,assigned_at,assigned_by_user_id")
        .single();

      if (insertError) throw insertError;

      const unit = stockUnitsById.get(stockUnitId);
      if (unit && unit.status === "in_stock") {
        const { error: unitError } = await supabase
          .from("stock_units")
          .update({ status: "reserved" })
          .eq("id", stockUnitId);

        if (unitError) throw unitError;
      }

      setDetailAssignmentRows((current) => [data as StorefrontOrderUnitAssignment, ...current]);
      setDetailStockUnits((current) =>
        current.map((unit) =>
          unit.id === stockUnitId && unit.status === "in_stock"
            ? { ...unit, status: "reserved" }
            : unit
        )
      );
      setAssignmentDrafts((current) => {
        const next = { ...current };
        delete next[orderItem.rowId as number];
        return next;
      });
    } catch (assignError) {
      if (isMissingRelationError(assignError, "storefront_order_unit_assignments")) {
        setError("Falta la tabla de asignacion de stock. Ejecuta `storefront_order_fulfillment.sql`.");
      } else if (isRowLevelSecurityError(assignError)) {
        setError("Supabase esta bloqueando la asignacion de stock por RLS.");
      } else {
        setError(getErrorMessage(assignError, "No pude vincular el equipo real al pedido."));
      }
    } finally {
      setBusyAssignmentItemId(null);
    }
  };

  const handleUnassignUnit = async (assignment: StorefrontOrderUnitAssignment) => {
    setBusyAssignmentItemId(assignment.order_item_id);
    setError(null);

    try {
      const unit = stockUnitsById.get(assignment.stock_unit_id);

      const { error: deleteError } = await supabase
        .from("storefront_order_unit_assignments")
        .delete()
        .eq("id", assignment.id);

      if (deleteError) throw deleteError;

      if (unit && unit.status === "reserved") {
        const { error: unitError } = await supabase
          .from("stock_units")
          .update({ status: "in_stock" })
          .eq("id", unit.id);

        if (unitError) throw unitError;
      }

      setDetailAssignmentRows((current) =>
        current.filter((currentAssignment) => currentAssignment.id !== assignment.id)
      );
      setDetailStockUnits((current) =>
        current.map((currentUnit) =>
          currentUnit.id === assignment.stock_unit_id && currentUnit.status === "reserved"
            ? { ...currentUnit, status: "in_stock" }
            : currentUnit
        )
      );
    } catch (unassignError) {
      if (isRowLevelSecurityError(unassignError)) {
        setError("Supabase esta bloqueando la desvinculacion de stock por RLS.");
      } else {
        setError(getErrorMessage(unassignError, "No pude quitar la asignacion del equipo."));
      }
    } finally {
      setBusyAssignmentItemId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Storefront</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Pedidos web</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cobro confirmado por humano y asignacion real de equipos desde stock, sin mezclar
            pedidos pendientes con facturacion valida.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadOrders({ silent: true })}
          disabled={loading || refreshing}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Recargar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OrderStatCard
          label="Pedidos"
          value={stats.totalOrders.toString()}
          helper="Total cargado desde el checkout web."
          icon={ShoppingBag}
        />
        <OrderStatCard
          label="Pendiente WhatsApp"
          value={stats.pendingWhatsApp.toString()}
          helper="Todavia no iniciaron el chat de handoff."
          icon={MessageCircle}
        />
        <OrderStatCard
          label="Esperando comprobante"
          value={stats.awaitingProof.toString()}
          helper="Entraron al bot, pero falta confirmacion humana."
          icon={Package}
        />
        <OrderStatCard
          label="Facturacion confirmada"
          value={formatMoney(stats.confirmedRevenue)}
          helper={`${stats.confirmedOrders} pedidos con comprobante validado.`}
          icon={CheckCircle2}
        />
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por cliente, telefono, email, producto, product_key..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StorefrontOrderStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {ORDER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="justify-center px-3 py-1.5 text-xs">
              {filteredOrders.length} visibles
            </Badge>
          </div>
        </div>

        {error ? (
          <div className="border-b bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando pedidos web...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center gap-2 px-6 text-center">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No hay pedidos que coincidan.</p>
            <p className="text-sm text-muted-foreground">
              Ajusta el filtro o espera nuevos checkouts desde el storefront.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Vinculo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const itemViews = orderItemViews.get(order.id) ?? [];
                  const itemPreview = itemViews.slice(0, 2).map((item) => item.name).join(", ");
                  const extraItems = Math.max(itemViews.length - 2, 0);
                  const hasCrmLink = Boolean(order.customer_id || order.manychat_id || order.whatsapp_wa_id);
                  const isUpdating = updatingOrderId === order.id;
                  const isConfirmed = Boolean(order.payment_confirmed_at);

                  return (
                    <TableRow key={order.id}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">#{order.id}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDateTime(order.created_at)}
                          </div>
                          <Badge variant="outline" className="text-[11px]">
                            {order.source_channel || "storefront_web"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">{getOrderFullName(order)}</div>
                          <div className="text-sm text-muted-foreground">{order.email}</div>
                          <div className="text-sm text-muted-foreground">
                            {getOrderContact(order) || "Sin telefono"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[order.city, order.province].filter(Boolean).join(", ") || "Sin ubicacion"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {itemPreview || "Sin items"}
                            {extraItems > 0 ? ` +${extraItems}` : ""}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {order.item_count} unidad(es)
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {itemViews.map((item) => item.productKey).slice(0, 2).join(" · ")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">{formatMoney(order.subtotal, order.currency)}</div>
                          <Badge className={getPaymentTone(isConfirmed)}>
                            {isConfirmed ? "Pago confirmado" : "Sin confirmar"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {hasCrmLink ? (
                            <Badge variant="outline">CRM vinculado</Badge>
                          ) : (
                            <Badge variant="outline">Solo web</Badge>
                          )}
                          {order.customer_id ? <Badge variant="outline">Customer #{order.customer_id}</Badge> : null}
                          {order.manychat_id ? <Badge variant="outline">ManyChat</Badge> : null}
                          {order.whatsapp_wa_id ? <Badge variant="outline">WA ID</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex min-w-[220px] flex-col gap-2">
                          <Badge className={getOrderStatusTone(order.status)}>
                            {getOrderStatusLabel(order.status)}
                          </Badge>
                          <Select
                            value={normalizeOrderStatus(order.status)}
                            onValueChange={(value) =>
                              void handleStatusChange(order, value as StorefrontOrderStatus)
                            }
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button variant="outline" size="sm" onClick={() => setDetailOrder(order)}>
                          <Eye className="h-4 w-4" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={detailOrder !== null} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl overflow-hidden p-0 sm:max-w-6xl">
          {detailOrder ? (
            <div className="flex max-h-[88vh] flex-col">
              <DialogHeader className="border-b px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <DialogTitle>
                      Pedido web #{detailOrder.id} · {getOrderFullName(detailOrder)}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      {detailOrder.email} · {detailOrder.phone || detailOrder.whatsapp_phone || "Sin telefono"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={getOrderStatusTone(detailOrder.status)}>
                      {getOrderStatusLabel(detailOrder.status)}
                    </Badge>
                    <Badge className={getPaymentTone(Boolean(detailOrder.payment_confirmed_at))}>
                      {detailOrder.payment_confirmed_at ? "Pago confirmado" : "Pago sin confirmar"}
                    </Badge>
                    <Badge variant="outline">
                      {selectedProofUrls.length} comprobante{selectedProofUrls.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <section className="space-y-4">
                    <div className="rounded-3xl border bg-muted/20 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Cobro y validacion humana
                          </p>
                          <p className="mt-2 text-3xl font-semibold">
                            {formatMoney(detailOrder.subtotal, detailOrder.currency)}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Metodo: {String(detailOrder.payment_method || "transferencia").replace(/_/g, " ")}
                          </p>
                        </div>
                        <div className="flex w-full flex-col gap-2 lg:max-w-[280px]">
                          <Button
                            onClick={() =>
                              void handlePaymentConfirmation(detailOrder, !detailOrder.payment_confirmed_at)
                            }
                            disabled={confirmingOrderId === detailOrder.id}
                          >
                            {confirmingOrderId === detailOrder.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {detailOrder.payment_confirmed_at ? "Desconfirmar pago" : "Confirmar comprobante"}
                          </Button>
                          <Select
                            value={normalizeOrderStatus(detailOrder.status)}
                            onValueChange={(value) =>
                              void handleStatusChange(detailOrder, value as StorefrontOrderStatus)
                            }
                            disabled={updatingOrderId === detailOrder.id}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <DetailField
                          label="Confirmado por humano"
                          value={
                            detailOrder.payment_confirmed_at
                              ? `${formatDateTime(detailOrder.payment_confirmed_at)} · ${detailOrder.payment_confirmed_by_user_id || "sin user id"}`
                              : "Todavia no"
                          }
                        />
                        <DetailField
                          label="Handoff WhatsApp"
                          value={
                            detailOrder.whatsapp_handoff_started_at
                              ? formatDateTime(detailOrder.whatsapp_handoff_started_at)
                              : "Todavia no"
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label="Cliente" value={getOrderFullName(detailOrder)} />
                      <DetailField label="Email" value={detailOrder.email} />
                      <DetailField
                        label="Telefono"
                        value={detailOrder.phone || detailOrder.whatsapp_phone || "Sin telefono"}
                      />
                      <DetailField
                        label="Ubicacion"
                        value={[detailOrder.city, detailOrder.province].filter(Boolean).join(", ") || "Sin ciudad"}
                      />
                      <DetailField
                        label="Direccion"
                        value={detailOrder.address || "Sin direccion"}
                      />
                      <DetailField
                        label="CP"
                        value={detailOrder.zip_code || "Sin codigo postal"}
                      />
                    </div>

                    {detailOrder.delivery_instructions ? (
                      <div className="rounded-3xl border bg-background/80 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Indicaciones</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {detailOrder.delivery_instructions}
                        </p>
                      </div>
                    ) : null}

                    {detailOrder.notes ? (
                      <div className="rounded-3xl border bg-background/80 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Notas guardadas</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {detailOrder.notes}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-3xl border bg-card p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fulfillment real</p>
                          <h3 className="mt-1 text-lg font-semibold">Items y equipos asignados</h3>
                        </div>
                        {loadingDetailMeta ? (
                          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando stock compatible...
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-4">
                        {selectedOrderItemViews.length === 0 ? (
                          <div className="rounded-2xl border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
                            No hay items normalizados para este pedido.
                          </div>
                        ) : (
                          selectedOrderItemViews.map((item) => {
                            const itemAssignments =
                              item.rowId != null ? assignmentsByOrderItemId.get(item.rowId) ?? [] : [];
                            const assignedUnits: Array<{
                              assignment: StorefrontOrderUnitAssignment;
                              unit: StockUnit;
                            }> = itemAssignments
                              .map((assignment) => ({
                                assignment,
                                unit: stockUnitsById.get(assignment.stock_unit_id) ?? null,
                              }))
                              .filter(
                                (
                                  entry
                                ): entry is {
                                  assignment: StorefrontOrderUnitAssignment;
                                  unit: StockUnit;
                                } => entry.unit !== null
                              );
                            const availableUnits = detailStockUnits.filter((unit) => {
                              if (unit.product_key !== item.productKey) return false;
                              const assignedOrderItemId = assignedOrderItemByStockUnitId.get(unit.id);
                              if (assignedOrderItemId && assignedOrderItemId !== item.rowId) return false;
                              return unit.status === "in_stock" || unit.status === "reserved";
                            });
                            const assignmentComplete = assignedUnits.length >= item.quantity;

                            return (
                              <div
                                key={`${detailOrder.id}-${item.productKey}-${item.rowId ?? "snapshot"}`}
                                className="rounded-3xl border bg-background/80 p-4"
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <p className="text-base font-semibold">{item.name}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {item.productKey} · {item.quantity} unidad(es) · {formatMoney(item.lineTotalArs)}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Badge variant="outline">{item.availability || "sin disponibilidad"}</Badge>
                                      <Badge className={assignmentComplete ? getPaymentTone(true) : getPaymentTone(false)}>
                                        {assignmentComplete
                                          ? "Asignacion completa"
                                          : `Faltan ${Math.max(item.quantity - assignedUnits.length, 0)}`}
                                      </Badge>
                                    </div>
                                  </div>

                                  {item.rowId ? (
                                    <div className="flex w-full flex-col gap-2 lg:max-w-sm">
                                      <Select
                                        value={assignmentDrafts[item.rowId] || undefined}
                                        onValueChange={(value) =>
                                          setAssignmentDrafts((current) => ({
                                            ...current,
                                            [item.rowId as number]: value,
                                          }))
                                        }
                                        disabled={busyAssignmentItemId === item.rowId || assignmentComplete}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Elegi un equipo real del stock" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableUnits.map((unit) => (
                                            <SelectItem key={unit.id} value={String(unit.id)}>
                                              {buildUnitLabel(unit)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        variant="outline"
                                        onClick={() => void handleAssignUnit(item)}
                                        disabled={
                                          busyAssignmentItemId === item.rowId ||
                                          assignmentComplete ||
                                          !assignmentDrafts[item.rowId]
                                        }
                                      >
                                        {busyAssignmentItemId === item.rowId ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : null}
                                        Vincular equipo
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                                      Este item no tiene fila normalizada en `storefront_order_items`, asi que no se puede asignar stock todavia.
                                    </div>
                                  )}
                                </div>

                                <div className="mt-4 space-y-2">
                                  {assignedUnits.length > 0 ? (
                                    assignedUnits.map(({ assignment, unit }) => (
                                      <div
                                        key={assignment.id}
                                        className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div className="space-y-1">
                                          <p className="text-sm font-medium">{buildUnitLabel(unit)}</p>
                                          <p className="text-xs text-muted-foreground">
                                            Asignado {formatDateTime(assignment.assigned_at)} · recibido {formatShortDate(unit.date_received)}
                                          </p>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => void handleUnassignUnit(assignment)}
                                          disabled={busyAssignmentItemId === assignment.order_item_id}
                                        >
                                          Quitar
                                        </Button>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-2xl border border-dashed bg-card p-3 text-sm text-muted-foreground">
                                      Todavia no hay equipos vinculados a este item.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </section>

                  <aside className="space-y-4">
                    <div className="rounded-3xl border bg-background/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Comprobantes</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Guardalos aca como evidencia del pago validado.
                          </p>
                        </div>
                        <Badge variant="outline">
                          {selectedProofUrls.length} archivo{selectedProofUrls.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-muted/30">
                        {uploadingProofOrderId === detailOrder.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Subir comprobante
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            void handleUploadProof(detailOrder, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>

                      {selectedProofUrls.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {selectedProofUrls.map((url, index) => (
                            <div key={`${detailOrder.id}-proof-${url}`} className="relative overflow-hidden rounded-2xl border bg-muted/20">
                              <a href={url} target="_blank" rel="noreferrer" className="block">
                                <img
                                  src={url}
                                  alt={`Comprobante ${index + 1}`}
                                  className="h-32 w-full object-cover"
                                />
                              </a>
                              <button
                                type="button"
                                onClick={() => void handleRemoveProof(detailOrder, url)}
                                className="absolute right-2 top-2 inline-flex rounded-full border bg-background/90 p-1.5 text-foreground shadow-sm transition hover:border-destructive/40 hover:text-destructive"
                                disabled={deletingProofUrl === url}
                              >
                                {deletingProofUrl === url ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
                          <ImageIcon className="mx-auto mb-2 h-5 w-5" />
                          Todavia no hay comprobantes subidos para este pedido.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Vinculo CRM</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="font-medium">Customer ID:</span> {detailOrder.customer_id ?? "—"}</p>
                        <p><span className="font-medium">ManyChat ID:</span> {detailOrder.manychat_id || "—"}</p>
                        <p><span className="font-medium">WhatsApp WA ID:</span> {detailOrder.whatsapp_wa_id || "—"}</p>
                        <p><span className="font-medium">WhatsApp guardado:</span> {detailOrder.whatsapp_phone || "—"}</p>
                      </div>
                    </div>

                    <div className="rounded-3xl border bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedido</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="font-medium">Creado:</span> {formatDateTime(detailOrder.created_at)}</p>
                        <p><span className="font-medium">Canal:</span> {detailOrder.source_channel || "storefront_web"}</p>
                        <p><span className="font-medium">Aliases:</span> {(detailOrder.transfer_aliases ?? []).join(" · ") || "—"}</p>
                        <p><span className="font-medium">Token handoff:</span> {detailOrder.whatsapp_handoff_token ? "Guardado" : "No"}</p>
                      </div>
                    </div>

                    {selectedWhatsAppLink ? (
                      <Button asChild variant="outline" className="w-full justify-center">
                        <a href={selectedWhatsAppLink} target="_blank" rel="noreferrer">
                          <MessageCircle className="h-4 w-4" />
                          Abrir WhatsApp
                        </a>
                      </Button>
                    ) : null}
                  </aside>
                </div>
              </div>

              <DialogFooter className="border-t px-5 py-4 sm:justify-end">
                <Button variant="outline" onClick={() => setDetailOrder(null)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
