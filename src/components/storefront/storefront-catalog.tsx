import Link from "next/link";
import { ArrowRight, CreditCard, MapPin, ShieldCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchStorefrontProducts, getStorefrontImage, getStorefrontSlug } from "@/lib/storefront";

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAvailability(inStock: boolean | null, deliveryType: string | null, deliveryDays: number | null) {
  if (inStock) return "Entrega inmediata";
  if (deliveryType === "on_order") return `A pedido ${deliveryDays || 0} dias`;
  return "Consultar disponibilidad";
}

export async function StorefrontCatalog() {
  const products = await fetchStorefrontProducts();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_36%),linear-gradient(180deg,#07111d_0%,#020611_40%,#020611_100%)] text-white">
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-12 sm:px-10">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_rgba(2,6,23,0.65)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge className="rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-sky-200">
                Catalogo publico
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                  TechnoStore Salta
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                  Catalogo publico conectado a Supabase. El panel interno queda protegido en
                  `/admin`, y desde aca solo se muestran productos, fotos, cuotas y
                  disponibilidad.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <Truck className="mb-3 h-5 w-5 text-sky-200" />
                <p className="text-sm font-medium text-white">Envio gratis a domicilio</p>
                <p className="mt-1 text-sm text-white/60">Coordinado por privado segun el producto y la ciudad.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <CreditCard className="mb-3 h-5 w-5 text-sky-200" />
                <p className="text-sm font-medium text-white">Pago online o presencial</p>
                <p className="mt-1 text-sm text-white/60">Transferencia, efectivo, Mercado Pago y cuotas.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-sky-200" />
                <p className="text-sm font-medium text-white">Seguimiento claro</p>
                <p className="mt-1 text-sm text-white/60">Tracking y coordinacion por email y WhatsApp.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 sm:px-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/40">Storefront</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {products.length} productos publicados o disponibles
            </h2>
          </div>
          <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
            <Link href="/admin/login">Entrar al admin</Link>
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const image = getStorefrontImage(product);
            const slug = getStorefrontSlug(product);
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
                      <Badge className="rounded-full bg-black/60 text-white backdrop-blur">
                        {product.category}
                      </Badge>
                      <Badge
                        className={`rounded-full ${
                          product.in_stock
                            ? "bg-emerald-400/15 text-emerald-200"
                            : "bg-amber-400/15 text-amber-200"
                        }`}
                      >
                        {formatAvailability(product.in_stock, product.delivery_type, product.delivery_days)}
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
                        product.network ? product.network.toUpperCase() : null,
                        product.condition,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-3xl font-semibold tracking-tight text-white">
                      {formatMoney(product.promo_price_ars ?? product.price_ars)}
                    </p>
                    {product.promo_price_ars ? (
                      <p className="text-sm text-white/45 line-through">
                        {formatMoney(product.price_ars)}
                      </p>
                    ) : null}
                    <p className="text-sm text-white/60">
                      Bancarizada: {formatMoney(product.bancarizada_cuota)} por cuota · Macro:{" "}
                      {formatMoney(product.macro_cuota)} por cuota
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-white/55">
                      <MapPin className="h-4 w-4 text-sky-200" />
                      Salta Capital
                    </div>
                    <Button
                      asChild
                      className="rounded-full bg-sky-300 text-black hover:bg-sky-200"
                    >
                      <Link href={`/productos/${slug}`}>
                        Ver detalle
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
