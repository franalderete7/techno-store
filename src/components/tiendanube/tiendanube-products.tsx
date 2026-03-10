"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Globe, Loader2, PackageSearch, RefreshCcw, Store } from "lucide-react";

type TiendaNubeProduct = {
  id: string;
  name: string;
  handle: string;
  brand: string | null;
  published: boolean;
  free_shipping: boolean;
  requires_shipping: boolean;
  has_stock: boolean;
  image_url: string | null;
  variant_count: number;
  image_count: number;
  category_count: number;
  stock_total: number | null;
  has_untracked_stock: boolean;
  price_min: number | null;
  price_max: number | null;
  promo_price_min: number | null;
  sku_list: string[];
  description_text: string;
  seo_title_text: string;
  seo_description_text: string;
  canonical_url: string | null;
  video_url: string | null;
  tags: string | null;
  created_at: string | null;
  updated_at: string | null;
  primary_image_dimensions: string | null;
  mixed_image_sizes: boolean;
  image_audit: Array<{
    id: string | null;
    src: string | null;
    position: number | null;
    width: number | null;
    height: number | null;
    aspect_ratio: number | null;
    dimensions_label: string | null;
  }>;
  raw: Record<string, unknown>;
};

type TiendaNubeResponse = {
  fetched_at: string;
  store_id: string;
  summary: {
    total: number;
    published: number;
    draft: number;
    withStock: number;
    freeShipping: number;
  };
  products: TiendaNubeProduct[];
  error?: string;
};

type SyncResponse = {
  fetched_at: string;
  store_id: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ product: string; message: string }>;
  error?: string;
};

type NormalizeResponse = {
  fetched_at: string;
  store_id: string;
  processed: number;
  normalized_products: number;
  normalized_images: number;
  skipped: number;
  failed: number;
  target_width: number;
  target_height: number;
  target_background: string;
  errors: Array<{ product: string; message: string }>;
  error?: string;
};

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("es-AR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value === "" ? '""' : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const stringified = JSON.stringify(value, null, 2);
  return stringified ?? "undefined";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words whitespace-pre-wrap text-sm text-foreground">
        {stringifyValue(value)}
      </p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-background/80 shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="rounded-full border bg-background/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          JSON
        </span>
      </div>
      <div className="max-h-[440px] overflow-auto bg-slate-950/95 px-4 py-4">
        <pre className="min-w-full text-xs leading-6 text-slate-100">
          {stringifyValue(value)}
        </pre>
      </div>
    </section>
  );
}

