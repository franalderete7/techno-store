"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, MessageCircle, Package, Search, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requireAuthenticatedUser } from "@/lib/auth-user";
import { getErrorMessage, isMissingColumnError, isMissingRelationError, isRowLevelSecurityError } from "@/lib/utils";
import type { StorefrontOrder, StorefrontOrderItem, StorefrontOrderUpdate } from "@/types/database";
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
  key: string;
  name: string;
  quantity: number;
  unitPriceArs: number | null;
  lineTotalArs: number | null;
  availability: string | null;
  imageUrl: string | null;
};

type StorefrontOrderSnapshotItem = {
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

  return items
    .map((item, index) => {
      const snapshot = (item ?? {}) as StorefrontOrderSnapshotItem;
      const productKey = String(snapshot.product_key || "").trim();
      const productName = String(snapshot.product_name || "").trim();
      const quantity = Number(snapshot.quantity || 0);
      const unitPriceArs = Number(snapshot.unit_price_ars ?? snapshot.unit_price ?? NaN);
      const lineTotalArs = Number(snapshot.line_total_ars ?? snapshot.line_total ?? NaN);
      const availability = String(snapshot.availability_code ?? snapshot.availability ?? "").trim() || null;
      const imageUrl = String(snapshot.image_url || "").trim() || null;

      if (!productKey && !productName) return null;

      return {
        key: productKey || `snapshot-${index}`,
        name: productName || productKey,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPriceArs: Number.isFinite(unitPriceArs) ? unitPriceArs : null,
        lineTotalArs: Number.isFinite(lineTotalArs) ? lineTotalArs : null,
        availability,
        imageUrl,
      };
    })
    .filter((item): item is OrderItemView => item !== null);
}

