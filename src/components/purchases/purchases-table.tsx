"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/database";
import type {
  Purchase, PurchaseInsert, StockUnit, StockUnitInsert, PaymentMethod, PaymentStatus,
} from "@/types/stock";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS, STOCK_STATUS_OPTIONS } from "@/types/stock";
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
import { Plus, Pencil, Trash2, Loader2, Search, Eye, PackagePlus } from "lucide-react";

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const colors: Record<PaymentStatus, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    partial: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  const labels: Record<PaymentStatus, string> = { pending: "Pending", paid: "Paid", partial: "Partial" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

function generatePurchaseId(existing: Purchase[]): string {
  const year = new Date().getFullYear();
  const prefix = `PUR-${year}-`;
  let maxNum = 0;
  existing.forEach((p) => {
    if (p.purchase_id.startsWith(prefix)) {
      const num = parseInt(p.purchase_id.slice(prefix.length), 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
}

export function PurchasesTable() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [unitCounts, setUnitCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [deletePurchase, setDeletePurchase] = useState<Purchase | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Detail view
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
  const [detailUnits, setDetailUnits] = useState<StockUnit[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add unit to purchase
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [addUnitPurchase, setAddUnitPurchase] = useState<Purchase | null>(null);
  const [unitForm, setUnitForm] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return purchases;
    const q = searchQuery.toLowerCase();
    return purchases.filter(
      (p) =>
        p.purchase_id.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
    );
  }, [purchases, searchQuery]);

  const fetchAll = async () => {
    setLoading(true);
    const [purchRes, prodRes, countRes] = await Promise.all([
      supabase.from("purchases").select("*").order("date_purchase", { ascending: false }),
      supabase.from("products").select("*").order("product_name"),
      supabase.from("stock_units").select("purchase_id"),
    ]);
    setPurchases((purchRes.data as Purchase[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);

    const counts = new Map<string, number>();
    ((countRes.data as { purchase_id: string | null }[]) ?? []).forEach((u) => {
      if (u.purchase_id) counts.set(u.purchase_id, (counts.get(u.purchase_id) ?? 0) + 1);
    });
    setUnitCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditingPurchase(null);
    setFormData({
      purchase_id: generatePurchaseId(purchases),
      date_purchase: new Date().toISOString().split("T")[0],
      supplier_name: "",
      payment_method: "transferencia",
      payment_status: "pending",
      total_cost: "",
      currency: "USD",
      notes: "",
      created_by: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      purchase_id: purchase.purchase_id,
      date_purchase: purchase.date_purchase,
      supplier_name: purchase.supplier_name,
      payment_method: purchase.payment_method,
      payment_status: purchase.payment_status,
      total_cost: purchase.total_cost != null ? String(purchase.total_cost) : "",
      currency: purchase.currency,
      notes: purchase.notes ?? "",
      created_by: purchase.created_by ?? "",
    });
    setDialogOpen(true);
  };

  const openDetail = async (purchase: Purchase) => {
    setDetailPurchase(purchase);
    setLoadingDetail(true);
    const { data } = await supabase
      .from("stock_units")
      .select("*")
      .eq("purchase_id", purchase.purchase_id)
      .order("created_at", { ascending: false });
    setDetailUnits((data as StockUnit[]) ?? []);
    setLoadingDetail(false);
  };

  const openAddUnit = (purchase: Purchase) => {
    setAddUnitPurchase(purchase);
    setUnitForm({
      imei1: "",
      imei2: "",
      product_key: "",
      cost_unit: "",
      cost_currency: purchase.currency ?? "USD",
      notes: "",
    });
    setAddUnitOpen(true);
  };

  const handleSave = async () => {
    if (!formData.purchase_id?.trim() || !formData.supplier_name?.trim()) {
      alert("Purchase ID and Supplier are required.");
      return;
    }
    setSaving(true);
    const record: Record<string, unknown> = {
      purchase_id: formData.purchase_id.trim(),
      date_purchase: formData.date_purchase || new Date().toISOString().split("T")[0],
      supplier_name: formData.supplier_name.trim(),
      payment_method: formData.payment_method || "transferencia",
      payment_status: formData.payment_status || "pending",
      total_cost: formData.total_cost ? parseFloat(formData.total_cost) : null,
      currency: formData.currency || "USD",
      notes: formData.notes?.trim() || null,
      created_by: formData.created_by?.trim() || null,
    };

    try {
      if (editingPurchase) {
        const { error } = await supabase.from("purchases").update(record).eq("id", editingPurchase.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("purchases").insert(record as unknown as PurchaseInsert);
        if (error) throw error;
      }
      setDialogOpen(false);
      setEditingPurchase(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("Purchase ID already exists.");
      } else {
        alert("Error saving: " + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePurchase) return;
    setSaving(true);
    const { error } = await supabase.from("purchases").delete().eq("id", deletePurchase.id);
    setSaving(false);
    if (error) {
      alert("Error deleting: " + error.message);
      return;
    }
    setDeletePurchase(null);
    fetchAll();
  };

  const handleAddUnit = async () => {
    if (!unitForm.imei1?.trim() || !unitForm.product_key || !addUnitPurchase) {
      alert("IMEI1 and Product are required.");
      return;
    }
    setSaving(true);
    const record: StockUnitInsert = {
      imei1: unitForm.imei1.trim(),
      imei2: unitForm.imei2?.trim() || null,
      product_key: unitForm.product_key,
      purchase_id: addUnitPurchase.purchase_id,
      supplier_name: addUnitPurchase.supplier_name,
      cost_unit: unitForm.cost_unit ? parseFloat(unitForm.cost_unit) : null,
      cost_currency: unitForm.cost_currency || "USD",
      date_received: addUnitPurchase.date_purchase,
      status: "in_stock",
      notes: unitForm.notes?.trim() || null,
    };

    try {
      const { error } = await supabase.from("stock_units").insert(record);
      if (error) throw error;
      setAddUnitOpen(false);
      setAddUnitPurchase(null);
      fetchAll();
      if (detailPurchase?.purchase_id === addUnitPurchase.purchase_id) {
        openDetail(addUnitPurchase);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("valid_imei1")) {
        alert("Invalid IMEI1: must be exactly 15 digits.");
      } else if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("IMEI1 already exists in stock.");
      } else {
        alert("Error adding unit: " + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));
  const updateUnitForm = (key: string, value: string) => setUnitForm((prev) => ({ ...prev, [key]: value }));

  const productMap = useMemo(() => new Map(products.map((p) => [p.product_key, p])), [products]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Purchases</h1>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            New Purchase
          </Button>
        </div>

        <div className="mb-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search purchase ID, supplier..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {purchases.length === 0 ? 'No purchases yet. Click "New Purchase" to create one.' : "No purchases match the search."}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Showing {filtered.length} of {purchases.length} purchases.
            </p>
            <div className="overflow-auto rounded-lg border" style={{ maxHeight: "calc(100vh - 16rem)" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">Purchase ID</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Date</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Supplier</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Payment</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Total</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Units</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Notes</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.purchase_id}</TableCell>
                      <TableCell>{new Date(p.date_purchase).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{p.supplier_name}</TableCell>
                      <TableCell className="text-xs capitalize">{p.payment_method.replace(/_/g, " ")}</TableCell>
                      <TableCell><PaymentStatusBadge status={p.payment_status} /></TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.total_cost != null
                          ? `${p.currency === "ARS" ? "$" : "US$"}${p.total_cost.toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{unitCounts.get(p.purchase_id) ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">{p.notes ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="View units" onClick={() => openDetail(p)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Add unit" onClick={() => openAddUnit(p)}>
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletePurchase(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingPurchase(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingPurchase ? "Edit Purchase" : "New Purchase"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase ID *</Label>
                <Input
                  value={formData.purchase_id ?? ""}
                  onChange={(e) => updateForm("purchase_id", e.target.value)}
                  placeholder="PUR-2026-00001"
                  disabled={!!editingPurchase}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date_purchase ?? ""}
                  onChange={(e) => updateForm("date_purchase", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Input
                value={formData.supplier_name ?? ""}
                onChange={(e) => updateForm("supplier_name", e.target.value)}
                placeholder="Supplier name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={formData.payment_method ?? "transferencia"} onValueChange={(v) => updateForm("payment_method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={formData.payment_status ?? "pending"} onValueChange={(v) => updateForm("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Cost</Label>
                <Input
                  type="number"
                  value={formData.total_cost ?? ""}
                  onChange={(e) => updateForm("total_cost", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formData.currency ?? "USD"} onValueChange={(v) => updateForm("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Created By</Label>
              <Input
                value={formData.created_by ?? ""}
                onChange={(e) => updateForm("created_by", e.target.value)}
                placeholder="Your name"
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
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingPurchase(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPurchase ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPurchase} onOpenChange={(open) => { if (!open) setDetailPurchase(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Purchase {detailPurchase?.purchase_id} — {detailPurchase?.supplier_name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {loadingDetail ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detailUnits.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">No units in this purchase yet.</p>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IMEI1</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailUnits.map((u) => {
                      const prod = productMap.get(u.product_key);
                      const statusOpt = STOCK_STATUS_OPTIONS.find((o) => o.value === u.status);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs">{u.imei1}</TableCell>
                          <TableCell>{prod?.product_name ?? u.product_key}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusOpt?.color ?? ""}`}>
                              {statusOpt?.label ?? u.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {u.cost_unit != null
                              ? `${u.cost_currency === "ARS" ? "$" : "US$"}${u.cost_unit.toLocaleString()}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => detailPurchase && openAddUnit(detailPurchase)}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
            <Button variant="outline" onClick={() => setDetailPurchase(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Unit to Purchase Dialog */}
      <Dialog open={addUnitOpen} onOpenChange={(open) => { if (!open) { setAddUnitOpen(false); setAddUnitPurchase(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unit to {addUnitPurchase?.purchase_id}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IMEI1 *</Label>
                <Input
                  value={unitForm.imei1 ?? ""}
                  onChange={(e) => updateUnitForm("imei1", e.target.value)}
                  placeholder="15 digits"
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label>IMEI2</Label>
                <Input
                  value={unitForm.imei2 ?? ""}
                  onChange={(e) => updateUnitForm("imei2", e.target.value)}
                  placeholder="Optional"
                  maxLength={15}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={unitForm.product_key ?? ""} onValueChange={(v) => updateUnitForm("product_key", v)}>
                <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {products.map((p) => (
                    <SelectItem key={p.product_key} value={p.product_key}>{p.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  type="number"
                  value={unitForm.cost_unit ?? ""}
                  onChange={(e) => updateUnitForm("cost_unit", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={unitForm.cost_currency ?? "USD"} onValueChange={(v) => updateUnitForm("cost_currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={unitForm.notes ?? ""}
                onChange={(e) => updateUnitForm("notes", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddUnitOpen(false); setAddUnitPurchase(null); }}>Cancel</Button>
            <Button onClick={handleAddUnit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePurchase} onOpenChange={(o) => !o && setDeletePurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase</AlertDialogTitle>
            <AlertDialogDescription>
              Delete purchase {deletePurchase?.purchase_id}? Units linked to it will keep their data but lose the purchase reference.
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