export function TiendaNubeProducts() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TiendaNubeResponse | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TiendaNubeProduct | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
  const [normalizeResult, setNormalizeResult] = useState<NormalizeResponse | null>(null);

  async function load(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/tiendanube/products", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as TiendaNubeResponse & { error?: string };

      if (!response.ok) {
        throw new Error(body.error || "Failed to load Tienda Nube products");
      }

      setData(body);
      setError(null);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Unknown load error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function syncProducts() {
    setSyncing(true);

    try {
      const response = await fetch("/api/tiendanube/products", {
        method: "POST",
      });
      const body = (await response.json()) as SyncResponse;

      if (!response.ok) {
        throw new Error(body.error || "Failed to sync Tienda Nube products into Supabase");
      }

      setSyncResult(body);
      await load(true);
    } catch (syncError) {
      setSyncResult(null);
      setError(syncError instanceof Error ? syncError.message : "Unknown sync error");
    } finally {
      setSyncing(false);
    }
  }

  async function normalizeStorefrontImages(remoteProductIds?: string[]) {
    setNormalizing(true);

    try {
      const response = await fetch("/api/tiendanube/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "normalize_remote_images",
          remote_product_ids: remoteProductIds,
        }),
      });
      const body = (await response.json()) as NormalizeResponse;

      if (!response.ok) {
        throw new Error(body.error || "Failed to normalize Tienda Nube storefront images");
      }

      setNormalizeResult(body);
      await load(true);
    } catch (normalizeError) {
      setNormalizeResult(null);
      setError(
        normalizeError instanceof Error ? normalizeError.message : "Unknown normalization error"
      );
    } finally {
      setNormalizing(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const products = data?.products || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return products;

    return products.filter((product) =>
      [
        product.name,
        product.handle,
        product.brand || "",
        product.id,
        product.description_text,
        product.tags || "",
        ...product.sku_list,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [data?.products, query]);

  const fetchedAt = data?.fetched_at ? formatDate(data.fetched_at) : "—";

  return (
    <section className="space-y-4 p-4 sm:p-6">
      <div className="rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_24%)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Store className="h-4 w-4" />
              Tienda Nube
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Store products</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Full Tienda Nube product payload fetched from the server side. The details modal
                keeps null fields visible exactly as the API returns them.
              </p>
            </div>
          </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-[250px]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, SKU, handle, tags or brand"
              />
            </div>
            <Button type="button" onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button type="button" variant="outline" onClick={syncProducts} disabled={syncing || loading}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
              Sync into products
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => normalizeStorefrontImages(filteredProducts.map((product) => product.id))}
              disabled={normalizing || loading || filteredProducts.length === 0}
            >
              {normalizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Globe className="mr-2 h-4 w-4" />
              )}
              Normalize storefront images
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Store"
            value={data?.store_id || "—"}
            hint={`Last fetch ${fetchedAt}`}
          />
          <MetricCard
            label="Total"
            value={String(data?.summary.total || 0)}
            hint="Products fetched from Tienda Nube"
          />
          <MetricCard
            label="Published"
            value={String(data?.summary.published || 0)}
            hint="Visible on the store"
          />
          <MetricCard
            label="With Stock"
            value={String(data?.summary.withStock || 0)}
            hint="API has_stock or tracked/untracked stock"
          />
          <MetricCard
            label="Free Shipping"
            value={String(data?.summary.freeShipping || 0)}
            hint="Products marked with free shipping"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Sync keeps Tienda Nube metadata in local <code>products</code>. The normalization action
          replaces Tienda Nube storefront images with same-size processed copies, without touching
          your local canonical product image.
        </p>
      </div>

      {loading ? (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Tienda Nube products...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          {error}
          <div className="mt-2 text-xs">
            Required env vars: <code>TIENDANUBE_STORE_ID</code>, <code>TIENDANUBE_ACCESS_TOKEN</code>,
            and ideally <code>TIENDANUBE_USER_AGENT</code>.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {syncResult ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-emerald-800 dark:text-emerald-200">
                <span className="font-medium">Tienda Nube sync completed.</span>
                <span>{syncResult.processed} processed</span>
                <span>{syncResult.inserted} inserted</span>
                <span>{syncResult.updated} updated</span>
                <span>{syncResult.failed} failed</span>
              </div>
              {syncResult.errors.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-emerald-900/90 dark:text-emerald-100/90">
                  {syncResult.errors.slice(0, 5).map((entry) => (
                    <div key={`${entry.product}-${entry.message}`}>
                      {entry.product}: {entry.message}
                    </div>
                  ))}
                  {syncResult.errors.length > 5 ? (
                    <div>+{syncResult.errors.length - 5} more sync errors</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {normalizeResult ? (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-sky-900 dark:text-sky-100">
                <span className="font-medium">Storefront normalization completed.</span>
                <span>{normalizeResult.processed} processed</span>
                <span>{normalizeResult.normalized_products} products updated</span>
                <span>{normalizeResult.normalized_images} images normalized</span>
                <span>
                  target {normalizeResult.target_width}x{normalizeResult.target_height}
                </span>
              </div>
              {normalizeResult.errors.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-sky-950/90 dark:text-sky-50/90">
                  {normalizeResult.errors.slice(0, 5).map((entry) => (
                    <div key={`${entry.product}-${entry.message}`}>
                      {entry.product}: {entry.message}
                    </div>
                  ))}
                  {normalizeResult.errors.length > 5 ? (
                    <div>+{normalizeResult.errors.length - 5} more normalization errors</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm text-muted-foreground">
              <span>{filteredProducts.length} products shown</span>
              <span>Audit dimensions, canonical URLs and raw payload</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Image</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <PackageSearch className="h-5 w-5" />
                        <span>No Tienda Nube products matched this search.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="h-12 w-12 overflow-hidden rounded-xl border bg-muted">
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Globe className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{product.name}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>ID {product.id}</span>
                            {product.handle ? <span>/{product.handle}</span> : null}
                            {product.brand ? <span>{product.brand}</span> : null}
                            <span>{product.variant_count} variants</span>
                            <span>{product.image_count} images</span>
                          </div>
                          {product.sku_list.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {product.sku_list.slice(0, 3).map((sku) => (
                                <Badge key={sku} variant="secondary" className="text-[10px]">
                                  {sku}
                                </Badge>
                              ))}
                              {product.sku_list.length > 3 ? (
                                <Badge variant="outline" className="text-[10px]">
                                  +{product.sku_list.length - 3} more
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div>{product.primary_image_dimensions || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.image_count} imgs
                          </div>
                          {product.mixed_image_sizes ? (
                            <Badge variant="secondary">Mixed sizes</Badge>
                          ) : (
                            <Badge variant="outline">Consistent</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div>{formatMoney(product.price_min)}</div>
                          {product.price_max !== null && product.price_max !== product.price_min ? (
                            <div className="text-xs text-muted-foreground">
                              up to {formatMoney(product.price_max)}
                            </div>
                          ) : null}
                          {product.promo_price_min !== null ? (
                            <div className="text-xs text-emerald-600 dark:text-emerald-400">
                              promo {formatMoney(product.promo_price_min)}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {product.has_untracked_stock ? (
                            <Badge variant="secondary">Untracked</Badge>
                          ) : product.stock_total !== null ? (
                            <span>{product.stock_total}</span>
                          ) : (
                            <span>—</span>
                          )}
                          <div className="text-xs text-muted-foreground">
                            API has_stock: {product.has_stock ? "true" : "false"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={product.published ? "default" : "secondary"}>
                            {product.published ? "Published" : "Draft"}
                          </Badge>
                          {product.free_shipping ? <Badge variant="outline">Free shipping</Badge> : null}
                          {product.requires_shipping ? <Badge variant="outline">Ships</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(product.updated_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => normalizeStorefrontImages([product.id])}
                            disabled={normalizing}
                          >
                            Normalize
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedProduct(product)}>
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="grid h-[94vh] max-h-[94vh] max-w-[min(98vw,1680px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b bg-background px-6 py-5 text-left">
            <DialogTitle>{selectedProduct?.name || "Tienda Nube product"}</DialogTitle>
            <DialogDescription>
              Full product inspector with raw Tienda Nube payload. Null values stay visible here.
            </DialogDescription>
          </DialogHeader>

          {selectedProduct ? (
            <div className="min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_22%)] px-4 py-4 sm:px-6">
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant={selectedProduct.published ? "default" : "secondary"}>
                  {selectedProduct.published ? "Published" : "Draft"}
                </Badge>
                {selectedProduct.brand ? <Badge variant="outline">{selectedProduct.brand}</Badge> : null}
                <Badge variant="outline">ID {selectedProduct.id}</Badge>
                <Badge variant="outline">{selectedProduct.variant_count} variants</Badge>
                <Badge variant="outline">{selectedProduct.image_count} images</Badge>
                {selectedProduct.has_untracked_stock ? (
                  <Badge variant="secondary">Untracked stock</Badge>
                ) : null}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(460px,0.82fr)_minmax(0,1.18fr)]">
                <div className="space-y-4">
                  <section className="rounded-2xl border bg-background/80 p-4 shadow-sm">
                    <p className="text-sm font-medium text-foreground">Summary</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <DetailRow label="ID" value={selectedProduct.id} />
                      <DetailRow label="Handle" value={selectedProduct.handle || null} />
                      <DetailRow label="Brand" value={selectedProduct.brand} />
                      <DetailRow label="Published" value={selectedProduct.published} />
                      <DetailRow label="Free shipping" value={selectedProduct.free_shipping} />
                      <DetailRow label="Requires shipping" value={selectedProduct.requires_shipping} />
                      <DetailRow label="Has stock" value={selectedProduct.has_stock} />
                      <DetailRow label="Tracked stock total" value={selectedProduct.stock_total} />
                      <DetailRow label="Description" value={selectedProduct.description_text || null} />
                      <DetailRow label="Tags" value={selectedProduct.tags} />
                      <DetailRow label="Canonical URL" value={selectedProduct.canonical_url} />
                      <DetailRow label="Video URL" value={selectedProduct.video_url} />
                      <DetailRow
                        label="Primary dimensions"
                        value={selectedProduct.primary_image_dimensions}
                      />
                      <DetailRow label="Mixed image sizes" value={selectedProduct.mixed_image_sizes} />
                      <DetailRow label="Created at" value={selectedProduct.created_at} />
                      <DetailRow label="Updated at" value={selectedProduct.updated_at} />
                    </div>
                  </section>

                  <section className="rounded-2xl border bg-background/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Image audit</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Width, height and aspect ratio from the Tienda Nube API payload.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => normalizeStorefrontImages([selectedProduct.id])}
                        disabled={normalizing}
                      >
                        {normalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Normalize this product
                      </Button>
                    </div>

                    {selectedProduct.image_audit.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">No image metadata returned.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {selectedProduct.image_audit.map((image, index) => (
                          <div key={`${selectedProduct.id}-image-${image.id || index}`} className="rounded-xl border bg-muted/20 p-3">
                            <div className="flex items-start gap-3">
                              <div className="h-20 w-20 overflow-hidden rounded-xl border bg-background">
                                {image.src ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={image.src}
                                    alt={`${selectedProduct.name} ${index + 1}`}
                                    className="h-full w-full object-contain"
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1 text-sm">
                                <p className="font-medium text-foreground">
                                  Image {image.position || index + 1}
                                </p>
                                <p className="text-muted-foreground">
                                  {image.dimensions_label || "Unknown size"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  ratio {image.aspect_ratio ?? "—"}
                                </p>
                                {image.src ? (
                                  <a
                                    href={image.src}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex text-xs text-primary hover:underline"
                                  >
                                    Open source image
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <JsonBlock
                    title="Localized / SEO fields"
                    value={{
                      name: selectedProduct.raw.name ?? null,
                      description: selectedProduct.raw.description ?? null,
                      handle: selectedProduct.raw.handle ?? null,
                      seo_title: selectedProduct.raw.seo_title ?? null,
                      seo_description: selectedProduct.raw.seo_description ?? null,
                    }}
                  />

                  <JsonBlock title="Variants" value={selectedProduct.raw.variants ?? null} />
                  <JsonBlock title="Images" value={selectedProduct.raw.images ?? null} />
                </div>

                <div className="space-y-4">
                  <JsonBlock title="Attributes" value={selectedProduct.raw.attributes ?? null} />
                  <JsonBlock title="Categories" value={selectedProduct.raw.categories ?? null} />
                  <JsonBlock title="Raw API payload" value={selectedProduct.raw} />
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
