"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight,
  CreditCard,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StorefrontProduct } from "@/lib/storefront";
import { getStorefrontImage, getStorefrontSlug } from "@/lib/storefront-presenters";
import { StorefrontAddToCartButton, StorefrontShell } from "@/components/storefront/storefront-shell";

type SortKey = "recommended" | "price-asc" | "price-desc" | "name-asc";
type AvailabilityFilter = "all" | "in-stock" | "on-order";

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAvailabilityLabel(product: StorefrontProduct) {
  if (product.in_stock) return "Entrega inmediata";
  if (product.delivery_type === "on_order") return `A pedido ${product.delivery_days || 0} días`;
  return "Consultar disponibilidad";
}

function getAvailabilityTone(product: StorefrontProduct) {
  if (product.in_stock) {
    return "border-emerald-300/80 bg-emerald-300 text-emerald-950 shadow-[0_10px_30px_rgba(110,231,183,0.35)]";
  }
  if (product.delivery_type === "on_order") {
    return "border-amber-300/60 bg-amber-300 text-amber-950 shadow-[0_10px_28px_rgba(252,211,77,0.25)]";
  }
  return "border-white/20 bg-slate-200 text-slate-950";
}

function getDisplayPrice(product: StorefrontProduct) {
  return product.promo_price_ars ?? product.price_ars;
}

function matchesAvailability(product: StorefrontProduct, filter: AvailabilityFilter) {
  if (filter === "all") return true;
  if (filter === "in-stock") return product.in_stock === true;
  return product.delivery_type === "on_order";
}

