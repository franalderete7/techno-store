"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MapPin,
  Search,
  SlidersHorizontal,
  Store,
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
import type { StorefrontContext, StorefrontProduct } from "@/lib/storefront";
import {
  getStorefrontAvailabilityCode,
  getStorefrontAvailabilitySortWeight,
  getStorefrontAvailabilityTone,
  getStorefrontConditionLabel,
  getStorefrontConditionTone,
  getStorefrontDeliveryDaysLabel,
  getStorefrontDeliveryDaysTone,
  getStorefrontDeliveryTypeLabel,
  getStorefrontImage,
  getStorefrontSlug,
} from "@/lib/storefront-presenters";
import {
  StorefrontAddToCartButton,
  StorefrontFooter,
  StorefrontShell,
} from "@/components/storefront/storefront-shell";

type SortKey = "recommended" | "price-asc" | "price-desc" | "name-asc";
type AvailabilityFilter = "all" | "in-stock" | "on-order";
type PageItem = number | "ellipsis";

const PRODUCTS_PER_PAGE = 12;

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function getDisplayPrice(product: StorefrontProduct) {
  return product.promo_price_ars ?? product.price_ars;
}

function matchesAvailability(product: StorefrontProduct, filter: AvailabilityFilter) {
  const code = getStorefrontAvailabilityCode(product);

  if (filter === "all") return true;
  if (filter === "in-stock") return code === "immediate" || code === "pickup";
  return code === "on_order" || code === "scheduled";
}

function getVisiblePageItems(totalPages: number, currentPage: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: PageItem[] = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];
    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function FaqItem({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 bg-black/20 p-2 text-sky-200">
            {icon}
          </div>
          <p className="text-base font-medium text-white">{title}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-white/40 transition group-open:rotate-180" />
      </summary>
      <div className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-white/68">
        {children}
      </div>
    </details>
  );
}

