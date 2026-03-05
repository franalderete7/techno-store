"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Product, ProductInsert } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Columns3, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const TABLE_COLUMNS = [
  { key: "image_url", label: "Image", alwaysVisible: true },
  { key: "id", label: "ID", alwaysVisible: false },
  { key: "product_key", label: "Product Key", alwaysVisible: false },
  { key: "category", label: "Category", alwaysVisible: false },
  { key: "product_name", label: "Product Name", alwaysVisible: false },
  { key: "cost_usd", label: "Cost USD", alwaysVisible: false },
  { key: "logistics_usd", label: "Logistics USD", alwaysVisible: false },
  { key: "total_cost_usd", label: "Total Cost USD", alwaysVisible: false },
  { key: "margin_pct", label: "Margin %", alwaysVisible: false },
  { key: "price_usd", label: "Price USD", alwaysVisible: false },
  { key: "price_ars", label: "Price ARS", alwaysVisible: false },
  { key: "promo_price_ars", label: "Promo Price ARS", alwaysVisible: false },
  { key: "bancarizada_total", label: "Bancarizada Total", alwaysVisible: false },
  { key: "bancarizada_cuota", label: "Bancarizada Cuota", alwaysVisible: false },
  { key: "bancarizada_interest", label: "Bancarizada Interest %", alwaysVisible: false },
  { key: "macro_total", label: "Macro Total", alwaysVisible: false },
  { key: "macro_cuota", label: "Macro Cuota", alwaysVisible: false },
  { key: "macro_interest", label: "Macro Interest %", alwaysVisible: false },
  { key: "cuotas_qty", label: "Cuotas Qty", alwaysVisible: false },
  { key: "in_stock", label: "In Stock", alwaysVisible: false },
  { key: "delivery_type", label: "Delivery Type", alwaysVisible: false },
  { key: "delivery_days", label: "Delivery Days", alwaysVisible: false },
  { key: "usd_rate", label: "USD Rate", alwaysVisible: false },
  { key: "ram_gb", label: "RAM GB", alwaysVisible: false },
  { key: "storage_gb", label: "Storage GB", alwaysVisible: false },
  { key: "color", label: "Color", alwaysVisible: false },
  { key: "network", label: "Network", alwaysVisible: false },
  { key: "created_at", label: "Created", alwaysVisible: false },
  { key: "updated_at", label: "Updated", alwaysVisible: false },
];

const DEFAULT_VISIBLE_COLUMNS = [
  "image_url",
  "id",
  "product_key",
  "category",
  "product_name",
  "price_usd",
  "price_ars",
  "in_stock",
];

const ALWAYS_VISIBLE_COLUMNS = TABLE_COLUMNS.filter((column) => column.alwaysVisible).map(
  (column) => column.key
);

const STORAGE_KEY = "techno-store-visible-columns";

const PRICING_BANDS = [
  { maxCostUsd: 200, marginPct: 0.3, label: "USD 0 - 200" },
  { maxCostUsd: 400, marginPct: 0.25, label: "USD 201 - 400" },
  { maxCostUsd: 800, marginPct: 0.2, label: "USD 401 - 800" },
  { maxCostUsd: Number.POSITIVE_INFINITY, marginPct: 0.15, label: "USD 801+" },
] as const;

function normalizeVisibleColumns(columns: string[]): string[] {
  const validColumns = new Set(TABLE_COLUMNS.map((column) => column.key));
  return [...new Set([...ALWAYS_VISIBLE_COLUMNS, ...columns])].filter((column) =>
    validColumns.has(column)
  );
}

function getStoredVisibleColumns(): string[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return normalizeVisibleColumns(parsed.length > 0 ? parsed : DEFAULT_VISIBLE_COLUMNS);
    }
  } catch {
    // ignore
  }
  return normalizeVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
}

