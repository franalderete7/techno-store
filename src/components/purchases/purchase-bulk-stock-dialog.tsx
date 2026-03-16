"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  applyProductVariantToStockDraft,
  formatCatalogVariantLabel,
  validateStockVariantAgainstProduct,
} from "@/lib/product-variants";
import {
  compressImage,
  dataUrlToFile,
  findBestProductMatch,
  scanImagesWithVision,
  type VisionScanResult,
} from "@/lib/stock-vision";
import { getErrorMessage, isRowLevelSecurityError, parseOptionalNumber, parseOptionalText } from "@/lib/utils";
import type { Product } from "@/types/database";
import type { Purchase, StockUnitInsert } from "@/types/stock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BulkStockDraft = {
  id: string;
  filename: string;
  preview: string;
  base64: string;
  imei1: string;
  imei2: string;
  product_key: string;
  color: string;
  battery_health: string;
  cost_unit: string;
  cost_currency: string;
  notes: string;
  scan: VisionScanResult | null;
  scan_message: string | null;
  scan_error: string | null;
};

const BUCKET = "stock-proof-images";

function sanitizeForFilename(value: string) {
  return value.replace(/[\s/\\:*?"<>|]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "product";
}

function getStoragePathFromPublicUrl(url: string, bucket: string) {
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
    console.error("Failed to remove bulk-import proof images:", error);
  }
}

function buildScanMessage(scan: VisionScanResult, matchedProduct: Product | null) {
  const parts = [
    scan.imei1 ? `IMEI1 ${scan.imei1}` : "",
    scan.model ? `Modelo ${scan.model}` : "",
    scan.storage_gb ? `${scan.storage_gb}GB` : "",
    scan.color ? `Color ${scan.color}` : "",
    scan.battery_health != null ? `Bat ${scan.battery_health}%` : "",
    matchedProduct ? `Producto ${matchedProduct.product_name}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "No pude extraer datos claros de esta foto.";
}

function validateBulkDraft(draft: BulkStockDraft, product: Product | null | undefined) {
  const imei1 = draft.imei1.trim();
  if (!imei1) return "IMEI1 is required.";
  if (!/^\d{15}$/.test(imei1)) return "IMEI1 must be exactly 15 digits.";

  const imei2 = parseOptionalText(draft.imei2);
  if (imei2 && !/^\d{15}$/.test(imei2)) return "IMEI2 must be exactly 15 digits.";

  const productKey = parseOptionalText(draft.product_key);
  if (!productKey) return "Product is required.";

  const variantError = validateStockVariantAgainstProduct(product, {
    color: draft.color,
    batteryHealth: draft.battery_health,
  });
  if (variantError) return variantError;

  return null;
}

export function PurchaseBulkStockDialog({
  open,
  onOpenChange,
  purchase,
  products,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase | null;
  products: Product[];
  onImported?: (count: number) => void;
}) {
  const [drafts, setDrafts] = useState<BulkStockDraft[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productMap = useMemo(() => new Map(products.map((product) => [product.product_key, product])), [products]);

  useEffect(() => {
    if (open) return;
    setDrafts([]);
    setScanning(false);
    setSaving(false);
    setStatusMessage(null);
  }, [open]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setStatusMessage(null);
    const entries = await Promise.all(
      [...files].map(async (file, index) => {
        const base64 = await compressImage(file);
        return {
          id: `${Date.now()}-${index}-${file.name}`,
          filename: file.name,
          preview: base64,
          base64,
          imei1: "",
          imei2: "",
          product_key: "",
          color: "",
          battery_health: "",
          cost_unit: "",
          cost_currency: purchase?.currency ?? "USD",
          notes: "",
          scan: null,
          scan_message: null,
          scan_error: null,
        } satisfies BulkStockDraft;
      })
    );

    setDrafts((current) => [...current, ...entries]);
  };

  const updateDraft = (draftId: string, patch: Partial<BulkStockDraft>) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== draftId) return draft;
        const next = { ...draft, ...patch };

        if (Object.prototype.hasOwnProperty.call(patch, "product_key")) {
          const selectedProduct = productMap.get(String(patch.product_key || "").trim());
          const withProductDefaults = applyProductVariantToStockDraft(selectedProduct, {
            color: parseOptionalText(next.color),
            battery_health: parseOptionalNumber(next.battery_health),
          });
          next.color = withProductDefaults.color ?? "";
          next.battery_health =
            withProductDefaults.battery_health != null ? String(withProductDefaults.battery_health) : "";
        }

        return next;
      })
    );
  };

  const removeDraft = (draftId: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
  };

  const handleAnalyzeAll = async () => {
    if (drafts.length === 0) return;

    setScanning(true);
    setStatusMessage(null);

    try {
      const analyzedDrafts = await Promise.all(
        drafts.map(async (draft) => {
          try {
            const scan = await scanImagesWithVision([draft.base64]);
            const matchedProduct: Product | null = findBestProductMatch(products, scan);
            const withProductDefaults = matchedProduct
              ? applyProductVariantToStockDraft(matchedProduct, {
                  color: parseOptionalText(scan.color),
                  battery_health: parseOptionalNumber(scan.battery_health),
                })
              : null;
            const matchedProductKey = matchedProduct ? matchedProduct.product_key : draft.product_key;

            return {
              ...draft,
              imei1: scan.imei1 ?? draft.imei1,
              imei2: scan.imei2 ?? draft.imei2,
              product_key: matchedProductKey,
              color: withProductDefaults?.color ?? scan.color ?? draft.color,
              battery_health:
                withProductDefaults?.battery_health != null
                  ? String(withProductDefaults.battery_health)
                  : scan.battery_health != null
                    ? String(scan.battery_health)
                    : draft.battery_health,
              scan,
              scan_message: buildScanMessage(scan, matchedProduct),
              scan_error: matchedProduct || scan.imei1 ? null : "Review this row before importing.",
            } satisfies BulkStockDraft;
          } catch (error) {
            return {
              ...draft,
              scan: null,
              scan_message: null,
              scan_error: getErrorMessage(error, "Failed to analyze this image."),
            } satisfies BulkStockDraft;
          }
        })
      );

      setDrafts(analyzedDrafts);
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    if (!purchase) {
      setStatusMessage("Save the purchase first so the stock rows can link to a real purchase ID.");
      return;
    }

    const validationErrors = drafts
      .map((draft) => {
        const product = productMap.get(parseOptionalText(draft.product_key) ?? "");
        return { draft, error: validateBulkDraft(draft, product) };
      })
      .filter((entry) => entry.error);

    if (validationErrors.length > 0) {
      setStatusMessage(validationErrors[0]?.error ?? "Review the draft rows before importing.");
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    const uploadedUrls: string[] = [];

    try {
      const records: StockUnitInsert[] = [];

      for (const draft of drafts) {
        const imei1 = draft.imei1.trim();
        const productKey = String(draft.product_key).trim();
        const filename = `${imei1}_${sanitizeForFilename(productKey)}_proof_1.jpg`;
        const file = await dataUrlToFile(draft.base64, filename);
        const path = `${imei1}/${filename}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: true,
        });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        uploadedUrls.push(data.publicUrl);

        records.push({
          imei1,
          imei2: parseOptionalText(draft.imei2),
          product_key: productKey,
          color: parseOptionalText(draft.color),
          battery_health: parseOptionalNumber(draft.battery_health),
          purchase_id: purchase.purchase_id,
          supplier_name: null,
          cost_unit: parseOptionalNumber(draft.cost_unit),
          cost_currency: parseOptionalText(draft.cost_currency) ?? purchase.currency ?? "USD",
          date_received: purchase.date_purchase,
          status: "in_stock",
          notes: parseOptionalText(draft.notes),
          proof_image_urls: [data.publicUrl],
        });
      }

      const { error } = await supabase.from("stock_units").insert(records);
      if (error) throw error;

      onImported?.(records.length);
      onOpenChange(false);
    } catch (error) {
      if (uploadedUrls.length > 0) {
        await removeStoredProofImages(uploadedUrls);
      }

      if (isRowLevelSecurityError(error)) {
        setStatusMessage("RLS blocked this bulk stock import. Allow writes to stock_units first.");
      } else {
        setStatusMessage(getErrorMessage(error, "Unexpected error importing stock rows."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Stock</DialogTitle>
          <DialogDescription>
            Upload one photo per phone, review the AI draft rows, and import them into{" "}
            <span className="font-mono">{purchase?.purchase_id ?? "this purchase"}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Draft rows</p>
                <p className="text-xs text-muted-foreground">
                  Each uploaded image becomes one draft stock row. Review product, IMEI, color, and
                  battery before importing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Add images
                </Button>
                <Button
                  type="button"
                  onClick={handleAnalyzeAll}
                  disabled={drafts.length === 0 || scanning}
                >
                  {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analyze all
                </Button>
              </div>
            </div>
          </div>

          {statusMessage ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {statusMessage}
            </div>
          ) : null}

          {drafts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Add some phone photos to start the bulk import.
            </div>
          ) : (
            <div className="grid gap-4">
              {drafts.map((draft) => {
                const selectedProduct = productMap.get(parseOptionalText(draft.product_key) ?? "");
                const validationError = validateBulkDraft(draft, selectedProduct);

                return (
                  <div key={draft.id} className="rounded-lg border bg-card p-4">
                    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <div className="overflow-hidden rounded-lg border bg-muted">
                          <img
                            src={draft.preview}
                            alt={draft.filename}
                            className="h-44 w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{draft.filename}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeDraft(draft.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        {draft.scan_message ? (
                          <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                            {draft.scan_message}
                          </p>
                        ) : null}
                        {draft.scan_error ? (
                          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                            {draft.scan_error}
                          </p>
                        ) : null}
                        {validationError ? (
                          <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                            {validationError}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>IMEI1 *</Label>
                          <Input
                            value={draft.imei1}
                            onChange={(event) => updateDraft(draft.id, { imei1: event.target.value })}
                            placeholder="15 digits"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>IMEI2</Label>
                          <Input
                            value={draft.imei2}
                            onChange={(event) => updateDraft(draft.id, { imei2: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Product *</Label>
                          <Select
                            value={draft.product_key || "__unset__"}
                            onValueChange={(value) =>
                              updateDraft(draft.id, { product_key: value === "__unset__" ? "" : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              <SelectItem value="__unset__">Select product...</SelectItem>
                              {products.map((product) => (
                                <SelectItem key={product.product_key} value={product.product_key}>
                                  {formatCatalogVariantLabel(product)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Color</Label>
                          <Input
                            value={draft.color}
                            onChange={(event) => updateDraft(draft.id, { color: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Battery Health</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={draft.battery_health}
                            onChange={(event) => updateDraft(draft.id, { battery_health: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Unit Cost</Label>
                          <Input
                            type="number"
                            value={draft.cost_unit}
                            onChange={(event) => updateDraft(draft.id, { cost_unit: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Cost Currency</Label>
                          <Select
                            value={draft.cost_currency || purchase?.currency || "USD"}
                            onValueChange={(value) => updateDraft(draft.id, { cost_currency: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="ARS">ARS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Notes</Label>
                          <Input
                            value={draft.notes}
                            onChange={(event) => updateDraft(draft.id, { notes: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={drafts.length === 0 || scanning || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import {drafts.length > 0 ? drafts.length : ""} unit{drafts.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