function buildItemViews(order: StorefrontOrder, itemRows: StorefrontOrderItem[]) {
  if (itemRows.length > 0) {
    return [...itemRows]
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((item, index) => ({
        key: item.product_key || `item-${item.id}-${index}`,
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
    itemViews.map((item) => item.key).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
  icon: React.ElementType;
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

export function StorefrontOrdersTable() {
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Map<number, StorefrontOrderItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StorefrontOrderStatusFilter>("all");
  const [detailOrder, setDetailOrder] = useState<StorefrontOrder | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

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
          "id,first_name,last_name,email,payment_method,currency,subtotal,item_count,items,transfer_aliases,notes,created_at,address,zip_code,city,province,delivery_instructions,phone,phone_normalized,customer_id,manychat_id,whatsapp_wa_id,whatsapp_phone,source_channel,status,whatsapp_handoff_token,whatsapp_handoff_started_at"
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

      return buildOrderSearchText(order, orderItemViews.get(order.id) ?? []).includes(normalizedSearch);
    });
  }, [orders, orderItemViews, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
    const pendingWhatsApp = orders.filter(
      (order) => normalizeOrderStatus(order.status) === "pending_whatsapp"
    ).length;
    const awaitingProof = orders.filter(
      (order) => normalizeOrderStatus(order.status) === "awaiting_payment_proof"
    ).length;
    const completed = orders.filter(
      (order) => normalizeOrderStatus(order.status) === "completed"
    ).length;

    return {
      totalOrders: orders.length,
      pendingWhatsApp,
      awaitingProof,
      completed,
      totalAmount,
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

      if (updateError) {
        throw updateError;
      }

      setOrders((current) =>
        current.map((currentOrder) =>
          currentOrder.id === order.id
            ? {
                ...currentOrder,
                status: nextStatus,
                whatsapp_handoff_started_at:
                  patch.whatsapp_handoff_started_at ?? currentOrder.whatsapp_handoff_started_at,
              }
            : currentOrder
        )
      );

      setDetailOrder((current) =>
        current && current.id === order.id
          ? {
              ...current,
              status: nextStatus,
              whatsapp_handoff_started_at:
                patch.whatsapp_handoff_started_at ?? current.whatsapp_handoff_started_at,
            }
          : current
      );
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

  const selectedOrderItems = detailOrder ? orderItemViews.get(detailOrder.id) ?? [] : [];
  const selectedWhatsAppLink = detailOrder
    ? getWhatsAppLink(detailOrder.phone || detailOrder.whatsapp_phone)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Storefront</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Pedidos web</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cada pedido queda ligado al checkout del storefront y, cuando el cliente continua por
            WhatsApp, termina vinculado con el contacto del CRM.
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
          helper="Ya entraron al bot y falta el pago."
          icon={Package}
        />
        <OrderStatCard
          label="Facturacion"
          value={formatMoney(stats.totalAmount)}
          helper={`${stats.completed} pedidos ya marcados como completados.`}
          icon={Package}
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
                            {itemViews.map((item) => item.key).slice(0, 2).join(" · ")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">{formatMoney(order.subtotal, order.currency)}</div>
                          <div className="text-sm text-muted-foreground">
                            {String(order.payment_method || "transferencia").replace(/_/g, " ")}
                          </div>
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
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          {detailOrder ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Pedido web #{detailOrder.id} · {getOrderFullName(detailOrder)}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <p><span className="font-medium">Nombre:</span> {getOrderFullName(detailOrder)}</p>
                    <p><span className="font-medium">Email:</span> {detailOrder.email}</p>
                    <p><span className="font-medium">Telefono:</span> {detailOrder.phone || detailOrder.whatsapp_phone || "—"}</p>
                    <p><span className="font-medium">Creado:</span> {formatDateTime(detailOrder.created_at)}</p>
                    <p><span className="font-medium">Canal:</span> {detailOrder.source_channel || "storefront_web"}</p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Identidad CRM</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <p><span className="font-medium">Customer ID:</span> {detailOrder.customer_id ?? "—"}</p>
                    <p><span className="font-medium">ManyChat ID:</span> {detailOrder.manychat_id || "—"}</p>
                    <p><span className="font-medium">WhatsApp WA ID:</span> {detailOrder.whatsapp_wa_id || "—"}</p>
                    <p><span className="font-medium">WhatsApp guardado:</span> {detailOrder.whatsapp_phone || "—"}</p>
                    <p><span className="font-medium">Handoff iniciado:</span> {formatDateTime(detailOrder.whatsapp_handoff_started_at)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4 md:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado y cobro</p>
                      <p className="mt-1 text-lg font-semibold">{formatMoney(detailOrder.subtotal, detailOrder.currency)}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:w-[280px]">
                      <Badge className={getOrderStatusTone(detailOrder.status)}>
                        {getOrderStatusLabel(detailOrder.status)}
                      </Badge>
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
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium">Metodo:</span> {detailOrder.payment_method}</p>
                      <p><span className="font-medium">Moneda:</span> {detailOrder.currency}</p>
                      <p><span className="font-medium">Aliases:</span> {(detailOrder.transfer_aliases ?? []).join(" · ") || "—"}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium">Direccion:</span> {detailOrder.address || "—"}</p>
                      <p><span className="font-medium">Ciudad:</span> {[detailOrder.city, detailOrder.province].filter(Boolean).join(", ") || "—"}</p>
                      <p><span className="font-medium">CP:</span> {detailOrder.zip_code || "—"}</p>
                    </div>
                  </div>

                  {detailOrder.delivery_instructions ? (
                    <div className="mt-4 rounded-xl border bg-background p-3 text-sm">
                      <p className="font-medium">Indicaciones</p>
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {detailOrder.delivery_instructions}
                      </p>
                    </div>
                  ) : null}

                  {detailOrder.notes ? (
                    <div className="mt-4 rounded-xl border bg-background p-3 text-sm">
                      <p className="font-medium">Notas guardadas</p>
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{detailOrder.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Items</p>
                  {selectedOrderItems.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No hay items normalizados para este pedido.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-xl border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>product_key</TableHead>
                            <TableHead>Cantidad</TableHead>
                            <TableHead>Unitario</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Disponibilidad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrderItems.map((item) => (
                            <TableRow key={`${detailOrder.id}-${item.key}`}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{item.key}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{formatMoney(item.unitPriceArs)}</TableCell>
                              <TableCell>{formatMoney(item.lineTotalArs)}</TableCell>
                              <TableCell>{item.availability || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  Token de handoff guardado: {detailOrder.whatsapp_handoff_token ? "si" : "no"}
                </div>
                <div className="flex gap-2">
                  {selectedWhatsAppLink ? (
                    <Button asChild variant="outline">
                      <a href={selectedWhatsAppLink} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-4 w-4" />
                        Abrir WhatsApp
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDetailOrder(null)}>
                    Cerrar
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