function formatPercentValue(value: number): string {
  return `${(value * 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatArs(value: number): string {
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCellValue(product: Product, key: string): string {
  const val = product[key as keyof Product];
  if (val === null || val === undefined) return "—";
  if (key === "margin_pct" || key === "bancarizada_interest" || key === "macro_interest") {
    return typeof val === "number" ? formatPercentValue(val) : String(val);
  }
  if (key === "in_stock") return val ? "Yes" : "No";
  if (key === "price_usd" || key === "cost_usd" || key === "logistics_usd" || key === "total_cost_usd")
    return typeof val === "number" ? formatUsd(val) : String(val);
  if (key.includes("price") || key.includes("bancarizada") || key.includes("macro"))
    return typeof val === "number" ? formatArs(val) : String(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (key === "created_at" || key === "updated_at")
    return new Date(val as string).toLocaleDateString();
  return String(val);
}

const EDITABLE_COLUMNS = [
  { key: "product_key", label: "Product Key", type: "text" as const },
  { key: "category", label: "Category", type: "text" as const },
  { key: "product_name", label: "Product Name", type: "text" as const },
  { key: "cost_usd", label: "Cost USD", type: "number" as const },
  { key: "logistics_usd", label: "Logistics USD", type: "number" as const },
  { key: "total_cost_usd", label: "Total Cost USD", type: "number" as const },
  { key: "margin_pct", label: "Margin %", type: "number" as const },
  { key: "price_usd", label: "Price USD", type: "number" as const },
  { key: "price_ars", label: "Price ARS", type: "number" as const },
  { key: "promo_price_ars", label: "Promo Price ARS", type: "number" as const },
  { key: "bancarizada_total", label: "Bancarizada Total", type: "number" as const },
  { key: "bancarizada_cuota", label: "Bancarizada Cuota", type: "number" as const },
  { key: "bancarizada_interest", label: "Bancarizada Interest %", type: "number" as const },
  { key: "macro_total", label: "Macro Total", type: "number" as const },
  { key: "macro_cuota", label: "Macro Cuota", type: "number" as const },
  { key: "macro_interest", label: "Macro Interest %", type: "number" as const },
  { key: "cuotas_qty", label: "Cuotas Qty", type: "number" as const },
  { key: "in_stock", label: "In Stock", type: "boolean" as const },
  { key: "delivery_type", label: "Delivery Type", type: "text" as const },
  { key: "delivery_days", label: "Delivery Days", type: "number" as const },
  { key: "usd_rate", label: "USD Rate", type: "number" as const },
  { key: "ram_gb", label: "RAM GB", type: "number" as const },
  { key: "storage_gb", label: "Storage GB", type: "number" as const },
  { key: "color", label: "Color", type: "text" as const },
  { key: "network", label: "Network", type: "text" as const },
  { key: "image_url", label: "Image URL", type: "text" as const },
];

const DEFAULT_VALUES: Partial<ProductInsert> = {
  logistics_usd: 10,
  bancarizada_interest: 0.5,
  macro_interest: 0.35,
  cuotas_qty: 6,
  in_stock: true,
  delivery_type: "immediate",
  delivery_days: 0,
  usd_rate: 1460,
};

function getSortValue(product: Product, key: string): string | number | boolean | null {
  const val = product[key as keyof Product];
  if (val === null || val === undefined) return null;
  if (key === "created_at" || key === "updated_at") return new Date(val as string).getTime();
  return val as string | number | boolean;
}

function sortProducts(products: Product[], column: string, direction: "asc" | "desc"): Product[] {
  return [...products].sort((a, b) => {
    const aVal = getSortValue(a, column);
    const bVal = getSortValue(b, column);

    const aNull = aVal === null;
    const bNull = bVal === null;
    if (aNull && bNull) return 0;
    if (aNull) return direction === "asc" ? 1 : -1;
    if (bNull) return direction === "asc" ? -1 : 1;

    let cmp = 0;
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
      cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0);
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }
    return direction === "asc" ? cmp : -cmp;
  });
}

function toFormValue(product: Product | null, key: string): string | number | boolean {
  if (!product) {
    const def = DEFAULT_VALUES[key as keyof ProductInsert];
    return def ?? "";
  }
  const val = product[key as keyof Product];
  if (val === null || val === undefined) return "";
  return val;
}

function parseNumericValue(value: string | number | boolean | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundUsdAmount(value: number): number {
  return Number(value.toFixed(2));
}

function roundArsAmount(value: number): number {
  return Math.round(value);
}

function slugifyProductName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return slug || "product";
}

function inferCategoryFromName(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("iphone")) return "IPHONE";
  if (normalized.includes("samsung") || normalized.includes("galaxy")) return "SAMSUNG";
  if (
    normalized.includes("redmi") ||
    normalized.includes("poco") ||
    normalized.includes("xiaomi") ||
    /\bmi\b/.test(normalized)
  ) {
    return "REDMI/POCO";
  }
  if (normalized.includes("motorola") || normalized.includes("moto")) return "MOTOROLA";

  return "GENERAL";
}

function buildUniqueProductKey(name: string, products: Product[]): string {
  const baseKey = slugifyProductName(name);
  const existingKeys = new Set(products.map((product) => product.product_key.toLowerCase()));

  if (!existingKeys.has(baseKey)) return baseKey;

  let suffix = 2;
  let candidate = `${baseKey}_${suffix}`;

  while (existingKeys.has(candidate)) {
    suffix += 1;
    candidate = `${baseKey}_${suffix}`;
  }

  return candidate;
}

function getPricingBand(costUsd: number) {
  return (
    PRICING_BANDS.find((band) => costUsd <= band.maxCostUsd) ??
    PRICING_BANDS[PRICING_BANDS.length - 1]
  );
}

type QuickAddPreview = {
  marginBandLabel: string;
  insert: ProductInsert;
};

function buildQuickAddPreview(
  productName: string,
  rawCostUsd: string | number | boolean | undefined,
  products: Product[]
): QuickAddPreview | null {
  const trimmedName = productName.trim();
  const costUsd = parseNumericValue(rawCostUsd);

  if (!trimmedName || costUsd === null || costUsd <= 0) return null;

  const logisticsUsd = Number(DEFAULT_VALUES.logistics_usd ?? 10);
  const usdRate = Number(DEFAULT_VALUES.usd_rate ?? 1460);
  const cuotasQty = Number(DEFAULT_VALUES.cuotas_qty ?? 6);
  const bancarizadaInterest = Number(DEFAULT_VALUES.bancarizada_interest ?? 0.5);
  const macroInterest = Number(DEFAULT_VALUES.macro_interest ?? 0.35);
  const marginBand = getPricingBand(costUsd);

  const totalCostUsd = roundUsdAmount(costUsd + logisticsUsd);
  const priceUsd = roundUsdAmount(totalCostUsd * (1 + marginBand.marginPct));
  const priceArs = roundArsAmount(priceUsd * usdRate);
  const bancarizadaTotal = roundArsAmount(priceArs * (1 + bancarizadaInterest));
  const macroTotal = roundArsAmount(priceArs * (1 + macroInterest));

  return {
    marginBandLabel: marginBand.label,
    insert: {
      product_key: buildUniqueProductKey(trimmedName, products),
      category: inferCategoryFromName(trimmedName),
      product_name: trimmedName,
      cost_usd: roundUsdAmount(costUsd),
      logistics_usd: logisticsUsd,
      total_cost_usd: totalCostUsd,
      margin_pct: marginBand.marginPct,
      price_usd: priceUsd,
      price_ars: priceArs,
      promo_price_ars: null,
      bancarizada_total: bancarizadaTotal,
      bancarizada_cuota: roundArsAmount(bancarizadaTotal / cuotasQty),
      bancarizada_interest: bancarizadaInterest,
      macro_total: macroTotal,
      macro_cuota: roundArsAmount(macroTotal / cuotasQty),
      macro_interest: macroInterest,
      cuotas_qty: cuotasQty,
      in_stock: true,
      delivery_type: "immediate",
      delivery_days: 0,
      usd_rate: usdRate,
      image_url: null,
    },
  };
}

function ProductImageCell({ product }: { product: Product }) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = typeof product.image_url === "string" ? product.image_url.trim() : "";

  if (!imageUrl || hasError) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-md border bg-muted text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        No image
      </div>
    );
  }

  return (
    <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
      <img
        src={imageUrl}
        alt={product.product_name}
        className="h-14 w-14 rounded-md border object-cover"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </a>
  );
}

export function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>({});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    normalizeVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
  );
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedProducts =
    sortColumn && products.length > 0
      ? sortProducts(products, sortColumn, sortDirection)
      : products;
  const quickAddPreview = buildQuickAddPreview(
    String(formData.product_name ?? ""),
    formData.cost_usd,
    products
  );

  useEffect(() => {
    setVisibleColumns(getStoredVisibleColumns());
  }, []);

  const toggleColumn = (key: string, checked: boolean) => {
    if (ALWAYS_VISIBLE_COLUMNS.includes(key)) return;
    const next = normalizeVisibleColumns(
      checked ? [...visibleColumns, key] : visibleColumns.filter((c) => c !== key)
    );
    setVisibleColumns(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const selectAllColumns = () => {
    const all = normalizeVisibleColumns(TABLE_COLUMNS.map((c) => c.key));
    setVisibleColumns(all);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  };

  const deselectAllColumns = () => {
    setVisibleColumns(ALWAYS_VISIBLE_COLUMNS);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ALWAYS_VISIBLE_COLUMNS));
    }
  };

  const handleTableWheel = (e: React.WheelEvent) => {
    const el = tableScrollRef.current;
    if (!el) return;
    const hasHorizontalOverflow = el.scrollWidth > el.clientWidth;
    const hasVerticalOverflow = el.scrollHeight > el.clientHeight;

    // Shift + wheel: horizontal scroll
    if (e.shiftKey && hasHorizontalOverflow) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      return;
    }

    // Vertical wheel: prefer vertical scroll when possible, else horizontal (for wide tables)
    if (!e.shiftKey && hasHorizontalOverflow && !hasVerticalOverflow) {
      e.preventDefault();
      el.scrollLeft -= e.deltaY;
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: true });
    if (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
    } else {
      setProducts(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openEdit = (product: Product) => {
    setEditProduct(product);
    const data: Record<string, string | number | boolean> = {};
    EDITABLE_COLUMNS.forEach(({ key }) => {
      data[key] = toFormValue(product, key);
    });
    setFormData(data);
  };

  const openAdd = () => {
    setEditProduct(null);
    setFormData({
      product_name: "",
      cost_usd: "",
    });
    setAddOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editProduct) return;
    setSaving(true);
    const update: Record<string, string | number | boolean | null> = {};
    EDITABLE_COLUMNS.forEach(({ key, type }) => {
      const val = formData[key];
      if (type === "number") {
        const n = typeof val === "string" ? parseFloat(val) : Number(val);
        update[key] = isNaN(n) ? null : n;
      } else if (type === "boolean") {
        update[key] = !!val;
      } else {
        update[key] = val === "" ? null : (val as string);
      }
    });
    const { error } = await supabase
      .from("products")
      .update(update)
      .eq("id", editProduct.id);
    setSaving(false);
    if (error) {
      alert("Error updating product: " + error.message);
      return;
    }
    setEditProduct(null);
    fetchProducts();
  };

  const handleSaveAdd = async () => {
    const preview = buildQuickAddPreview(String(formData.product_name ?? ""), formData.cost_usd, products);
    if (!preview) {
      alert("Product Name and a valid Cost USD are required.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("products").insert(preview.insert);
    setSaving(false);
    if (error) {
      alert("Error adding product: " + error.message);
      return;
    }
    setAddOpen(false);
    setFormData({});
    fetchProducts();
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;
    setSaving(true);
    const { error } = await supabase.from("products").delete().eq("id", deleteProduct.id);
    setSaving(false);
    if (error) {
      alert("Error deleting product: " + error.message);
      return;
    }
    setDeleteProduct(null);
    fetchProducts();
  };

  const updateForm = (key: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const displayColumns = TABLE_COLUMNS.filter((col) => visibleColumns.includes(col.key));
  const quickAddSummaryItems = quickAddPreview
    ? [
        { label: "Product Key", value: quickAddPreview.insert.product_key },
        { label: "Category", value: quickAddPreview.insert.category },
        {
          label: "Margin",
          value: formatPercentValue(quickAddPreview.insert.margin_pct ?? 0),
        },
        {
          label: "Price USD",
          value: formatUsd(quickAddPreview.insert.price_usd),
        },
        {
          label: "Price ARS",
          value: formatArs(quickAddPreview.insert.price_ars),
        },
        {
          label: "Bancarizada / cuota",
          value: formatArs(quickAddPreview.insert.bancarizada_cuota ?? 0),
        },
        {
          label: "Macro / cuota",
          value: formatArs(quickAddPreview.insert.macro_cuota ?? 0),
        },
        {
          label: "Total Cost USD",
          value: formatUsd(quickAddPreview.insert.total_cost_usd ?? 0),
        },
      ]
    : [];
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    }
    if (columnsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnsOpen]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Products</h1>
          <div className="flex items-center gap-2">
            <div ref={columnsRef} className="relative">
              <Button
                variant="outline"
                onClick={() => setColumnsOpen((o) => !o)}
              >
                <Columns3 className="mr-2 h-4 w-4" />
                Columns
              </Button>
              {columnsOpen && (
                <div className="absolute right-0 top-full z-[100] mt-1 w-64 rounded-md border bg-popover p-0 shadow-md">
                  <div className="flex gap-2 border-b p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      type="button"
                      onClick={selectAllColumns}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      type="button"
                      onClick={deselectAllColumns}
                    >
                      Deselect All
                    </Button>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto p-2">
                    {TABLE_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                          col.alwaysVisible ? "cursor-default opacity-70" : "cursor-pointer hover:bg-accent"
                        }`}
                      >
                        <Checkbox
                          checked={visibleColumns.includes(col.key)}
                          disabled={col.alwaysVisible}
                          onCheckedChange={(checked) =>
                            toggleColumn(col.key, checked === true)
                          }
                        />
                        <span>{col.label}</span>
                        {col.alwaysVisible ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                            Always
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Image is always visible. Shift + scroll = horizontal.
                  </p>
                </div>
              )}
            </div>
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            No products yet. Click &quot;Add Product&quot; to create one.
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="overflow-auto rounded-lg border"
            style={{ maxHeight: "calc(100vh - 12rem)" }}
            onWheel={handleTableWheel}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {displayColumns.map((col) => (
                    <TableHead
                      key={col.key}
                      className="min-w-[100px] cursor-pointer select-none whitespace-nowrap px-3 py-3 hover:bg-muted/50"
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortColumn === col.key ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((p) => (
                  <TableRow key={p.id}>
                    {displayColumns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={`px-3 py-2 ${col.key === "image_url" ? "min-w-[84px]" : "min-w-[100px] whitespace-nowrap"}`}
                      >
                        {col.key === "image_url" ? (
                          <ProductImageCell product={p} />
                        ) : col.key === "id" ? (
                          <span className="font-mono text-xs">{p.id}</span>
                        ) : col.key === "in_stock" ? (
                          p.in_stock ? (
                            <Badge variant="default">Yes</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )
                        ) : (
                          formatCellValue(p, col.key)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="min-w-[100px]">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteProduct(p)}
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
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editProduct && !addOpen} onOpenChange={(o) => !o && setEditProduct(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {EDITABLE_COLUMNS.map(({ key, label, type }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  {type === "boolean" ? (
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id={key}
                        checked={!!formData[key]}
                        onCheckedChange={(c) => updateForm(key, !!c)}
                      />
                      <label htmlFor={key} className="text-sm">
                        {formData[key] ? "Yes" : "No"}
                      </label>
                    </div>
                  ) : type === "text" && key === "delivery_type" ? (
                    <Select
                      value={String(formData[key] ?? "")}
                      onValueChange={(v) => updateForm(key, v)}
                    >
                      <SelectTrigger id={key}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="pickup">Pickup</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={key}
                      type={type}
                      value={
                        typeof formData[key] === "boolean"
                          ? ""
                          : String(formData[key] ?? "")
                      }
                      onChange={(e) =>
                        updateForm(
                          key,
                          type === "number"
                            ? (e.target.value === "" ? "" : parseFloat(e.target.value))
                            : e.target.value
                        )
                      }
                      placeholder={label}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setFormData({});
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Quick Add Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-product-name">Product Name</Label>
                <Input
                  id="add-product-name"
                  value={String(formData.product_name ?? "")}
                  onChange={(e) => updateForm("product_name", e.target.value)}
                  placeholder="iPhone 15 128GB"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-cost-usd">Cost USD</Label>
                <Input
                  id="add-cost-usd"
                  type="number"
                  value={typeof formData.cost_usd === "boolean" ? "" : String(formData.cost_usd ?? "")}
                  onChange={(e) =>
                    updateForm("cost_usd", e.target.value === "" ? "" : parseFloat(e.target.value))
                  }
                  placeholder="499"
                />
                <p className="text-xs text-muted-foreground">
                  Margin is assigned automatically from the cost band chart. Stock is always saved as
                  <span className="font-medium text-foreground"> Yes</span>.
                </p>
              </div>
            </div>

            {quickAddPreview ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Auto-calculated values</p>
                    <p className="text-xs text-muted-foreground">
                      {quickAddPreview.marginBandLabel} margin band, logistics {formatUsd(
                        quickAddPreview.insert.logistics_usd ?? 0
                      )}, USD rate {quickAddPreview.insert.usd_rate}
                    </p>
                  </div>
                  <Badge variant="default">In stock: Yes</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {quickAddSummaryItems.map((item) => (
                    <div key={item.label} className="rounded-md border bg-background p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Enter a product name and a valid USD cost to generate the category, product key,
                selling price, installment totals, and default stock data automatically.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdd} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(o) => !o && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteProduct?.product_name}&quot;? This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
