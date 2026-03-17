"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Sparkles, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/utils";
import { compressImage } from "@/lib/stock-vision";
import {
  type BulkPricingMatch,
  type BulkPricingRow,
  matchBulkPricingRowsToProducts,
  parseBulkPricingText,
} from "@/lib/bulk-product-pricing";
import { buildProductPricingSnapshot } from "@/lib/product-pricing";
import type { Product } from "@/types/database";
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
import { Label } from "@/components/ui/label";

type BulkProductPricingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onApplied: () => void | Promise<void>;
};

type PricingImageExtractionResponse = {
  rows?: Array<{
    product_key?: string | null;
    product_name?: string | null;
    price_ars?: number | null;
    price_usd?: number | null;
    promo_price_ars?: number | null;
  }>;
  error?: string;
};

function formatArs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `US$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeImageRows(rows: PricingImageExtractionResponse["rows"]): BulkPricingRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      source: [row.product_key, row.product_name, row.price_ars, row.price_usd]
        .filter((value) => value != null && value !== "")
        .join(" | "),
      productKey: row.product_key?.trim() || null,
      productName: row.product_name?.trim() || null,
      priceArs: typeof row.price_ars === "number" ? row.price_ars : null,
      priceUsd: typeof row.price_usd === "number" ? row.price_usd : null,
      promoPriceArs: typeof row.promo_price_ars === "number" ? row.promo_price_ars : null,
    }))
    .filter((row) => row.productKey || row.productName);
}

export function BulkProductPricingDialog({
  open,
  onOpenChange,
  products,
  onApplied,
}: BulkProductPricingDialogProps) {
  const [rawText, setRawText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [matches, setMatches] = useState<BulkPricingMatch[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setRawText("");
    setImageFiles([]);
    setMatches([]);
    setAnalyzing(false);
    setApplying(false);
    setError(null);
    setSuccessMessage(null);
  }, [open]);

  const imagePreviewUrls = useMemo(
    () => imageFiles.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [imageFiles]
  );

  useEffect(
    () => () => {
      imagePreviewUrls.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [imagePreviewUrls]
  );

  const matchedRows = matches.filter((match) => match.product);
  const unmatchedRows = matches.filter((match) => !match.product);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const parsedTextRows = rawText.trim() ? parseBulkPricingText(rawText) : [];
      let parsedImageRows: BulkPricingRow[] = [];

      if (imageFiles.length > 0) {
        const images = await Promise.all(imageFiles.map((file) => compressImage(file, 1400, 0.8)));
        const response = await fetch("/api/groq/pricing-images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ images }),
        });

        const payload = (await response.json()) as PricingImageExtractionResponse;
        if (!response.ok) {
          throw new Error(payload.error || "No pude leer los precios desde la imagen.");
        }

        parsedImageRows = normalizeImageRows(payload.rows);
      }

      const rows = [...parsedTextRows, ...parsedImageRows];
      if (rows.length === 0) {
        throw new Error(
          "No encontré filas de precios. Pegá una lista o subí una captura donde se lean modelo y precio."
        );
      }

      setMatches(matchBulkPricingRowsToProducts(rows, products));
    } catch (analysisError) {
      setMatches([]);
      setError(getErrorMessage(analysisError, "No pude analizar la actualización masiva."));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (matchedRows.length === 0) {
      setError("No hay productos vinculados para actualizar.");
      return;
    }

    setApplying(true);
    setError(null);
    setSuccessMessage(null);

    let updatedCount = 0;
    const failures: string[] = [];

    for (const match of matchedRows) {
      const product = match.product;
      if (!product) continue;

      const { snapshot, error: pricingError } = buildProductPricingSnapshot({
        priceUsd: match.row.priceUsd ?? product.price_usd,
        priceArs: match.row.priceArs ?? product.price_ars,
        promoPriceArs:
          match.row.promoPriceArs != null ? match.row.promoPriceArs : product.promo_price_ars,
        usdRate: product.usd_rate,
        cuotasQty: product.cuotas_qty,
        bancarizadaInterest: product.bancarizada_interest,
        macroInterest: product.macro_interest,
      });

      if (!snapshot) {
        failures.push(`${product.product_name}: ${pricingError || "pricing invalid"}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update({
          price_usd: snapshot.priceUsd,
          price_ars: snapshot.priceArs,
          promo_price_ars: snapshot.promoPriceArs,
          usd_rate: snapshot.usdRate,
          cuotas_qty: snapshot.cuotasQty,
          bancarizada_interest: snapshot.bancarizadaInterest,
          macro_interest: snapshot.macroInterest,
          bancarizada_total: snapshot.bancarizadaTotal,
          bancarizada_cuota: snapshot.bancarizadaCuota,
          macro_total: snapshot.macroTotal,
          macro_cuota: snapshot.macroCuota,
        })
        .eq("id", product.id);

      if (updateError) {
        failures.push(`${product.product_name}: ${getErrorMessage(updateError, "DB error")}`);
        continue;
      }

      updatedCount += 1;
    }

    if (updatedCount > 0) {
      await onApplied();
      setSuccessMessage(
        failures.length > 0
          ? `Actualicé ${updatedCount} producto(s). ${failures.length} quedaron con error.`
          : `Actualicé ${updatedCount} producto(s).`
      );
    }

    if (failures.length > 0) {
      setError(failures.slice(0, 6).join(" | "));
    }

    setApplying(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk Pricing Update</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-2">
              <Label htmlFor="bulk-pricing-text">Pegá lista de productos y precios</Label>
              <textarea
                id="bulk-pricing-text"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder={`Samsung A56 5G 12+256 699999\niphone-16-promax-256gb-dorado-t-b93 | 2199999 | promo 2149999\nproduct_key,price_ars,promo_price_ars\nsamsung-s25-fe-8-512,1189000,1149000`}
                rows={10}
                className="min-h-[220px] w-full resize-y rounded-xl border bg-background px-3 py-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Acepta texto libre o columnas como `product_key`, `product_name`, `price_ars`,
                `price_usd`, `promo_price_ars`.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-pricing-images">O subí una captura de precios</Label>
                <Input
                  id="bulk-pricing-images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setImageFiles(Array.from(event.target.files || []))}
                />
                <p className="text-xs text-muted-foreground">
                  Podés subir una o más capturas. Voy a extraer filas con modelo y precio.
                </p>
              </div>

              {imagePreviewUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {imagePreviewUrls.map((preview) => (
                    <div
                      key={`${preview.name}-${preview.url}`}
                      className="overflow-hidden rounded-xl border bg-muted/30"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview.url}
                        alt={preview.name}
                        className="h-28 w-full object-cover"
                      />
                      <p className="truncate px-2 py-2 text-[11px] text-muted-foreground">
                        {preview.name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <ImageIcon className="h-5 w-5" />
                    Sin capturas cargadas
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                Las actualizaciones masivas dejan el precio de venta bajo control del catálogo y
                recalculan cuotas, promo y totales con los valores del producto.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void handleAnalyze()} disabled={analyzing}>
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analizar lista
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRawText("");
                setImageFiles([]);
                setMatches([]);
                setError(null);
                setSuccessMessage(null);
              }}
              disabled={analyzing || applying}
            >
              Limpiar
            </Button>
            {matches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{matches.length} fila(s)</Badge>
                <Badge variant="outline">{matchedRows.length} vinculada(s)</Badge>
                <Badge variant="outline">{unmatchedRows.length} sin match</Badge>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {successMessage}
            </div>
          ) : null}

          {matches.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                Reviso el match por `product_key` exacto primero y después por nombre/modelo. Si una fila no tiene match claro, no se actualiza.
              </div>

              <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-2xl border p-3">
                {matches.map((match, index) => (
                  <div
                    key={`${match.row.source}-${index}`}
                    className="rounded-xl border bg-background p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {match.product?.product_name || match.row.productName || match.row.productKey || "Fila sin nombre"}
                          </p>
                          <Badge variant={match.product ? "default" : "secondary"}>
                            {match.product ? match.reason : "Sin match"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{match.row.source}</p>
                        {match.product ? (
                          <p className="text-xs text-muted-foreground">
                            Match: {match.product.product_key} · score {match.score}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/20 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual ARS</p>
                          <p className="mt-1 font-medium">{formatArs(match.product?.price_ars)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nuevo ARS</p>
                          <p className="mt-1 font-medium">{formatArs(match.row.priceArs)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nuevo USD</p>
                          <p className="mt-1 font-medium">{formatUsd(match.row.priceUsd)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual Promo</p>
                          <p className="mt-1 font-medium">{formatArs(match.product?.promo_price_ars)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nueva Promo</p>
                          <p className="mt-1 font-medium">{formatArs(match.row.promoPriceArs)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={analyzing || applying}>
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying || analyzing || matchedRows.length === 0}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Aplicar precios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
