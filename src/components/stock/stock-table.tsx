"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  getErrorMessage,
  isMissingColumnError,
  isMissingRelationError,
  isRowLevelSecurityError,
  parseOptionalNumber,
  parseOptionalText,
} from "@/lib/utils";
import type { Product } from "@/types/database";
import type {
  Financier,
  Purchase,
  PurchaseFinancier,
  SaleCurrency,
  StockStatus,
  StockUnit,
  StockUnitInsert,
} from "@/types/stock";
import { STOCK_STATUS_OPTIONS } from "@/types/stock";
import {
  applyProductVariantToStockDraft,
  formatCatalogVariantLabel,
  validateStockVariantAgainstProduct,
} from "@/lib/product-variants";
import {
  DEFAULT_USD_RATE,
  buildRealizedUnitSale,
  getFinancierOptions,
  normalizeSaleCurrency,
  resolveCostAmountArs,
  resolveCostAmountUsd,
  roundMoney,
} from "@/lib/accounting";
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
    <div className="flex h-[28rem] items-center justify-center rounded-2xl border bg-card">
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

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function formatPurchaseDate(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPurchaseOption(purchase: Purchase) {
  return `${purchase.purchase_id} · ${purchase.supplier_name} · ${formatPurchaseDate(purchase.date_purchase)}`;
}

function formatUsdMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return `US$${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function formatArsMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return `$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function MoneyPair({
  usd,
  ars,
  highlight,
}: {
  usd: number | null | undefined;
  ars: number | null | undefined;
  highlight?: "positive" | "negative" | "neutral";
}) {
  const tone =
    highlight === "positive"
      ? "text-emerald-500"
      : highlight === "negative"
        ? "text-red-500"
        : "text-foreground";

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-wide text-muted-foreground">USD</span>
        <span className={`font-medium tabular-nums ${tone}`}>{formatUsdMoney(usd)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-wide text-muted-foreground">ARS</span>
        <span className={`font-medium tabular-nums ${tone}`}>{formatArsMoney(ars)}</span>
      </div>
    </div>
  );
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[\s/\\:*?"<>|]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "product";
}

const BUCKET = "stock-proof-images";

function getStoragePathFromPublicUrl(url: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex === -1) return null;

    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function removeStoredProofImages(urls: string[]) {
  const paths = urls
    .map((url) => getStoragePathFromPublicUrl(url, BUCKET))
    .filter((path): path is string => Boolean(path));

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error("Failed to remove stock proof images:", error);
  }
}

/* ─── main component ───────────────────────────────────────────────── */

export function StockTable() {
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [purchaseFinanciers, setPurchaseFinanciers] = useState<PurchaseFinancier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all");
  const [showChart, setShowChart] = useState(true);
  const [ownershipTableReady, setOwnershipTableReady] = useState(true);

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
  const [soldLookupOpen, setSoldLookupOpen] = useState(false);
  const [soldLookupImage, setSoldLookupImage] = useState<{ preview: string; base64: string } | null>(null);
  const [soldLookupScanning, setSoldLookupScanning] = useState(false);
  const [soldLookupResult, setSoldLookupResult] = useState<string | null>(null);
  const soldLookupInputRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.product_key, p])),
    [products]
  );
  const purchaseMap = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.purchase_id, purchase])),
    [purchases]
  );
  const financierOptions = useMemo(() => getFinancierOptions(financiers), [financiers]);
  const purchaseFinanciersByPurchaseId = useMemo(() => {
    const map = new Map<string, PurchaseFinancier[]>();
    purchaseFinanciers.forEach((share) => {
      const current = map.get(share.purchase_id) ?? [];
      current.push(share);
      map.set(share.purchase_id, current);
    });
    return map;
  }, [purchaseFinanciers]);

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
        const supplierName = purchaseMap.get(u.purchase_id ?? "")?.supplier_name ?? u.supplier_name ?? "";
        return (
          u.imei1.includes(q) ||
          u.product_key.toLowerCase().includes(q) ||
          (u.color ?? "").toLowerCase().includes(q) ||
          (u.battery_health != null ? String(u.battery_health) : "").includes(q) ||
          (product?.product_name ?? "").toLowerCase().includes(q) ||
          supplierName.toLowerCase().includes(q) ||
          (u.notes ?? "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [units, statusFilter, searchQuery, productMap, purchaseMap]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [stockRes, prodRes, purchRes, financiersRes, purchaseFinanciersRes] = await Promise.all([
      supabase.from("stock_units").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*").order("product_name"),
      supabase.from("purchases").select("*").order("date_purchase", { ascending: false }),
      supabase.from("financiers").select("*").eq("active", true).order("display_name"),
      supabase.from("purchase_financiers").select("*").order("purchase_id").order("id"),
    ]);
    setUnits((stockRes.data as StockUnit[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);
    setPurchases((purchRes.data as Purchase[]) ?? []);
    const missingOwnershipTables =
      isMissingRelationError(financiersRes.error, "financiers") ||
      isMissingRelationError(purchaseFinanciersRes.error, "purchase_financiers");
    setOwnershipTableReady(!missingOwnershipTables);
    setFinanciers((financiersRes.data as Financier[]) ?? []);
    setPurchaseFinanciers(
      missingOwnershipTables ? [] : ((purchaseFinanciersRes.data as PurchaseFinancier[]) ?? [])
    );
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
      color: "",
      battery_health: "",
      purchase_id: "",
      supplier_name: "",
      cost_unit: "",
      cost_currency: "USD",
      sale_amount: "",
      sale_currency: "ARS",
      sale_fx_rate: "",
      date_received: todayIsoDate(),
      date_sold: "",
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
      color: unit.color ?? "",
      battery_health: unit.battery_health != null ? String(unit.battery_health) : "",
      purchase_id: unit.purchase_id ?? "",
      supplier_name: unit.supplier_name ?? "",
      cost_unit: unit.cost_unit != null ? String(unit.cost_unit) : "",
      cost_currency: unit.cost_currency ?? "USD",
      sale_amount: unit.sale_amount != null
        ? String(unit.sale_amount)
        : normalizeSaleCurrency(unit.sale_currency) === "ARS" && unit.sale_amount_ars != null
          ? String(unit.sale_amount_ars)
          : "",
      sale_currency: normalizeSaleCurrency(unit.sale_currency),
      sale_fx_rate: unit.sale_fx_rate != null ? String(unit.sale_fx_rate) : "",
      date_received: unit.date_received ?? "",
      date_sold: unit.date_sold ?? "",
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

  const resetSoldLookup = () => {
    setSoldLookupImage(null);
    setSoldLookupScanning(false);
    setSoldLookupResult(null);
  };

  const openSoldLookup = () => {
    resetSoldLookup();
    setSoldLookupOpen(true);
  };

  const handleAddSoldLookupImage = async (file: File) => {
    try {
      const base64 = await compressImage(file);
      setSoldLookupImage({ preview: base64, base64 });
      setSoldLookupResult(null);
    } catch {
      setSoldLookupResult("Error: Could not process image. Try another photo.");
    }
  };

  const openFoundUnitForSale = (
    unit: StockUnit,
    proofImage?: { preview: string; base64: string } | null
  ) => {
    openEdit(unit);
    setFormData((current) => ({
      ...current,
      status: current.status === "sold" ? current.status : "sold",
      date_sold: current.date_sold || todayIsoDate(),
    }));
    if (proofImage) {
      setScanImages([proofImage]);
      setScanResult("This lookup photo will be saved as an extra proof image when you save.");
    }
  };

  const handleSoldLookupScan = async () => {
    if (!soldLookupImage) return;
    setSoldLookupScanning(true);
    setSoldLookupResult(null);

    try {
      const response = await fetch("/api/groq/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [soldLookupImage.base64] }),
      });
      const data = await response.json();

      if (!response.ok) {
        setSoldLookupResult(`Error: ${data.error || "Failed to analyze"}`);
        return;
      }

      const imeiCandidates = [parseOptionalText(data.imei1), parseOptionalText(data.imei2)].filter(
        (value): value is string => Boolean(value)
      );
      const matchedUnit = units.find(
        (unit) => imeiCandidates.includes(unit.imei1) || (unit.imei2 ? imeiCandidates.includes(unit.imei2) : false)
      );

      if (!matchedUnit) {
        setSoldLookupResult(
          imeiCandidates.length > 0
            ? `No stock unit found for IMEI ${imeiCandidates.join(" / ")}.`
            : "No IMEI detected in the photo."
        );
        return;
      }

      setSoldLookupOpen(false);
      openFoundUnitForSale(matchedUnit, soldLookupImage);
      resetSoldLookup();
    } catch {
      setSoldLookupResult("Error: Failed to connect to AI service.");
    } finally {
      setSoldLookupScanning(false);
    }
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
        if (data.color) updated.color = data.color;
        if (data.battery_health != null) updated.battery_health = String(data.battery_health);
        if (matchedProduct) updated.product_key = matchedProduct.product_key;
        const withProductDefaults = matchedProduct
          ? applyProductVariantToStockDraft(matchedProduct, {
              color: parseOptionalText(updated.color),
              battery_health: parseOptionalNumber(updated.battery_health),
            })
          : null;
        if (withProductDefaults) {
          updated.color = withProductDefaults.color ?? "";
          updated.battery_health =
            withProductDefaults.battery_health != null ? String(withProductDefaults.battery_health) : "";
        }
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
      if (data.battery_health != null) parts.push(`Battery: ${data.battery_health}%`);
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

  const selectedFormProduct = useMemo(
    () => productMap.get(formData.product_key ?? ""),
    [formData.product_key, productMap]
  );
  const selectedSaleCurrency = normalizeSaleCurrency(formData.sale_currency);
  const selectedSaleFxRate =
    selectedSaleCurrency === "USD"
      ? parseOptionalNumber(formData.sale_fx_rate) ??
        (selectedFormProduct?.usd_rate && selectedFormProduct.usd_rate > 0
          ? selectedFormProduct.usd_rate
          : DEFAULT_USD_RATE)
      : null;
  const effectivePreviewUsdRate =
    selectedSaleFxRate ??
    (selectedFormProduct?.usd_rate && selectedFormProduct.usd_rate > 0
      ? selectedFormProduct.usd_rate
      : DEFAULT_USD_RATE);
  const saleAmountPreview = parseOptionalNumber(formData.sale_amount);
  const saleAmountUsdPreview =
    saleAmountPreview != null
      ? selectedSaleCurrency === "USD"
        ? saleAmountPreview
        : roundMoney(saleAmountPreview / effectivePreviewUsdRate)
      : null;
  const saleAmountArsPreview =
    saleAmountPreview != null
      ? selectedSaleCurrency === "USD"
        ? roundMoney(saleAmountPreview * (selectedSaleFxRate ?? DEFAULT_USD_RATE))
        : saleAmountPreview
      : null;
  const costAmountPreview = parseOptionalNumber(formData.cost_unit);
  const costAmountUsdPreview =
    costAmountPreview != null
      ? (parseOptionalText(formData.cost_currency) ?? "USD").toUpperCase() === "USD"
        ? costAmountPreview
        : roundMoney(costAmountPreview / effectivePreviewUsdRate)
      : null;
  const costAmountArsPreview =
    costAmountPreview != null
      ? resolveCostAmountArs(
          {
            id: editingUnit?.id ?? 0,
            imei1: formData.imei1 ?? "",
            imei2: parseOptionalText(formData.imei2),
            product_key: formData.product_key ?? "",
            purchase_id: parseOptionalText(formData.purchase_id),
            supplier_name: parseOptionalText(formData.supplier_name),
            cost_unit: costAmountPreview,
            cost_currency: parseOptionalText(formData.cost_currency) ?? "USD",
            date_received: parseOptionalText(formData.date_received),
            status: (formData.status as StockStatus) ?? "in_stock",
            date_sold: parseOptionalText(formData.date_sold),
            notes: parseOptionalText(formData.notes),
            created_at: editingUnit?.created_at ?? null,
            updated_at: editingUnit?.updated_at ?? null,
            sale_amount: saleAmountPreview,
            sale_currency: selectedSaleCurrency,
            sale_fx_rate: selectedSaleFxRate,
            sale_amount_ars: saleAmountArsPreview,
            cost_ars_snapshot: editingUnit?.cost_ars_snapshot ?? null,
            proof_image_urls: editingUnit?.proof_image_urls ?? null,
            color: parseOptionalText(formData.color),
            battery_health: parseOptionalNumber(formData.battery_health),
          } as StockUnit,
          selectedFormProduct,
          selectedSaleFxRate
        )
      : null;

  const handleSave = async () => {
    const imei1 = formData.imei1?.trim() ?? "";
    const imei2 = parseOptionalText(formData.imei2);
    const productKey = parseOptionalText(formData.product_key);

    if (!imei1) {
      alert("IMEI1 is required.");
      return;
    }
    if (!/^\d{15}$/.test(imei1)) {
      alert("IMEI1 must be exactly 15 digits.");
      return;
    }
    if (imei2 && !/^\d{15}$/.test(imei2)) {
      alert("IMEI2 must be exactly 15 digits.");
      return;
    }
    if (!productKey) {
      alert("Product is required. Create it in the Products page first if it doesn't exist.");
      return;
    }

    const catalogVariantError = validateStockVariantAgainstProduct(selectedFormProduct, {
      color: formData.color,
      batteryHealth: formData.battery_health,
    });
    if (catalogVariantError) {
      alert(catalogVariantError);
      return;
    }

    setSaving(true);
    const status = formData.status || "in_stock";
    const isSold = status === "sold";
    const dateSold = isSold ? formData.date_sold || editingUnit?.date_sold || todayIsoDate() : null;
    const purchaseId = parseOptionalText(formData.purchase_id);
    const saleAmount = isSold ? parseOptionalNumber(formData.sale_amount) : null;
    const saleCurrency = normalizeSaleCurrency(formData.sale_currency);
    const saleFxRate =
      isSold && saleCurrency === "USD"
        ? parseOptionalNumber(formData.sale_fx_rate) ??
          (selectedFormProduct?.usd_rate && selectedFormProduct.usd_rate > 0
            ? selectedFormProduct.usd_rate
            : DEFAULT_USD_RATE)
        : null;

    if (isSold && !purchaseId) {
      alert("Link sold units to a purchase so revenue and profit can be attributed to the right financier.");
      setSaving(false);
      return;
    }
    if (isSold && (saleAmount == null || saleAmount <= 0)) {
      alert("Sale amount is required when the unit is marked as sold.");
      setSaving(false);
      return;
    }
    if (isSold && saleCurrency === "USD" && (!saleFxRate || saleFxRate <= 0)) {
      alert("Add a valid FX rate for USD sales.");
      setSaving(false);
      return;
    }

    const saleAmountArs =
      isSold && saleAmount != null
        ? saleCurrency === "USD"
          ? roundMoney(saleAmount * (saleFxRate ?? DEFAULT_USD_RATE))
          : saleAmount
        : null;
    const costAmount = parseOptionalNumber(formData.cost_unit);
    const costArsSnapshot =
      isSold && costAmount != null
        ? resolveCostAmountArs(
            {
              id: editingUnit?.id ?? 0,
              imei1,
              imei2,
              product_key: productKey,
              purchase_id: purchaseId,
              supplier_name: purchaseId ? null : parseOptionalText(formData.supplier_name),
              cost_unit: costAmount,
              cost_currency: parseOptionalText(formData.cost_currency) ?? "USD",
              date_received: parseOptionalText(formData.date_received),
              status: status as StockStatus,
              date_sold: parseOptionalText(dateSold),
              notes: parseOptionalText(formData.notes),
              created_at: editingUnit?.created_at ?? null,
              updated_at: editingUnit?.updated_at ?? null,
              sale_amount: saleAmount,
              sale_currency: saleCurrency,
              sale_fx_rate: saleFxRate,
              sale_amount_ars: saleAmountArs,
              cost_ars_snapshot: editingUnit?.cost_ars_snapshot ?? null,
              proof_image_urls: editingUnit?.proof_image_urls ?? null,
              color: parseOptionalText(formData.color),
              battery_health: parseOptionalNumber(formData.battery_health),
            } as StockUnit,
            selectedFormProduct,
            saleFxRate
          )
        : null;
    const record: StockUnitInsert = {
      imei1,
      imei2,
      product_key: productKey,
      color: parseOptionalText(formData.color),
      battery_health: parseOptionalNumber(formData.battery_health),
      purchase_id: purchaseId,
      supplier_name: purchaseId ? null : parseOptionalText(formData.supplier_name),
      cost_unit: costAmount,
      cost_currency: parseOptionalText(formData.cost_currency) ?? "USD",
      sale_amount: saleAmount,
      sale_currency: isSold ? saleCurrency : null,
      sale_fx_rate: isSold ? saleFxRate : null,
      sale_amount_ars: saleAmountArs,
      cost_ars_snapshot: costArsSnapshot,
      date_received: parseOptionalText(formData.date_received),
      status: status as StockStatus,
      date_sold: parseOptionalText(dateSold),
      notes: parseOptionalText(formData.notes),
    };

    let uploadedProofUrls: string[] = [];
    const previousProofUrls = Array.isArray(editingUnit?.proof_image_urls)
      ? [...editingUnit.proof_image_urls]
      : [];

    try {
      // Upload proof images if user added any
      let proofUrls: string[] = previousProofUrls;
      if (scanImages.length > 0) {
        const productSlug = sanitizeForFilename(productKey);
        const urls: string[] = [];
        const proofIndexOffset = editingUnit ? previousProofUrls.length : 0;
        for (let i = 0; i < scanImages.length; i++) {
          const filename = `${imei1}_${productSlug}_proof_${proofIndexOffset + i + 1}.jpg`;
          const file = await dataUrlToFile(scanImages[i].base64, filename);
          const path = `${imei1}/${filename}`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
          if (error) throw error;
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
          urls.push(data.publicUrl);
        }
        uploadedProofUrls = urls;
        proofUrls =
          editingUnit && previousProofUrls.length > 0
            ? [...previousProofUrls, ...urls]
            : urls;
      }
      record.proof_image_urls = proofUrls;

      if (editingUnit) {
        const { error } = await supabase.from("stock_units").update(record).eq("id", editingUnit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_units").insert(record);
        if (error) throw error;
      }
      setDialogOpen(false);
      setEditingUnit(null);
      resetScan();
      if (editingUnit && uploadedProofUrls.length > 0 && previousProofUrls.length > 0) {
        const urlsToDelete = previousProofUrls.filter((url) => !uploadedProofUrls.includes(url));
        await removeStoredProofImages(urlsToDelete);
      }
      fetchAll();
    } catch (err: unknown) {
      if (uploadedProofUrls.length > 0) {
        await removeStoredProofImages(uploadedProofUrls);
      }
      const msg = getErrorMessage(err, "Unexpected error saving stock item.");
      if (
        (msg.includes("Could not find the 'color' column") || msg.includes("schema cache")) &&
        msg.includes("color")
      ) {
        alert("Database schema is missing stock color support. Sync the inventory schema in Supabase first.");
      } else if (
        (msg.includes("Could not find the 'battery_health' column") || msg.includes("schema cache")) &&
        msg.includes("battery_health")
      ) {
        alert("Database schema is missing stock battery health support. Sync the inventory schema in Supabase first.");
      } else if (
        isMissingColumnError(err, "proof_image_urls")
      ) {
        alert("Database schema is missing stock proof image support. Sync the inventory schema in Supabase first.");
      } else if (
        isMissingColumnError(err, "sale_amount") ||
        isMissingColumnError(err, "sale_currency") ||
        isMissingColumnError(err, "sale_fx_rate") ||
        isMissingColumnError(err, "sale_amount_ars") ||
        isMissingColumnError(err, "cost_ars_snapshot")
      ) {
        alert("Database schema is missing the accounting sale snapshot fields. Sync the accounting schema in Supabase first.");
      } else if (
        isMissingRelationError(err, "purchase_financiers") ||
        isMissingRelationError(err, "financiers")
      ) {
        alert("Database schema is missing financier ownership tables. Sync the accounting schema in Supabase first.");
      } else if (msg.includes("valid_imei1")) {
        alert("Invalid IMEI1: must be exactly 15 digits.");
      } else if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("IMEI1 already exists in stock.");
      } else if (isRowLevelSecurityError(err)) {
        alert("RLS blocked this stock save. Allow writes to stock_units in Supabase first.");
      } else if (msg.includes("Bucket not found") || msg.includes("storage")) {
        alert("Storage error: the proof image bucket or storage policy is missing in Supabase.");
      } else {
        alert(msg);
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
      alert(getErrorMessage(error, "Unexpected error deleting stock item."));
      return;
    }
    setDeleteUnit(null);
    fetchAll();
  };

  const updateForm = (key: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "purchase_id") {
        const selectedPurchase = purchases.find((purchase) => purchase.purchase_id === value);
        if (selectedPurchase) {
          next.supplier_name = selectedPurchase.supplier_name ?? next.supplier_name;
          next.date_received = selectedPurchase.date_purchase ?? next.date_received;
        }
      }
      if (key === "status" && value === "sold" && !next.date_sold) {
        next.date_sold = todayIsoDate();
      }
      if (key === "sale_currency" && value === "USD" && !next.sale_fx_rate) {
        const selectedProduct = products.find((product) => product.product_key === next.product_key);
        next.sale_fx_rate = String(
          selectedProduct?.usd_rate && selectedProduct.usd_rate > 0
            ? selectedProduct.usd_rate
            : DEFAULT_USD_RATE
        );
      }
      if (key === "sale_currency" && value === "ARS") {
        next.sale_fx_rate = "";
      }
      if (key === "product_key" && next.sale_currency === "USD" && !next.sale_fx_rate) {
        const selectedProduct = products.find((product) => product.product_key === value);
        next.sale_fx_rate = String(
          selectedProduct?.usd_rate && selectedProduct.usd_rate > 0
            ? selectedProduct.usd_rate
            : DEFAULT_USD_RATE
        );
        const withProductDefaults = applyProductVariantToStockDraft(selectedProduct, {
          color: parseOptionalText(next.color),
          battery_health: parseOptionalNumber(next.battery_health),
        });
        next.color = withProductDefaults.color ?? "";
        next.battery_health =
          withProductDefaults.battery_health != null ? String(withProductDefaults.battery_health) : "";
      } else if (key === "product_key") {
        const selectedProduct = products.find((product) => product.product_key === value);
        const withProductDefaults = applyProductVariantToStockDraft(selectedProduct, {
          color: parseOptionalText(next.color),
          battery_health: parseOptionalNumber(next.battery_health),
        });
        next.color = withProductDefaults.color ?? "";
        next.battery_health =
          withProductDefaults.battery_health != null ? String(withProductDefaults.battery_health) : "";
      }
      return next;
    });
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
              {showChart ? "Hide Analytics" : "Show Analytics"}
            </Button>
            <Button variant="outline" size="sm" onClick={openSoldLookup} className="gap-1.5">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Find by IMEI</span>
              <span className="sm:hidden">Find</span>
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
            {showChart ? "Hide Sales Analytics" : "Show Sales Analytics"}
          </Button>
        </div>

        {/* Sales Chart */}
        {showChart && (
          <div className="mb-4 sm:mb-6">
            <SalesChart
              units={units}
              purchases={purchases}
              products={products}
              financiers={financierOptions}
              purchaseFinanciers={ownershipTableReady ? purchaseFinanciers : []}
            />
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
            <p className="mb-3 text-[11px] text-muted-foreground sm:text-xs">
              Cost, sale revenue, and profit always show USD first and ARS second.
            </p>

            {/* Mobile: Cards | Desktop: Table */}
            <div className="space-y-2 sm:hidden">
              {filtered.map((unit) => {
                const product = productMap.get(unit.product_key);
                const realized = buildRealizedUnitSale(unit, product);
                const costUsd =
                  unit.cost_unit != null
                    ? resolveCostAmountUsd(unit, product, realized?.fxRate)
                    : null;
                const costArs =
                  unit.cost_unit != null
                    ? resolveCostAmountArs(unit, product, realized?.fxRate)
                    : null;
                const supplierName =
                  purchaseMap.get(unit.purchase_id ?? "")?.supplier_name ?? unit.supplier_name;

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
                      {unit.color && <span>Color: {unit.color}</span>}
                      {unit.battery_health != null && <span>Battery: {unit.battery_health}%</span>}
                      {supplierName && <span>{supplierName}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Cost Basis
                        </p>
                        <MoneyPair usd={costUsd} ars={costArs} />
                      </div>
                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Sale Revenue
                        </p>
                        <MoneyPair usd={realized?.revenueUsd ?? null} ars={realized?.revenueArs ?? null} />
                      </div>
                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Profit
                        </p>
                        <MoneyPair
                          usd={realized?.profitUsd ?? null}
                          ars={realized?.profitArs ?? null}
                          highlight={
                            realized
                              ? realized.profitUsd >= 0
                                ? "positive"
                                : "negative"
                              : "neutral"
                          }
                        />
                      </div>
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
                    <TableHead className="sticky top-0 z-20 bg-background">Color</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Battery</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Cost Basis</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Sale Revenue</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Profit</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Supplier</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Purchase</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Received</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((unit) => {
                    const product = productMap.get(unit.product_key);
                    const realized = buildRealizedUnitSale(unit, product);
                    const costUsd =
                      unit.cost_unit != null
                        ? resolveCostAmountUsd(unit, product, realized?.fxRate)
                        : null;
                    const costArs =
                      unit.cost_unit != null
                        ? resolveCostAmountArs(unit, product, realized?.fxRate)
                        : null;
                    const supplierName =
                      purchaseMap.get(unit.purchase_id ?? "")?.supplier_name ?? unit.supplier_name;

                    return (
                      <TableRow key={unit.id}>
                        <TableCell className="font-mono text-xs">{unit.imei1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{product?.product_name ?? unit.product_key}</p>
                            <p className="text-xs text-muted-foreground">{unit.product_key}</p>
                          </div>
                        </TableCell>
                        <TableCell>{unit.color ?? "—"}</TableCell>
                        <TableCell>{unit.battery_health != null ? `${unit.battery_health}%` : "—"}</TableCell>
                        <TableCell><StatusBadge status={unit.status} /></TableCell>
                        <TableCell className="min-w-[132px]">
                          <MoneyPair usd={costUsd} ars={costArs} />
                        </TableCell>
                        <TableCell className="min-w-[132px]">
                          <MoneyPair usd={realized?.revenueUsd ?? null} ars={realized?.revenueArs ?? null} />
                        </TableCell>
                        <TableCell className="min-w-[132px]">
                          <MoneyPair
                            usd={realized?.profitUsd ?? null}
                            ars={realized?.profitArs ?? null}
                            highlight={
                              realized
                                ? realized.profitUsd >= 0
                                  ? "positive"
                                  : "negative"
                                : "neutral"
                            }
                          />
                        </TableCell>
                        <TableCell>{supplierName ?? "—"}</TableCell>
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
            </div>
          )}

          {/* Pending proof images to append on save */}
          {editingUnit && scanImages.length > 0 && (
            <div className="space-y-1.5 rounded-lg border bg-emerald-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs sm:text-sm">New proof image ready to save</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={resetScan}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {scanImages.map((img, index) => (
                  <div key={`${img.preview}-${index}`} className="relative overflow-hidden rounded-lg border">
                    <img
                      src={img.preview}
                      alt={`Pending proof ${index + 1}`}
                      className="h-24 w-24 object-cover sm:h-28 sm:w-28"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Saving this sale will append the lookup image to the unit proof history.
              </p>
            </div>
          )}

          {/* Existing proof images (when editing) */}
          {editingUnit && editingUnit.proof_image_urls && editingUnit.proof_image_urls.length > 0 && (
            <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 sm:p-4">
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

          {/* Form */}
          <div className="grid gap-3 sm:gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      {formatCatalogVariantLabel(p)}
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

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Color</Label>
              <Input
                value={formData.color ?? ""}
                onChange={(e) => updateForm("color", e.target.value)}
                placeholder="Black, White, Titanium..."
              />
              <p className="text-[11px] text-muted-foreground">
                If the selected product already fixes a catalog color, this field should match it.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Battery Health</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                value={formData.battery_health ?? ""}
                onChange={(e) => updateForm("battery_health", e.target.value)}
                placeholder="92"
              />
              <p className="text-[11px] text-muted-foreground">
                If the selected product already fixes a battery health, this field should match it.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs sm:text-sm">Purchase</Label>
                <Select value={formData.purchase_id ?? ""} onValueChange={(v) => updateForm("purchase_id", v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none__">None</SelectItem>
                    {purchases.map((p) => (
                      <SelectItem key={p.purchase_id} value={p.purchase_id}>
                        {formatPurchaseOption(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs sm:text-sm">Supplier</Label>
                <Input
                  value={formData.supplier_name ?? ""}
                  onChange={(e) => updateForm("supplier_name", e.target.value)}
                  placeholder={formData.purchase_id ? "Inherited from purchase" : "Supplier"}
                  disabled={Boolean(formData.purchase_id)}
                />
                <p className="text-[11px] text-muted-foreground">
                  If a purchase is linked, supplier is derived from that purchase to avoid duplicate data.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Base Cost</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={formData.cost_unit ?? ""}
                  onChange={(e) => updateForm("cost_unit", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Cost Currency</Label>
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
            </div>
            <p className="text-[11px] text-muted-foreground">
              Record the supplier/base cost here, usually in USD. Saving it syncs the matching product prices by `product_key`.
            </p>

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-3">
                <p className="text-sm font-medium">Customer sale</p>
                <p className="text-xs text-muted-foreground">
                  Costs are usually tracked in USD above. Here, capture the real customer sale, which is usually in ARS.
                </p>
              </div>
              {!ownershipTableReady && (
                <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                  The database is missing financier/accounting tables, so sale snapshots and profit attribution may be incomplete.
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Sale Amount (Original Currency)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={formData.sale_amount ?? ""}
                    onChange={(e) => updateForm("sale_amount", e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Enter what the customer actually paid in the selected currency.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Sale Currency</Label>
                  <Select value={formData.sale_currency ?? "ARS"} onValueChange={(v) => updateForm("sale_currency", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Most sales will be ARS. Use USD only if the customer truly paid in dollars.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Date Sold</Label>
                  <Input
                    type="date"
                    value={formData.date_sold ?? ""}
                    onChange={(e) => updateForm("date_sold", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    If status is Sold and this is empty, today is used.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">FX Rate</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={formData.sale_fx_rate ?? ""}
                    onChange={(e) => updateForm("sale_fx_rate", e.target.value)}
                    placeholder={selectedSaleCurrency === "USD" ? String(selectedFormProduct?.usd_rate ?? DEFAULT_USD_RATE) : "Not needed for ARS"}
                    disabled={selectedSaleCurrency !== "USD"}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {selectedSaleCurrency === "USD"
                      ? "Used to freeze ARS revenue and cost snapshots when the customer paid in USD."
                      : "Only needed when the sale is in USD."}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 rounded-md border bg-background/70 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4">
                  <span>Sale value (USD)</span>
                  <span className="font-medium text-foreground">
                    {formatUsdMoney(saleAmountUsdPreview)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Revenue snapshot (ARS)</span>
                  <span className="font-medium text-foreground">
                    {formatArsMoney(saleAmountArsPreview)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Cost basis (USD)</span>
                  <span className="font-medium text-foreground">
                    {formatUsdMoney(costAmountUsdPreview)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Cost snapshot (ARS)</span>
                  <span className="font-medium text-foreground">
                    {formatArsMoney(costAmountArsPreview)}
                  </span>
                </div>
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

      <Dialog
        open={soldLookupOpen}
        onOpenChange={(open) => {
          setSoldLookupOpen(open);
          if (!open) {
            resetSoldLookup();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Find Stock by IMEI Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a photo of the IMEI sticker or box. If the IMEI matches a saved stock unit,
              the sale form opens already marked as sold.
            </p>

            <input
              ref={soldLookupInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleAddSoldLookupImage(file);
                }
                event.target.value = "";
              }}
            />

            {soldLookupImage ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border bg-muted">
                  <img
                    src={soldLookupImage.preview}
                    alt="IMEI lookup preview"
                    className="h-64 w-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => soldLookupInputRef.current?.click()}>
                    Replace photo
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetSoldLookup}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => soldLookupInputRef.current?.click()}
                className="flex h-56 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="rounded-full bg-primary/10 p-3">
                  <Camera className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-sm font-medium">Upload IMEI photo</p>
                  <p className="text-xs text-muted-foreground">
                    Best results: one clear photo with the IMEI label fully visible.
                  </p>
                </div>
              </button>
            )}

            {soldLookupResult ? (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  soldLookupResult.startsWith("Error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}
              >
                {soldLookupResult}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoldLookupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSoldLookupScan} disabled={!soldLookupImage || soldLookupScanning}>
              {soldLookupScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Analyze IMEI
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
