"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
import {
  Plus, Pencil, Trash2, Loader2, Search, Warehouse, PackageCheck,
  Clock, ShoppingBag, Camera, Sparkles, X, ImageIcon,
} from "lucide-react";
import dynamic from "next/dynamic";

const SalesChart = dynamic(() => import("./sales-chart").then((m) => m.SalesChart), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-lg border bg-card">
      <span className="text-sm text-muted-foreground">Loading chart...</span>
    </div>
  ),
});

/* ─── helpers ──────────────────────────────────────────────────────── */

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
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-xl sm:text-2xl font-bold">{value}</p>
    </div>
  );
}

function compressImage(file: File, maxDim = 800, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

const BUCKET = "stock-proof-images";


/* ─── main component ───────────────────────────────────────────────── */

export function StockTable() {
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all");
  const [showChart, setShowChart] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<StockUnit | null>(null);
  const [deleteUnit, setDeleteUnit] = useState<StockUnit | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // AI scan state
  const [scanMode, setScanMode] = useState(false);
  const [scanImages, setScanImages] = useState<{ preview: string; base64: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

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

  const fetchAll = useCallback(async () => {
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
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetScan = () => {
    setScanMode(false);
    setScanImages([]);
    setScanning(false);
    setScanResult(null);
  };

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
      price_sold: "",
      date_received: new Date().toISOString().split("T")[0],
      status: "in_stock",
      notes: "",
    });
    resetScan();
    setScanMode(true);
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
      price_sold: unit.price_sold != null ? String(unit.price_sold) : "",
      date_received: unit.date_received ?? "",
      status: unit.status,
      notes: unit.notes ?? "",
    });
    resetScan();
    setDialogOpen(true);
  };

  const handleAddImage = async (file: File) => {
    if (scanImages.length >= 2) return;
    try {
      const base64 = await compressImage(file);
      setScanImages((prev) => [...prev, { preview: base64, base64 }]);
      setScanResult(null);
    } catch {
      setScanResult("Error: Could not process image. Try a different photo.");
    }
  };

  const handleRemoveImage = (index: number) => {
    setScanImages((prev) => prev.filter((_, i) => i !== index));
    setScanResult(null);
  };

  const handleAiScan = async () => {
    if (scanImages.length === 0) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/groq/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: scanImages.map((img) => img.base64),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setScanResult(`Error: ${data.error || "Failed to analyze"}`);
        return;
      }

      // Auto-fill form with detected data
      // Try to match product by brand + model + specs (before setFormData so we can show "no product" message)
      const searchTerms =
        data.brand || data.model
          ? [data.brand, data.model, data.storage_gb ? `${data.storage_gb}` : ""]
              .filter(Boolean)
              .map((s: string) => s.toLowerCase())
          : [];
      const matchedProduct =
        searchTerms.length > 0
          ? products.find((p) => {
              const name = p.product_name.toLowerCase();
              return searchTerms.every((t: string) => name.includes(t));
            }) ??
            products.find((p) => {
              const name = p.product_name.toLowerCase();
              return searchTerms.slice(0, 2).some((t: string) => name.includes(t));
            })
          : null;

      setFormData((prev) => {
        const updated = { ...prev };
        if (data.imei1) updated.imei1 = data.imei1;
        if (data.imei2) updated.imei2 = data.imei2;
        if (matchedProduct) updated.product_key = matchedProduct.product_key;
        return updated;
      });

      const parts: string[] = [];
      if (data.imei1) parts.push(`IMEI1: ${data.imei1}`);
      if (data.imei2) parts.push(`IMEI2: ${data.imei2}`);
      if (data.brand) parts.push(`Brand: ${data.brand}`);
      if (data.model) parts.push(`Model: ${data.model}`);
      if (data.ram_gb) parts.push(`RAM: ${data.ram_gb}GB`);
      if (data.storage_gb) parts.push(`Storage: ${data.storage_gb}GB`);
      if (data.color) parts.push(`Color: ${data.color}`);
      const baseResult = parts.length > 0 ? parts.join(" | ") : "Could not detect info from images.";
      const noProductMsg =
        (data.brand || data.model) && !matchedProduct
          ? " ⚠️ No product key found for that product! Create the product first in the Products page."
          : "";
      setScanResult(baseResult + noProductMsg);
    } catch {
      setScanResult("Error: Failed to connect to AI service.");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!formData.imei1?.trim()) {
      alert("IMEI1 is required.");
      return;
    }
    if (!formData.product_key) {
      alert("Product is required. Create it in the Products page first if it doesn't exist.");
      return;
    }

    setSaving(true);
    const imei1 = formData.imei1.trim();
    const record: Record<string, unknown> = {
      imei1,
      imei2: formData.imei2?.trim() || null,
      product_key: formData.product_key,
      purchase_id: formData.purchase_id || null,
      supplier_name: formData.supplier_name?.trim() || null,
      cost_unit: formData.cost_unit ? parseFloat(formData.cost_unit) : null,
      cost_currency: formData.cost_currency || "USD",
      price_sold: formData.price_sold ? parseFloat(formData.price_sold) : null,
      date_received: formData.date_received || null,
      status: formData.status || "in_stock",
      notes: formData.notes?.trim() || null,
    };

    try {
      // Upload proof images if user added any
      let proofUrls: string[] = (editingUnit?.proof_image_urls as string[] | null) ?? [];
      if (scanImages.length > 0) {
        const urls: string[] = [];
        for (let i = 0; i < scanImages.length; i++) {
          const file = await dataUrlToFile(scanImages[i].base64, `proof_${i + 1}.jpg`);
          const path = `${imei1}/proof_${i + 1}.jpg`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
          if (error) throw error;
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
          urls.push(data.publicUrl);
        }
        proofUrls = urls;
      }
      record.proof_image_urls = proofUrls;

      if (editingUnit) {
        const { error } = await supabase.from("stock_units").update(record).eq("id", editingUnit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_units").insert(record as unknown as StockUnitInsert);
        if (error) throw error;
      }
      setDialogOpen(false);
      setEditingUnit(null);
      resetScan();
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("valid_imei1")) {
        alert("Invalid IMEI1: must be exactly 15 digits.");
      } else if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("IMEI1 already exists in stock.");
      } else if (msg.includes("Bucket not found") || msg.includes("storage")) {
        alert("Storage error: Run the stock_proof_images.sql migration in Supabase first.");
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

  const fmtPrice = (val: number | null, cur: string) => {
    if (val == null) return "—";
    return `${cur === "ARS" ? "$" : "US$"}${val.toLocaleString("es-AR")}`;
  };

  return (
    <div className="min-h-screen bg-background px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">Stock</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChart((p) => !p)}
              className="hidden sm:flex"
            >
              <ShoppingBag className="mr-1.5 h-4 w-4" />
              {showChart ? "Hide Chart" : "Sales"}
            </Button>
            <Button onClick={openAdd} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Unit</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Total" value={stats.total} icon={Warehouse} />
          <StatCard label="In Stock" value={stats.in_stock} icon={PackageCheck} />
          <StatCard label="Reserved" value={stats.reserved} icon={Clock} />
          <StatCard label="Sold" value={stats.sold} icon={ShoppingBag} />
        </div>

        {/* Mobile chart toggle */}
        <div className="mb-3 sm:hidden">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowChart((p) => !p)}
          >
            <ShoppingBag className="mr-1.5 h-4 w-4" />
            {showChart ? "Hide Sales Chart" : "Show Sales Chart"}
          </Button>
        </div>

        {/* Sales Chart */}
        {showChart && (
          <div className="mb-4 sm:mb-6">
            <SalesChart units={units} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:gap-3">
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
            <SelectTrigger className="w-full sm:w-40">
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

        {/* Data */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground sm:p-12">
            {units.length === 0
              ? 'No stock units yet. Tap "Add" to create one.'
              : "No units match the current filters."}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground sm:mb-3 sm:text-sm">
              Showing {filtered.length} of {units.length} units
            </p>

            {/* Mobile: Cards | Desktop: Table */}
            <div className="sm:hidden space-y-2">
              {filtered.map((unit) => {
                const product = productMap.get(unit.product_key);
                return (
                  <div key={unit.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {product?.product_name ?? unit.product_key}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          IMEI: {unit.imei1}
                        </p>
                      </div>
                      <StatusBadge status={unit.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Cost: {fmtPrice(unit.cost_unit, unit.cost_currency)}</span>
                      {unit.price_sold != null && (
                        <span className="text-emerald-400">
                          Sold: {fmtPrice(unit.price_sold, unit.cost_currency)}
                        </span>
                      )}
                      {unit.supplier_name && <span>{unit.supplier_name}</span>}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => openEdit(unit)}>
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteUnit(unit)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block overflow-auto rounded-lg border" style={{ maxHeight: "calc(100vh - 24rem)" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">IMEI1</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Product</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Cost</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Price Sold</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Supplier</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Purchase</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Received</TableHead>
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
                          {fmtPrice(unit.cost_unit, unit.cost_currency)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {unit.price_sold != null ? (
                            <span className="text-emerald-400 font-medium">
                              {fmtPrice(unit.price_sold, unit.cost_currency)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{unit.supplier_name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{unit.purchase_id ?? "—"}</TableCell>
                        <TableCell>
                          {unit.date_received ? new Date(unit.date_received).toLocaleDateString() : "—"}
                        </TableCell>
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

      {/* ─── Add/Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingUnit(null); resetScan(); } }}>
        <DialogContent className="max-h-[95vh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit Unit" : "Add Stock Unit"}</DialogTitle>
          </DialogHeader>

          {/* AI Scan Section (only for new units) */}
          {!editingUnit && (
            <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">AI Auto-Fill</span>
                </div>
                {scanMode && scanImages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={resetScan}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAddImage(f);
                  e.target.value = "";
                }}
              />

              {scanMode && (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Upload 1 or 2 photos showing IMEI and/or model info. One photo with everything visible is enough.
                  </p>

                  {/* Image previews */}
                  <div className={`grid gap-3 ${scanImages.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {scanImages.map((img, i) => (
                      <div key={i} className="relative">
                        <img
                          src={img.preview}
                          alt={`Photo ${i + 1}`}
                          className="h-36 w-full rounded-lg border object-cover sm:h-44"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          Photo {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Add photo button */}
                  {scanImages.length < 2 && (
                    <button
                      type="button"
                      onClick={() => scanInputRef.current?.click()}
                      className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50 active:scale-[0.98] ${
                        scanImages.length === 0 ? "mt-0 h-36 sm:h-44" : "mt-3 h-24 sm:h-28"
                      }`}
                    >
                      <div className="rounded-full bg-primary/10 p-3">
                        <Camera className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-sm font-medium">
                        {scanImages.length === 0 ? "Take Photo" : "Add 2nd Photo (optional)"}
                      </span>
                      <span className="text-xs text-muted-foreground">Tap to take photo or upload</span>
                    </button>
                  )}

                  {/* Analyze button */}
                  {scanImages.length > 0 && (
                    <Button
                      className="mt-3 w-full gap-2"
                      onClick={handleAiScan}
                      disabled={scanning}
                    >
                      {scanning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing {scanImages.length === 1 ? "photo" : "photos"}...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Analyze with AI
                        </>
                      )}
                    </Button>
                  )}

                  {scanResult && (
                    <div className={`mt-2 rounded-md p-2 text-xs ${
                      scanResult.startsWith("Error")
                        ? "bg-destructive/10 text-destructive"
                        : scanResult.includes("No product key found")
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {scanResult}
                    </div>
                  )}
                </>
              )}

              {!scanMode && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setScanMode(true)}
                >
                  <ImageIcon className="h-4 w-4" />
                  Scan with Photos
                </Button>
              )}

              {/* Existing proof images (when editing) */}
              {editingUnit?.proof_image_urls && editingUnit.proof_image_urls.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Proof images (IMEI verification)</Label>
                  <div className="flex flex-wrap gap-2">
                    {editingUnit.proof_image_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-lg border"
                      >
                        <img
                          src={url}
                          alt={`Proof ${i + 1}`}
                          className="h-24 w-24 object-cover sm:h-28 sm:w-28"
                        />
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Compare IMEI in these images to the saved value.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className="grid gap-3 sm:gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">IMEI1 *</Label>
                <Input
                  value={formData.imei1 ?? ""}
                  onChange={(e) => updateForm("imei1", e.target.value)}
                  placeholder="354276621670502"
                  maxLength={15}
                  inputMode="numeric"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">IMEI2</Label>
                <Input
                  value={formData.imei2 ?? ""}
                  onChange={(e) => updateForm("imei2", e.target.value)}
                  placeholder="Optional"
                  maxLength={15}
                  inputMode="numeric"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Product *</Label>
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
              {!formData.product_key && (
                <p className="text-xs text-muted-foreground">
                  Create the product in Products first if it doesn&apos;t exist.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Purchase</Label>
                <Select value={formData.purchase_id ?? ""} onValueChange={(v) => updateForm("purchase_id", v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none__">None</SelectItem>
                    {purchases.map((p) => (
                      <SelectItem key={p.purchase_id} value={p.purchase_id}>
                        {p.purchase_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Supplier</Label>
                <Input
                  value={formData.supplier_name ?? ""}
                  onChange={(e) => updateForm("supplier_name", e.target.value)}
                  placeholder="Supplier"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Cost</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={formData.cost_unit ?? ""}
                  onChange={(e) => updateForm("cost_unit", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Currency</Label>
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
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label className="text-xs sm:text-sm">Price Sold</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={formData.price_sold ?? ""}
                  onChange={(e) => updateForm("price_sold", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Date Received</Label>
                <Input
                  type="date"
                  value={formData.date_received ?? ""}
                  onChange={(e) => updateForm("date_received", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Status</Label>
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
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Notes</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formData.notes ?? ""}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <DialogFooter className="mt-2 flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setDialogOpen(false); setEditingUnit(null); resetScan(); }}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingUnit ? "Save" : "Add Unit"}
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