export function StorefrontCatalogClient({ products }: { products: StorefrontProduct[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => String(product.category || "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const haystack = [
        product.product_name,
        product.product_key,
        product.category,
        product.color,
        product.network,
        product.condition,
        product.ram_gb ? `${product.ram_gb}gb ram` : "",
        product.storage_gb ? `${product.storage_gb}gb` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = normalizedQuery ? haystack.includes(normalizedQuery) : true;
      const matchesCategory =
        category === "all" ? true : String(product.category || "").trim() === category;

      return matchesQuery && matchesCategory && matchesAvailability(product, availability);
    });

    filtered.sort((left, right) => {
      if (sortKey === "price-asc") {
        return Number(getDisplayPrice(left) || 0) - Number(getDisplayPrice(right) || 0);
      }
      if (sortKey === "price-desc") {
        return Number(getDisplayPrice(right) || 0) - Number(getDisplayPrice(left) || 0);
      }
      if (sortKey === "name-asc") {
        return String(left.product_name || "").localeCompare(String(right.product_name || ""));
      }

      if (left.in_stock !== right.in_stock) {
        return left.in_stock ? -1 : 1;
      }

      const leftPrice = Number(getDisplayPrice(left) || 0);
      const rightPrice = Number(getDisplayPrice(right) || 0);
      return leftPrice - rightPrice;
    });

    return filtered;
  }, [availability, category, deferredQuery, products, sortKey]);

  return (
    <StorefrontShell>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,#07111d_0%,#020611_40%,#020611_100%)] text-white">
        <section className="mx-auto max-w-7xl px-6 pb-10 pt-24 sm:px-10">
          <div className="rounded-[2.25rem] border border-white/10 bg-white/[0.05] p-8 shadow-[0_40px_120px_rgba(2,6,23,0.65)] backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <Badge className="rounded-full border border-sky-300/40 bg-sky-300/15 px-3 py-1 text-sky-100">
                  Shop oficial
                </Badge>
                <div className="space-y-3">
                  <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                    TechnoStore Salta
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-white/72 sm:text-lg">
                    Elegí tu equipo, agregalo al carrito y dejá tus datos. La compra del
                    storefront se confirma por transferencia, y después te contactamos por email
                    para seguir el pago y el despacho.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <Truck className="mb-3 h-5 w-5 text-sky-200" />
                  <p className="text-sm font-medium text-white">Envío gratis a domicilio</p>
                  <p className="mt-1 text-sm text-white/60">
                    Despachamos apenas se acredita la transferencia.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <CreditCard className="mb-3 h-5 w-5 text-sky-200" />
                  <p className="text-sm font-medium text-white">Pago por transferencia</p>
                  <p className="mt-1 text-sm text-white/60">
                    Precio contado en pesos, igual al valor por transferencia bancaria.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <ShieldCheck className="mb-3 h-5 w-5 text-sky-200" />
                  <p className="text-sm font-medium text-white">Seguimiento privado</p>
                  <p className="mt-1 text-sm text-white/60">
                    Confirmamos todo por email para mover la compra rápido.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24 sm:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
              <div className="flex flex-col justify-center space-y-2">
                <p className="text-sm uppercase tracking-[0.24em] text-white/38">Catálogo</p>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {filteredProducts.length} equipos disponibles
                </h2>
                <p className="text-sm leading-6 text-white/58">
                  Buscá por modelo, filtrá por disponibilidad y ordená la lista para encontrar
                  rápido el equipo correcto.
                </p>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-3 lg:max-w-2xl lg:justify-end">
                <div className="relative min-w-0 flex-1 basis-full sm:basis-[calc(50%-0.375rem)] lg:basis-[min(280px,100%)]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar iPhone, Samsung, 256GB..."
                    className="h-11 w-full rounded-xl border-white/10 bg-black/30 pl-11 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap basis-full gap-3 sm:basis-auto sm:flex-initial">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-11 min-w-[120px] flex-1 rounded-xl border-white/10 bg-black/30 px-4 text-white sm:min-w-[140px] sm:flex-initial">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Categorías</SelectItem>
                      {categories.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {entry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={availability}
                    onValueChange={(value) => setAvailability(value as AvailabilityFilter)}
                  >
                    <SelectTrigger className="h-11 min-w-[120px] flex-1 rounded-xl border-white/10 bg-black/30 px-4 text-white sm:min-w-[140px] sm:flex-initial">
                      <SelectValue placeholder="Disponibilidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Disponibilidad</SelectItem>
                      <SelectItem value="in-stock">Entrega inmediata</SelectItem>
                      <SelectItem value="on-order">A pedido</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                    <SelectTrigger className="h-11 min-w-[120px] flex-1 rounded-xl border-white/10 bg-black/30 px-4 text-white sm:min-w-[140px] sm:flex-initial">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 shrink-0 text-white/45" />
                        <SelectValue placeholder="Ordenar" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Orden recomendado</SelectItem>
                      <SelectItem value="price-asc">Precio menor</SelectItem>
                      <SelectItem value="price-desc">Precio mayor</SelectItem>
                      <SelectItem value="name-asc">Nombre A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="mt-6 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center text-white/65">
              <p className="text-xl font-medium text-white">No encontré equipos con ese filtro</p>
              <p className="mt-3 text-sm leading-6">
                Probá con otra marca, liberá la búsqueda o cambiá la disponibilidad.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const image = getStorefrontImage(product);
                const slug = getStorefrontSlug(product);
                const displayPrice = getDisplayPrice(product);

                return (
                  <article
                    key={product.id}
                    className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] transition hover:-translate-y-1 hover:border-sky-300/40 hover:bg-white/[0.06]"
                  >
                    <Link href={`/productos/${slug}`} className="block">
                      <div className="relative aspect-square overflow-hidden bg-[linear-gradient(160deg,rgba(34,211,238,0.18),rgba(15,23,42,0.8))]">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt={product.product_name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-white/45">
                            Sin imagen
                          </div>
                        )}
                        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                          <Badge className="rounded-full border border-black/20 bg-black/70 text-white backdrop-blur">
                            {product.category}
                          </Badge>
                          <Badge
                            className={cn(
                              "rounded-full border px-3 py-1 font-medium backdrop-blur",
                              getAvailabilityTone(product)
                            )}
                          >
                            {getAvailabilityLabel(product)}
                          </Badge>
                        </div>
                      </div>
                    </Link>

                    <div className="space-y-4 p-6">
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold tracking-tight text-white">
                          {product.product_name}
                        </h3>
                        <p className="text-sm leading-6 text-white/60">
                          {[
                            product.ram_gb ? `${product.ram_gb}GB RAM` : null,
                            product.storage_gb ? `${product.storage_gb}GB` : null,
                            product.color || null,
                            product.network ? product.network.toUpperCase() : null,
                            product.condition,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-3xl font-semibold tracking-tight text-white">
                          {formatMoney(displayPrice)}
                        </p>
                        {product.promo_price_ars ? (
                          <p className="text-sm text-white/45 line-through">
                            {formatMoney(product.price_ars)}
                          </p>
                        ) : null}
                        <p className="text-sm text-white/60">Precio contado / transferencia bancaria.</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button
                          asChild
                          variant="outline"
                          className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Link href={`/productos/${slug}`}>
                            Ver detalle
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>

                        <StorefrontAddToCartButton
                          product={product}
                          className="rounded-full bg-sky-300 text-slate-950 hover:bg-sky-200"
                        >
                          Agregar
                        </StorefrontAddToCartButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </StorefrontShell>
  );
}
