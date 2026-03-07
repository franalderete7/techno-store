"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/database";
import type { Reservation, ReservationInsert, ReservationStatus, PaymentMethod } from "@/types/stock";
import {
  RESERVATION_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS,
} from "@/types/stock";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Pencil, Trash2, Loader2, Search, CheckCircle, XCircle, Truck, DollarSign,
} from "lucide-react";

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const opt = RESERVATION_STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${opt?.color ?? ""}`}>
      {opt?.label ?? status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-xl sm:text-2xl font-bold">{value}</p>
    </div>
  );
}

export function ReservationsTable() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockCounts, setStockCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "active" | "all">("active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [deleteReservation, setDeleteReservation] = useState<Reservation | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.product_key, p])),
    [products]
  );

  const stats = useMemo(() => {
    const s = { active: 0, interested: 0, deposit_paid: 0, delivered: 0 };
    reservations.forEach((r) => {
      if (r.status !== "cancelled" && r.status !== "delivered") s.active++;
      if (r.status === "interested" || r.status === "pending_deposit") s.interested++;
      if (r.status === "deposit_paid") s.deposit_paid++;
      if (r.status === "delivered") s.delivered++;
    });
    return s;
  }, [reservations]);

  const filtered = useMemo(() => {
    let result = reservations;
    if (statusFilter === "active") {
      result = result.filter((r) => r.status !== "cancelled" && r.status !== "delivered");
    } else if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const product = productMap.get(r.product_key);
        return (
          (r.customer_name ?? "").toLowerCase().includes(q) ||
          (r.customer_phone ?? "").includes(q) ||
          r.product_key.toLowerCase().includes(q) ||
          (product?.product_name ?? "").toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [reservations, statusFilter, searchQuery, productMap]);

  const fetchAll = async () => {
    setLoading(true);
    const [resRes, prodRes, stockRes] = await Promise.all([
      supabase.from("reservations").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*").order("product_name"),
      supabase.from("stock_units").select("product_key, status"),
    ]);
    setReservations((resRes.data as Reservation[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);

    const counts = new Map<string, number>();
    ((stockRes.data as { product_key: string; status: string }[]) ?? []).forEach((u) => {
      if (u.status === "in_stock") {
        counts.set(u.product_key, (counts.get(u.product_key) ?? 0) + 1);
      }
    });
    setStockCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditingReservation(null);
    setFormData({
      customer_name: "",
      customer_phone: "",
      manychat_id: "",
      product_key: "",
      requested_color: "",
      status: "interested",
      deposit_amount: "",
      deposit_date: "",
      deposit_method: "",
      balance_due: "",
      source: "whatsapp",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (reservation: Reservation) => {
    setEditingReservation(reservation);
    setFormData({
      customer_name: reservation.customer_name ?? "",
      customer_phone: reservation.customer_phone ?? "",
      manychat_id: reservation.manychat_id ?? "",
      product_key: reservation.product_key,
      requested_color: reservation.requested_color ?? "",
      status: reservation.status,
      deposit_amount: reservation.deposit_amount != null ? String(reservation.deposit_amount) : "",
      deposit_date: reservation.deposit_date ?? "",
      deposit_method: reservation.deposit_method ?? "",
      balance_due: reservation.balance_due != null ? String(reservation.balance_due) : "",
      source: reservation.source,
      notes: reservation.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.product_key) {
      alert("Product is required.");
      return;
    }
    setSaving(true);
    const record: Record<string, unknown> = {
      customer_name: formData.customer_name?.trim() || null,
      customer_phone: formData.customer_phone?.trim() || null,
      manychat_id: formData.manychat_id?.trim() || null,
      product_key: formData.product_key,
      requested_color: formData.requested_color?.trim() || null,
      status: formData.status || "interested",
      deposit_amount: formData.deposit_amount ? parseFloat(formData.deposit_amount) : null,
      deposit_date: formData.deposit_date || null,
      deposit_method: formData.deposit_method || null,
      balance_due: formData.balance_due ? parseFloat(formData.balance_due) : null,
      source: formData.source || "whatsapp",
      notes: formData.notes?.trim() || null,
      last_contact_at: new Date().toISOString(),
    };

    try {
      if (editingReservation) {
        const { error } = await supabase.from("reservations").update(record).eq("id", editingReservation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reservations").insert(record as unknown as ReservationInsert);
        if (error) throw error;
      }
      setDialogOpen(false);
      setEditingReservation(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Error saving: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReservation) return;
    setSaving(true);
    const { error } = await supabase.from("reservations").delete().eq("id", deleteReservation.id);
    setSaving(false);
    if (error) {
      alert("Error deleting: " + error.message);
      return;
    }
    setDeleteReservation(null);
    fetchAll();
  };

  const quickUpdateStatus = async (reservation: Reservation, newStatus: ReservationStatus) => {
    const { error } = await supabase
      .from("reservations")
      .update({ status: newStatus, last_contact_at: new Date().toISOString() })
      .eq("id", reservation.id);
    if (error) {
      alert("Error updating: " + error.message);
      return;
    }
    fetchAll();
  };

  const updateForm = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-background px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">Reservations</h1>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Reservation</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Active" value={stats.active} icon={CheckCircle} />
          <StatCard label="Interested" value={stats.interested} icon={Search} />
          <StatCard label="Deposit Paid" value={stats.deposit_paid} icon={DollarSign} />
          <StatCard label="Delivered" value={stats.delivered} icon={Truck} />
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, product..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReservationStatus | "active" | "all")}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Active" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
              {RESERVATION_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground sm:p-12">
            {reservations.length === 0 ? 'No reservations yet. Tap "New" to create one.' : "No reservations match the current filters."}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground sm:mb-3 sm:text-sm">
              Showing {filtered.length} of {reservations.length} reservations
            </p>

            {/* Mobile: Cards */}
            <div className="space-y-2 sm:hidden">
              {filtered.map((r) => {
                const product = productMap.get(r.product_key);
                const available = stockCounts.get(r.product_key) ?? 0;
                return (
                  <div key={r.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.customer_name || "Unknown"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {product?.product_name ?? r.product_key}
                        </p>
                      </div>
                      <ReservationStatusBadge status={r.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {r.customer_phone && <span>{r.customer_phone}</span>}
                      {r.deposit_amount != null && (
                        <span className="text-emerald-400">Deposit: ${r.deposit_amount.toLocaleString()}</span>
                      )}
                      <Badge variant={available > 0 ? "default" : "secondary"} className="text-[10px]">
                        {available} in stock
                      </Badge>
                      <span className="capitalize">{r.source}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {r.status !== "cancelled" && r.status !== "delivered" && (
                        <>
                          {(r.status === "interested" || r.status === "pending_deposit") && (
                            <Button variant="outline" size="sm" className="h-8" onClick={() => quickUpdateStatus(r, "deposit_paid")}>
                              <DollarSign className="h-3 w-3 text-emerald-400" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => quickUpdateStatus(r, "delivered")}>
                            <Truck className="h-3 w-3 text-purple-400" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => quickUpdateStatus(r, "cancelled")}>
                            <XCircle className="h-3 w-3 text-red-400" />
                          </Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => openEdit(r)}>
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteReservation(r)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden overflow-auto rounded-lg border sm:block" style={{ maxHeight: "calc(100vh - 22rem)" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">Customer</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Phone</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Product</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Deposit</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Stock</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Source</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Created</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const product = productMap.get(r.product_key);
                    const available = stockCounts.get(r.product_key) ?? 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.customer_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.customer_phone || "—"}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{product?.product_name ?? r.product_key}</p>
                            {r.requested_color && (
                              <p className="text-xs text-muted-foreground">Color: {r.requested_color}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><ReservationStatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          {r.deposit_amount != null
                            ? `$${r.deposit_amount.toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={available > 0 ? "default" : "secondary"}>
                            {available} available
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs capitalize">{r.source}</TableCell>
                        <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {r.status === "interested" && (
                              <Button
                                variant="ghost" size="icon" title="Mark deposit paid"
                                onClick={() => quickUpdateStatus(r, "deposit_paid")}
                              >
                                <DollarSign className="h-4 w-4 text-emerald-400" />
                              </Button>
                            )}
                            {r.status === "pending_deposit" && (
                              <Button
                                variant="ghost" size="icon" title="Mark deposit paid"
                                onClick={() => quickUpdateStatus(r, "deposit_paid")}
                              >
                                <DollarSign className="h-4 w-4 text-emerald-400" />
                              </Button>
                            )}
                            {(r.status === "deposit_paid" || r.status === "interested" || r.status === "pending_deposit") && (
                              <Button
                                variant="ghost" size="icon" title="Mark delivered"
                                onClick={() => quickUpdateStatus(r, "delivered")}
                              >
                                <Truck className="h-4 w-4 text-purple-400" />
                              </Button>
                            )}
                            {r.status !== "cancelled" && r.status !== "delivered" && (
                              <Button
                                variant="ghost" size="icon" title="Cancel"
                                onClick={() => quickUpdateStatus(r, "cancelled")}
                              >
                                <XCircle className="h-4 w-4 text-red-400" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteReservation(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingReservation(null); } }}>
        <DialogContent className="max-h-[95vh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingReservation ? "Edit Reservation" : "New Reservation"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input
                  value={formData.customer_name ?? ""}
                  onChange={(e) => updateForm("customer_name", e.target.value)}
                  placeholder="Juan Perez"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.customer_phone ?? ""}
                  onChange={(e) => updateForm("customer_phone", e.target.value)}
                  placeholder="5493871234567"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>ManyChat ID</Label>
              <Input
                value={formData.manychat_id ?? ""}
                onChange={(e) => updateForm("manychat_id", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <Label>Product *</Label>
                <Select value={formData.product_key ?? ""} onValueChange={(v) => updateForm("product_key", v)}>
                  <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {products.map((p) => (
                      <SelectItem key={p.product_key} value={p.product_key}>
                        {p.product_name}
                        {(stockCounts.get(p.product_key) ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({stockCounts.get(p.product_key)} in stock)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  value={formData.requested_color ?? ""}
                  onChange={(e) => updateForm("requested_color", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status ?? "interested"} onValueChange={(v) => updateForm("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESERVATION_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={formData.source ?? "whatsapp"} onValueChange={(v) => updateForm("source", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="n8n">n8n (Bot)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Deposit Amount</Label>
                <Input
                  type="number"
                  value={formData.deposit_amount ?? ""}
                  onChange={(e) => updateForm("deposit_amount", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Deposit Date</Label>
                <Input
                  type="date"
                  value={formData.deposit_date ?? ""}
                  onChange={(e) => updateForm("deposit_date", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Deposit Method</Label>
                <Select value={formData.deposit_method ?? ""} onValueChange={(v) => updateForm("deposit_method", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Balance Due</Label>
              <Input
                type="number"
                value={formData.balance_due ?? ""}
                onChange={(e) => updateForm("balance_due", e.target.value)}
                placeholder="Remaining amount"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.notes ?? ""}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingReservation(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingReservation ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReservation} onOpenChange={(o) => !o && setDeleteReservation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reservation</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this reservation for {deleteReservation?.customer_name ?? "this customer"}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
