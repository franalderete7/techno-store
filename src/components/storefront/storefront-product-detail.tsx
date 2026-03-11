import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircleMore, PackageCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchStorefrontProductBySlug,
  getStorefrontImage,
  type StorefrontProduct,
} from "@/lib/storefront";

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
    product.network ? product.network.toUpperCase() : null,
    product.condition ? `Condicion ${product.condition}` : null,
  ].filter(Boolean);
}

export async function StorefrontProductDetail({ slug }: { slug: string }) {
  const product = await fetchStorefrontProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const image = getStorefrontImage(product);
  const specs = buildSpecs(product);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#06101e_0%,#020611_40%,#020611_100%)] text-white">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:px-10">
        <Button asChild variant="ghost" className="mb-6 -ml-3 text-white/70 hover:text-white">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Volver al catalogo
          </Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="aspect-square bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,6,23,0.95))]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={product.product_name} className="h-full w-full object-cover" />
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
                <Badge className="bg-white/10 text-white/75">
                  {product.in_stock ? "Entrega inmediata" : "Consultar disponibilidad"}
                </Badge>
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-white">
                {product.product_name}
              </h1>
              <p className="text-lg text-white/70">
                {product.category} · {product.product_key}
              </p>
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
              <p className="text-sm text-white/60">
                Bancarizada: {formatMoney(product.bancarizada_cuota)} por cuota · Macro:{" "}
                {formatMoney(product.macro_cuota)} por cuota
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {specs.map((spec) => (
                <div key={spec} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                  {spec}
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-5 w-5 text-sky-200" />
                <div>
                  <p className="font-medium text-white">Envio y seguimiento</p>
                  <p className="text-sm leading-6 text-white/65">
                    Coordinamos envio, pago y comprobante por privado para despachar lo
                    antes posible segun stock y ciudad.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <PackageCheck className="mt-0.5 h-5 w-5 text-sky-200" />
                <div>
                  <p className="font-medium text-white">Seguimiento privado</p>
                  <p className="text-sm leading-6 text-white/65">
                    Tracking y estado de la compra coordinados por mensaje privado.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="rounded-full bg-sky-300 text-black hover:bg-sky-200">
                <MessageCircleMore className="h-4 w-4" />
                Consultar compra por privado
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10">
                <Link href="/admin/login">Panel admin</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
