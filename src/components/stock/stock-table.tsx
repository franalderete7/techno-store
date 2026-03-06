"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/database";
import type { StockUnit, StockUnitInsert, StockStatus, Purchase } from "@/types/stock";
import { STOCK_STATUS_OPTIONS } from "@/types/stock";
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
  Plus, Pencil, Trash2, Loader2, Search, Warehouse, PackageCheck, Clock, ShoppingBag,
} from "lucide-react";

function StatusBadge({ status }: { status: StockStatus }) {
  const opt = STOCK_STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${opt?.color ?? ""}`}>
      {opt?.label ?? status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function StockTable() {
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<StockUnit | null>(null);
  const [deleteUnit, setDeleteUnit] = useState<StockUnit | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.product_key, p])),
    [products]
  );

  const stats = useMemo(() => {
    const s = { total: units.length, in_stock: 0, reserved: 0, sold: 0 };
    units.forEach((u) => {
      if (u.status === "in_stock") s.in_stock++;
      else if (u.status === "reserved") s.reserved++;
      else if (u.status === "sold") s.sold++;
    });
    return s;
  }, [units]);

  const filtered = useMemo(() => {
    let result = units;
    if (statusFilter !== "all") {
      result = result.filter((u) => u.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((u) => {
        const product = productMap.get(u.product_key);
        return (
          u.imei1.includes(q) ||
          u.product_key.toLowerCase().includes(q) ||
          (product?.product_name ?? "").toLowerCase().includes(q) ||
          (u.supplier_name ?? "").toLowerCase().includes(q) ||
          (u.notes ?? "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [units, statusFilter, searchQuery, productMap]);

  const fetchAll = async () => {
    setLoading(true);
    const [stockRes, prodRes, purchRes] = await Promise.all([
      supabase.from("stock_units").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*").order("product_name"),
      supabase.from("purchases").select("*").order("date_purchase", { ascending: false }),
    ]);
    setUnits((stockRes.data as StockUnit[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);
    setPurchases((purchRes.data as Purchase[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditingUnit(null);
    setFormData({
      imei1: "",
      imei2: "",
      product_key: "",
      purchase_id: "",
      supplier_name: "",
      cost_unit: "",
      cost_currency: "USD",
      date_received: new Date().toISOString().split("T")[0],
      status: "in_stock",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (unit: StockUnit) => {
    setEditingUnit(unit);
    setFormData({
      imei1: unit.imei1,
      imei2: unit.imei2 ?? "",
      product_key: unit.product_key,
      purchase_id: unit.purchase_id ?? "",
      supplier_name: unit.supplier_name ?? "",
      cost_unit: unit.cost_unit != null ? String(unit.cost_unit) : "",
      cost_currency: unit.cost_currency ?? "USD",
      date_received: unit.date_received ?? "",
      status: unit.status,
      notes: unit.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.imei1?.trim() || !formData.product_key) {
      alert("IMEI1 and Product are required.");
      return;
    }

    setSaving(true);
    const record: Record<string, unknown> = {
      imei1: formData.imei1.trim(),
      imei2: formData.imei2?.trim() || null,
      product_key: formData.product_key,
      purchase_id: formData.purchase_id || null,
      supplier_name: formData.supplier_name?.trim() || null,
      cost_unit: formData.cost_unit ? parseFloat(formData.cost_unit) : null,
      cost_currency: formData.cost_currency || "USD",
      date_received: formData.date_received || null,
      status: formData.status || "in_stock",
      notes: formData.notes?.trim() || null,
    };

    try {
      if (editingUnit) {
        const { error } = await supabase
          .from("stock_units")
          .update(record)
          .eq("id", editingUnit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_units").insert(record as unknown as StockUnitInsert);
        if (error) throw error;
      }
      setDialogOpen(false);
      setEditingUnit(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("valid_imei1")) {
        alert("Invalid IMEI1: must be exactly 15 digits.");
      } else if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("IMEI1 already exists in stock.");
      } else {
        alert("Error saving: " + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUnit) return;
    setSaving(true);
    const { error } = await supabase.from("stock_units").delete().eq("id", deleteUnit.id);
    setSaving(false);
    if (error) {
      alert("Error deleting: " + error.message);
      return;
    }
    setDeleteUnit(null);
    fetchAll();
  };

  const updateForm = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Stock</h1>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Unit
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Units" value={stats.total} icon={Warehouse} />
          <StatCard label="In Stock" value={stats.in_stock} icon={PackageCheck} />
          <StatCard label="Reserved" value={stats.reserved} icon={Clock} />
          <StatCard label="Sold" value={stats.sold} icon={ShoppingBag} />
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search IMEI, product, supplier..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StockStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STOCK_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {units.length === 0 ? 'No stock units yet. Click "Add Unit" to create one.' : "No units match the current filters."}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Showing {filtered.length} of {units.length} units.
            </p>
            <div className="overflow-auto rounded-lg border" style={{ maxHeight: "calc(100vh - 22rem)" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">IMEI1</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Product</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Cost</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Supplier</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Purchase</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Received</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Notes</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((unit) => {
                    const product = productMap.get(unit.product_key);
                    return (
                      <TableRow key={unit.id}>
                        <TableCell className="font-mono text-xs">{unit.imei1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{product?.product_name ?? unit.product_key}</p>
                            <p className="text-xs text-muted-foreground">{unit.product_key}</p>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={unit.status} /></TableCell>
                        <TableCell className="whitespace-nowrap">
                          {unit.cost_unit != null
                            ? `${unit.cost_currency === "ARS" ? "$" : "US$"}${unit.cost_unit.toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell>{unit.supplier_name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{unit.purchase_id ?? "—"}</TableCell>
                        <TableCell>{unit.date_received ? new Date(unit.date_received).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{unit.notes ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(unit)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteUnit(unit)}
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
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingUnit(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit Unit" : "Add Stock Unit"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IMEI1 *</Label>
                <Input
                  value={formData.imei1 ?? ""}
                  onChange={(e) => updateForm("imei1", e.target.value)}
                  placeholder="354276621670502"
                  maxLength={15}
                />
                <p className="text-xs text-muted-foreground">Exactly 15 digits</p>
              </div>
              <div className="space-y-2">
                <Label>IMEI2</Label>
                <Input
                  value={formData.imei2 ?? ""}
                  onChange={(e) => updateForm("imei2", e.target.value)}
                  placeholder="Optional"
                  maxLength={15}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={formData.product_key ?? ""} onValueChange={(v) => updateForm("product_key", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {products.map((p) => (
                    <SelectItem key={p.product_key} value={p.product_key}>
                      {p.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase</Label>
                <Select value={formData.purchase_id ?? ""} onValueChange={(v) => updateForm("purchase_id", v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none__">None</SelectItem>
                    {purchases.map((p) => (
                      <SelectItem key={p.purchase_id} value={p.purchase_id}>
                        {p.purchase_id} — {p.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={formData.supplier_name ?? ""}
                  onChange={(e) => updateForm("supplier_name", e.target.value)}
                  placeholder="Supplier name"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  type="number"
                  value={formData.cost_unit ?? ""}
                  onChange={(e) => updateForm("cost_unit", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formData.cost_currency ?? "USD"} onValueChange={(v) => updateForm("cost_currency", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Received</Label>
                <Input
                  type="date"
                  value={formData.date_received ?? ""}
                  onChange={(e) => updateForm("date_received", e.target.value)}
                />
              </div>
            </div>

            {editingUnit && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status ?? "in_stock"} onValueChange={(v) => updateForm("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingUnit(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingUnit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUnit} onOpenChange={(o) => !o && setDeleteUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Delete unit with IMEI {deleteUnit?.imei1}? This cannot be undone.
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
