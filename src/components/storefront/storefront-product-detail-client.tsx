"use client";

import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, PackageCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StorefrontProduct } from "@/lib/storefront";
import {
  getStorefrontAvailabilityTone,
  getStorefrontConditionLabel,
  getStorefrontConditionTone,
  getStorefrontDeliveryDaysLabel,
  getStorefrontDeliveryDaysTone,
  getStorefrontDeliveryTypeLabel,
  getStorefrontImage,
} from "@/lib/storefront-presenters";
import {
  StorefrontAddToCartButton,
  StorefrontFooter,
  StorefrontProductLink,
  StorefrontShell,
} from "@/components/storefront/storefront-shell";

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Consultar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildSpecs(product: StorefrontProduct) {
  return [
    product.ram_gb ? `${product.ram_gb}GB RAM` : null,
    product.storage_gb ? `${product.storage_gb}GB de memoria` : null,
    product.color ? `Color ${product.color}` : null,
    product.network ? product.network.toUpperCase() : null,
    product.battery_health ? `Batería ${product.battery_health}%` : null,
  ].filter(Boolean);
}

export function StorefrontProductDetailClient({ product }: { product: StorefrontProduct }) {
  const image = getStorefrontImage(product);
  const specs = buildSpecs(product);
  const deliveryLabel = getStorefrontDeliveryTypeLabel(product);
  const daysLabel = getStorefrontDeliveryDaysLabel(product);

  return (
    <StorefrontShell>
      <div className="min-h-screen bg-[linear-gradient(180deg,#06101e_0%,#020611_40%,#020611_100%)] text-white">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-24 sm:px-10">
          <Button asChild variant="ghost" className="mb-6 -ml-3 text-white/70 hover:text-white">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Volver al catálogo
            </Link>
          </Button>

          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
              <div className="aspect-square bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,6,23,0.95))]">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={product.product_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/45">
                    Sin imagen
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-7">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-sky-300/15 text-sky-200">{product.category}</Badge>
                  <Badge
                    className={[
                      "rounded-full border px-3 py-1 font-medium backdrop-blur",
                      getStorefrontConditionTone(product.condition),
                    ].join(" ")}
                  >
                    {getStorefrontConditionLabel(product.condition)}
                  </Badge>
                  <Badge
                    className={[
                      "rounded-full border px-3 py-1 font-medium backdrop-blur",
                      getStorefrontAvailabilityTone(product),
                    ].join(" ")}
                  >
                    {deliveryLabel}
                  </Badge>
                  {daysLabel ? (
                    <Badge
                      className={[
                        "rounded-full border px-3 py-1 font-medium backdrop-blur",
                        getStorefrontDeliveryDaysTone(product),
                      ].join(" ")}
                    >
                      {daysLabel}
                    </Badge>
                  ) : null}
                </div>
                <h1 className="text-4xl font-semibold tracking-tight text-white">
                  {product.product_name}
                </h1>
                <p className="text-lg text-white/70">
                  {product.category} · {product.product_key}
                </p>
                <StorefrontProductLink productKey={product.product_key} />
              </div>

              <div className="space-y-1">
                <p className="text-4xl font-semibold tracking-tight text-white">
                  {formatMoney(product.promo_price_ars ?? product.price_ars)}
                </p>
                {product.promo_price_ars ? (
                  <p className="text-base text-white/45 line-through">
                    {formatMoney(product.price_ars)}
                  </p>
                ) : null}
                <p className="text-sm text-white/60">Precio contado / transferencia bancaria.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {specs.map((spec) => (
                  <div
                    key={spec}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75"
                  >
                    {spec}
                  </div>
                ))}
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-start gap-3">
                  <BadgeDollarSign className="mt-0.5 h-5 w-5 text-sky-200" />
                  <div>
                    <p className="font-medium text-white">Pago por transferencia</p>
                    <p className="text-sm leading-6 text-white/65">
                      Al finalizar la compra te mostramos los alias para transferir y confirmar el pago.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-5 w-5 text-sky-200" />
                  <div>
                    <p className="font-medium text-white">Despacho rápido</p>
                    <p className="text-sm leading-6 text-white/65">
                      Al cargar el comprobante te contactamos por privado para coordinar el envío.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PackageCheck className="mt-0.5 h-5 w-5 text-sky-200" />
                  <div>
                    <p className="font-medium text-white">Seguimiento</p>
                    <p className="text-sm leading-6 text-white/65">
                      Todo el seguimiento se confirma por WhatsApp y email después de la compra.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <StorefrontAddToCartButton
                  product={product}
                  openCart
                  className="h-12 rounded-full bg-sky-300 px-6 text-slate-950 hover:bg-sky-200"
                >
                  Agregar al carrito
                </StorefrontAddToCartButton>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  <Link href="/">Seguir viendo equipos</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <StorefrontFooter className="pb-12" />
      </div>
    </StorefrontShell>
  );
}