export function StorefrontCatalogClient({
  products,
  storeContext,
}: {
  products: StorefrontProduct[];
  storeContext: StorefrontContext | null;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [currentPage, setCurrentPage] = useState(1);
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          products.map((product) => String(product.category || "").trim()).filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b)),
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
        getStorefrontConditionLabel(product.condition),
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

      const availabilityDelta =
        getStorefrontAvailabilitySortWeight(right) - getStorefrontAvailabilitySortWeight(left);
      if (availabilityDelta !== 0) {
        return availabilityDelta;
      }

      const leftPrice = Number(getDisplayPrice(left) || 0);
      const rightPrice = Number(getDisplayPrice(right) || 0);
      return leftPrice - rightPrice;
    });

    return filtered;
  }, [availability, category, deferredQuery, products, sortKey]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const pageItems = useMemo(
    () => getVisiblePageItems(totalPages, currentPage),
    [currentPage, totalPages]
  );
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [currentPage, filteredProducts]);
  const pageStart = filteredProducts.length === 0 ? 0 : (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length);
  const productCountLabel =
    filteredProducts.length === 1 ? "1 equipo" : `${filteredProducts.length} equipos`;
  const paginationLabel = totalPages === 1 ? "1 página" : `${totalPages} páginas`;

  const displayAddress = storeContext?.store_address?.trim() || "Caseros 1365, Salta Capital";
  const displayLocationName = storeContext?.store_location_name?.trim() || "TechnoStore Salta";
  const displayHours = storeContext?.store_hours?.trim() || "Lun-Vie 10-13 y 18-21 · Sáb 10-13";
  const displayPaymentMethods =
    storeContext?.store_payment_methods?.trim() ||
    "Transferencia bancaria, efectivo, Mercado Pago y tarjetas seleccionadas.";
  const displayCreditPolicy =
    storeContext?.store_credit_policy?.trim() || "Consultanos por cuotas y medios habilitados.";
  const displayShippingPolicy =
    storeContext?.store_shipping_policy?.trim() ||
    "Coordinamos envíos y seguimiento por privado para despachar la compra rápido.";
  const displayInstagram =
    storeContext?.store_social_instagram?.trim() || "@technostore.salta";
  const featuredCategories = categories.slice(0, 6);

  useEffect(() => {
    setCurrentPage(1);
  }, [availability, category, deferredQuery, sortKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <StorefrontShell>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,#07111d_0%,#020611_40%,#020611_100%)] text-white">
        <section className="mx-auto max-w-7xl px-6 pb-6 pt-32 sm:px-10 sm:pt-36">
          <div className="rounded-[2.25rem] border border-white/10 bg-white/[0.05] p-7 shadow-[0_40px_120px_rgba(2,6,23,0.65)] backdrop-blur sm:p-9">
            <div className="flex flex-col items-center gap-4 text-center">
              <Image
                src="/logo-blanco-salta.png"
                alt="TechnoStore Salta"
                width={716}
                height={190}
                priority
                className="mx-auto h-auto w-full max-w-[360px] sm:max-w-[430px]"
              />
              <p className="text-sm uppercase tracking-[0.28em] text-sky-200/80 sm:text-[0.82rem]">
                {displayLocationName}
              </p>
            </div>
          </div>
        </section>

        <section id="catalogo" className="mx-auto max-w-7xl px-6 pb-24 sm:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3">
              <div className="relative min-w-0 w-full max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar iPhone, Samsung, 256GB..."
                  className="h-11 w-full rounded-xl border-white/10 bg-black/30 pl-11 text-white placeholder:text-white/30"
                />
              </div>
              <div className="flex min-w-0 w-full flex-wrap justify-center gap-3">
                <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-11 w-full cursor-pointer rounded-xl border-white/10 bg-black/30 px-4 text-white">
                      <SelectValue placeholder="Categorías" />
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
                </div>
                <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
                  <Select
                    value={availability}
                    onValueChange={(value) => setAvailability(value as AvailabilityFilter)}
                  >
                    <SelectTrigger className="h-11 w-full cursor-pointer rounded-xl border-white/10 bg-black/30 px-4 text-white">
                      <SelectValue placeholder="Disponibilidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Disponibilidad</SelectItem>
                      <SelectItem value="in-stock">Disponible ahora</SelectItem>
                      <SelectItem value="on-order">A pedido / programado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
                  <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                    <SelectTrigger className="h-11 w-full cursor-pointer rounded-xl border-white/10 bg-black/30 px-4 text-white">
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

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-white/55">
            <p>
              {filteredProducts.length === 0
                ? "Sin resultados para estos filtros"
                : `Mostrando ${pageStart}-${pageEnd} de ${productCountLabel}`}
            </p>
            <p>{paginationLabel}</p>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="mt-6 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center text-white/65">
              <p className="text-xl font-medium text-white">No encontré equipos con ese filtro</p>
              <p className="mt-3 text-sm leading-6">
                Probá con otra marca, liberá la búsqueda o cambiá la disponibilidad.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {paginatedProducts.map((product) => {
                  const image = getStorefrontImage(product);
                  const slug = getStorefrontSlug(product);
                  const displayPrice = getDisplayPrice(product);
                  const deliveryLabel = getStorefrontDeliveryTypeLabel(product);
                  const daysLabel = getStorefrontDeliveryDaysLabel(product);

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
                                getStorefrontConditionTone(product.condition)
                              )}
                            >
                              {getStorefrontConditionLabel(product.condition)}
                            </Badge>
                            <Badge
                              className={cn(
                                "rounded-full border px-3 py-1 font-medium backdrop-blur",
                                getStorefrontAvailabilityTone(product)
                              )}
                            >
                              {deliveryLabel}
                            </Badge>
                            {daysLabel ? (
                              <Badge
                                className={cn(
                                  "rounded-full border px-3 py-1 font-medium backdrop-blur",
                                  getStorefrontDeliveryDaysTone(product)
                                )}
                              >
                                {daysLabel}
                              </Badge>
                            ) : null}
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
                          <p className="text-sm text-white/60">
                            Precio contado / transferencia bancaria.
                          </p>
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

              {totalPages > 1 ? (
                <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>

                  {pageItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span key={`ellipsis-${index}`} className="px-2 text-sm text-white/40">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={item}
                        type="button"
                        variant={item === currentPage ? "default" : "outline"}
                        className={cn(
                          "h-10 min-w-10 rounded-full px-4",
                          item === currentPage
                            ? "bg-sky-300 text-slate-950 hover:bg-sky-200"
                            : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        )}
                        onClick={() => handlePageChange(item)}
                      >
                        {item}
                      </Button>
                    )
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section id="faqs" className="mx-auto max-w-7xl px-6 pb-8 sm:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <h2 className="text-2xl font-semibold tracking-tight text-white">FAQs</h2>

            <div className="mt-6 space-y-4">
              <FaqItem title="Quiénes somos" icon={<Store className="h-4 w-4" />}>
                <p>
                  {displayLocationName} es una tienda de tecnología ubicada en Salta, Argentina.
                  Trabajamos con atención directa, equipos seleccionados y publicación clara de
                  condición, precio y tiempos de entrega.
                </p>
                <p className="mt-2">Atención por WhatsApp e Instagram: {displayInstagram}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {featuredCategories.map((entry) => (
                    <Badge
                      key={entry}
                      className="rounded-full border border-white/10 bg-white/[0.05] text-white/85"
                    >
                      {entry}
                    </Badge>
                  ))}
                </div>
              </FaqItem>

              <FaqItem title="Dónde estamos" icon={<MapPin className="h-4 w-4" />}>
                <p>{displayAddress}</p>
                <p className="mt-2">Horario de atención: {displayHours}</p>
              </FaqItem>

              <FaqItem title="Pagos y financiación" icon={<CreditCard className="h-4 w-4" />}>
                <p>{displayPaymentMethods}</p>
                <p className="mt-2">{displayCreditPolicy}</p>
              </FaqItem>

              <FaqItem title="Envíos y coordinación" icon={<Truck className="h-4 w-4" />}>
                <p>{displayShippingPolicy}</p>
              </FaqItem>
            </div>
          </div>
        </section>
        <StorefrontFooter />
      </div>
    </StorefrontShell>
  );
}
