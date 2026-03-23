"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  Heart,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  buildStorefrontWhatsAppUrl,
  buildStorefrontProductUrl,
  isValidCheckoutAddress,
  isValidCheckoutCity,
  isValidCheckoutEmail,
  isValidCheckoutName,
  isValidCheckoutPhone,
  isValidCheckoutProvince,
  isValidCheckoutZipCode,
} from "@/lib/storefront-checkout";
import type { StorefrontProduct } from "@/lib/storefront";

const CART_STORAGE_KEY = "techno-store-public-cart-v1";
const STOREFRONT_WHATSAPP_URL = buildStorefrontWhatsAppUrl();

type CartLine = {
  id: number;
  product_key: string;
  product_name: string;
  category: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
};

type CheckoutResponse = {
  orderId: number;
  subtotal: number;
  aliases: string[];
  whatsappUrl?: string;
};

type CartPreview = {
  item: CartLine;
  totalQuantity: number;
  /** Full cart snapshot when the preview opens (all lines). */
  allItems: CartLine[];
  cartSubtotal: number;
};

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  isOpen: boolean;
  cartPreview: CartPreview | null;
  openCart: () => void;
  closeCart: () => void;
  addItem: (product: StorefrontProduct, options?: { openCart?: boolean }) => void;
  removeItem: (productKey: string) => void;
  updateQuantity: (productKey: string, quantity: number) => void;
  clearCart: () => void;
  dismissCartPreview: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function getProductUnitPrice(product: Pick<StorefrontProduct, "promo_price_ars" | "price_ars">) {
  return Number(product.promo_price_ars ?? product.price_ars ?? 0);
}

function toCartLine(product: StorefrontProduct): CartLine {
  return {
    id: product.id,
    product_key: product.product_key,
    product_name: product.product_name,
    category: product.category,
    image_url: product.image_url || null,
    unit_price: getProductUnitPrice(product),
    quantity: 1,
  };
}

function useProvideStorefrontCart(): CartContextValue {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [cartPreview, setCartPreview] = useState<CartPreview | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as CartLine[];
      if (!Array.isArray(parsed)) return;
      setItems(
        parsed
          .filter((item) => item && item.product_key && item.quantity > 0)
          .map((item) => ({
            ...item,
            quantity: Math.max(1, Math.min(5, Number(item.quantity) || 1)),
            unit_price: Number(item.unit_price) || 0,
          }))
      );
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [items]
  );
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  useEffect(() => {
    if (!cartPreview) return;
    const timeoutId = window.setTimeout(() => {
      setCartPreview(null);
    }, 6800);
    return () => window.clearTimeout(timeoutId);
  }, [cartPreview]);

  return {
    items,
    itemCount,
    subtotal,
    isOpen,
    cartPreview,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addItem: (product, options) => {
      let preview: CartPreview | null = null;
      setItems((current) => {
        const existing = current.find((item) => item.product_key === product.product_key);
        if (existing) {
          const next = current.map((item) =>
            item.product_key === product.product_key
              ? { ...item, quantity: Math.min(5, item.quantity + 1) }
              : item
          );
          const nextItem = next.find((item) => item.product_key === product.product_key) || null;
          if (nextItem) {
            const cartSubtotal = next.reduce(
              (sum, line) => sum + line.unit_price * line.quantity,
              0
            );
            preview = {
              item: nextItem,
              totalQuantity: nextItem.quantity,
              allItems: next,
              cartSubtotal,
            };
          }
          return next;
        }
        const nextItem = toCartLine(product);
        const next = [...current, nextItem];
        const cartSubtotal = next.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
        preview = {
          item: nextItem,
          totalQuantity: nextItem.quantity,
          allItems: next,
          cartSubtotal,
        };
        return next;
      });
      if (options?.openCart) {
        setCartPreview(null);
        setIsOpen(true);
      } else if (preview) {
        setCartPreview(preview);
      }
    },
    removeItem: (productKey) => {
      setItems((current) => current.filter((item) => item.product_key !== productKey));
      setCartPreview((current) => {
        if (!current) return current;
        if (current.item.product_key === productKey) return null;
        const allItems = current.allItems.filter((line) => line.product_key !== productKey);
        if (allItems.length === 0) return null;
        const cartSubtotal = allItems.reduce((s, line) => s + line.unit_price * line.quantity, 0);
        return { ...current, allItems, cartSubtotal };
      });
    },
    updateQuantity: (productKey, quantity) => {
      if (quantity <= 0) {
        setItems((current) => current.filter((item) => item.product_key !== productKey));
        setCartPreview((current) => {
          if (!current) return current;
          if (current.item.product_key === productKey) return null;
          const allItems = current.allItems.filter((line) => line.product_key !== productKey);
          if (allItems.length === 0) return null;
          const cartSubtotal = allItems.reduce((s, line) => s + line.unit_price * line.quantity, 0);
          return { ...current, allItems, cartSubtotal };
        });
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.product_key === productKey
            ? { ...item, quantity: Math.max(1, Math.min(5, quantity)) }
            : item
        )
      );
      setCartPreview((current) => {
        if (!current || current.item.product_key !== productKey) return current;
        const q = Math.max(1, Math.min(5, quantity));
        const allItems = current.allItems.map((line) =>
          line.product_key === productKey ? { ...line, quantity: q } : line
        );
        const cartSubtotal = allItems.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
        return {
          ...current,
          totalQuantity: q,
          item: { ...current.item, quantity: q },
          allItems,
          cartSubtotal,
        };
      });
    },
    clearCart: () => {
      setItems([]);
      setCartPreview(null);
    },
    dismissCartPreview: () => setCartPreview(null),
  };
}

export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useStorefrontCart must be used within StorefrontShell.");
  }
  return context;
}

function CartDrawer() {
  const { items, subtotal, isOpen, closeCart, removeItem, updateQuantity, clearCart } =
    useStorefrontCart();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<CheckoutResponse | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setError(null);
    setLoading(false);
    setSuccess(null);
  }, [isOpen]);

  const handleCheckout = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedAddress = address.trim();
    const normalizedZipCode = zipCode.trim();
    const normalizedCity = city.trim();
    const normalizedProvince = province.trim();
    const normalizedDeliveryInstructions = deliveryInstructions.trim();

    if (!isValidCheckoutName(normalizedFirstName)) {
      setError("Escribí un nombre válido.");
      return;
    }
    if (!isValidCheckoutName(normalizedLastName)) {
      setError("Escribí un apellido válido.");
      return;
    }
    if (!isValidCheckoutEmail(normalizedEmail)) {
      setError("Revisá el formato del email.");
      return;
    }
    if (!isValidCheckoutPhone(normalizedPhone)) {
      setError("Escribí un WhatsApp o teléfono válido.");
      return;
    }
    if (!isValidCheckoutAddress(normalizedAddress)) {
      setError("Escribí una dirección válida.");
      return;
    }
    if (!isValidCheckoutZipCode(normalizedZipCode)) {
      setError("Revisá el código postal.");
      return;
    }
    if (!isValidCheckoutCity(normalizedCity)) {
      setError("Escribí una ciudad válida.");
      return;
    }
    if (!isValidCheckoutProvince(normalizedProvince)) {
      setError("Escribí una provincia válida.");
      return;
    }
    if (items.length === 0) {
      setError("El carrito está vacío.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          address: normalizedAddress,
          zipCode: normalizedZipCode,
          city: normalizedCity,
          province: normalizedProvince,
          deliveryInstructions: normalizedDeliveryInstructions,
          items: items.map((item) => ({
            id: item.id,
            product_key: item.product_key,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = (await response.json()) as CheckoutResponse | { error?: string };
      if (!response.ok || !("orderId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "No se pudo guardar tu pedido ahora."
        );
      }

      setSuccess(payload);
      clearCart();
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setZipCode("");
      setCity("");
      setProvince("");
      setDeliveryInstructions("");
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError, "No se pudo guardar tu pedido ahora."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 cursor-pointer bg-slate-950/60 backdrop-blur-sm transition",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeCart}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-white/10 bg-[#05111f]/96 shadow-[0_30px_90px_rgba(2,6,23,0.85)] transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-300/80">Carrito</p>
            <h2 className="text-lg font-semibold text-white">
              {items.length > 0 ? `${items.length} producto(s)` : "Todavía está vacío"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeCart}
            className="cursor-pointer rounded-full border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {success ? (
            <div className="space-y-5">
              <div className="rounded-[1.75rem] border border-emerald-300/25 bg-emerald-300/10 p-5 text-emerald-50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" />
                  <div className="space-y-2">
                    <p className="font-semibold">Pedido recibido</p>
                    <p className="text-sm leading-6 text-emerald-50/85">
                      Guardamos tu pedido #{success.orderId}. Seguí por WhatsApp para recibir los
                      alias, mandar el comprobante y cerrar el envío.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-sm font-medium text-white">Total del pedido</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {formatMoney(success.subtotal)}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  El bot te va a pasar los alias correctos y te va a pedir el comprobante desde el
                  mismo chat.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/70">
                Cuando entres a WhatsApp, el mensaje ya sale preparado para que `v15` recupere el
                pedido exacto desde Supabase y siga la conversación con contexto.
              </div>

              <Button
                asChild
                className="h-12 w-full rounded-full bg-[#25D366] font-semibold text-[#08110c] hover:bg-[#39da78]"
              >
                <a
                  href={success.whatsappUrl || STOREFRONT_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  Continuar por WhatsApp
                </a>
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-white/65">
              <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-white/35" />
              <p className="text-lg font-medium text-white">Tu carrito está vacío</p>
              <p className="mt-2 text-sm leading-6">
                Elegí un equipo, agregalo acá y completá tus datos para avanzar con la compra por
                transferencia.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.product_key}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex gap-3">
                      <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white/5">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-white/40">
                            Sin imagen
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{item.product_name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/35">
                          {item.category}
                        </p>
                        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="text-sm text-white/55">
                            {formatMoney(item.unit_price)}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                          </p>
                          <p className="text-lg font-semibold tabular-nums text-white">
                            {formatMoney(item.unit_price * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_key, item.quantity - 1)}
                          className="cursor-pointer rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-6 text-center text-sm font-medium text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_key, item.quantity + 1)}
                          className="cursor-pointer rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.product_key)}
                        className="cursor-pointer inline-flex items-center gap-1 text-sm text-white/55 transition hover:text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between text-sm text-white/65">
                  <span>Total</span>
                  <span className="text-2xl font-semibold text-white">{formatMoney(subtotal)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  Pago únicamente por transferencia. Después de enviar el comprobante, seguimos el
                  contacto por privado.
                </p>
              </div>

              <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-sky-300/80">
                    Finalizar pedido
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    Completá tus datos y la dirección de entrega para continuar por WhatsApp y
                    dejar listo el seguimiento del pedido.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Nombre"
                    className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Apellido"
                    className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                </div>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                />
                  <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/[^\d+()\-\s]/g, ""))
                  }
                  placeholder="WhatsApp o teléfono"
                  className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                />
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Dirección"
                  className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    value={zipCode}
                    onChange={(event) => setZipCode(event.target.value)}
                    placeholder="Código postal"
                    className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                  <Input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Ciudad"
                    className="border-white/10 bg-black/20 text-white placeholder:text-white/30 sm:col-span-2"
                  />
                </div>
                <Input
                  value={province}
                  onChange={(event) => setProvince(event.target.value)}
                  placeholder="Provincia"
                  className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                />
                <textarea
                  value={deliveryInstructions}
                  onChange={(event) => setDeliveryInstructions(event.target.value)}
                  placeholder="Indicaciones de entrega (opcional)"
                  rows={3}
                  className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                {error ? (
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
                    {error}
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={loading}
                  onClick={handleCheckout}
                  className="h-12 w-full cursor-pointer rounded-full bg-sky-300 font-semibold text-slate-950 hover:bg-sky-200 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continuar por WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function StorefrontAddToCartButton({
  product,
  className,
  openCart = false,
  children,
}: {
  product: StorefrontProduct;
  className?: string;
  openCart?: boolean;
  children?: ReactNode;
}) {
  const { addItem } = useStorefrontCart();

  return (
    <Button
      type="button"
      className={cn("cursor-pointer", className)}
      onClick={() => addItem(product, { openCart })}
    >
      <ShoppingCart className="h-4 w-4" />
      {children ?? "Agregar"}
    </Button>
  );
}

function CartFloatingButton() {
  const { itemCount, openCart } = useStorefrontCart();
  const hasItems = itemCount > 0;

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={hasItems ? `Abrir carrito, ${itemCount} artículos` : "Abrir carrito"}
      className={cn(
        "fixed right-4 top-20 z-30 inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-[#07131f]/90 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_50px_rgba(2,6,23,0.6)] backdrop-blur transition hover:border-sky-300/40 hover:bg-[#0b1b2c] sm:right-6 sm:top-24",
        hasItems &&
          "border-sky-400/35 shadow-[0_18px_50px_rgba(56,189,248,0.18)] ring-2 ring-sky-400/20"
      )}
    >
      <div className="relative flex h-9 w-9 items-center justify-center">
        <span
          className={cn(
            "inline-flex will-change-transform",
            hasItems ? "storefront-cart-icon-bob-active" : "storefront-cart-icon-bob"
          )}
        >
          <span
            className={cn(
              "inline-flex will-change-transform",
              hasItems ? "storefront-cart-icon-spin-active" : "storefront-cart-icon-spin"
            )}
          >
            <ShoppingCart className="h-5 w-5 text-sky-200" aria-hidden />
          </span>
        </span>
        {hasItems ? (
          <span className="absolute -right-2 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sky-300 px-1.5 text-[11px] font-bold text-slate-950 shadow-[0_0_12px_rgba(56,189,248,0.55)]">
            {itemCount}
          </span>
        ) : null}
      </div>
      <span className="hidden sm:inline">Carrito</span>
    </button>
  );
}

function CartAddPreview() {
  const { cartPreview, dismissCartPreview, openCart } = useStorefrontCart();
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cartPreview) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!previewRef.current) return;
      if (previewRef.current.contains(event.target as Node)) return;
      dismissCartPreview();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissCartPreview();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [cartPreview, dismissCartPreview]);

  if (!cartPreview) return null;

  const lines = cartPreview.allItems ?? [cartPreview.item];
  const distinctCount = lines.length;
  const subtotal = cartPreview.cartSubtotal ?? lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-40 px-4 sm:top-28 sm:px-6">
      <div className="mx-auto flex max-w-7xl justify-end">
        <div
          ref={previewRef}
          className="pointer-events-auto w-full max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[1.6rem] border border-white/12 bg-[#08131f]/96 shadow-[0_28px_80px_rgba(2,6,23,0.6)] backdrop-blur duration-300 animate-in fade-in slide-in-from-top-3"
        >
          <div className="border-b border-white/10 bg-gradient-to-r from-emerald-500/10 via-transparent to-sky-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1.15rem] border border-emerald-400/30 bg-white/5 shadow-[0_0_24px_rgba(52,211,153,0.12)]">
                {cartPreview.item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cartPreview.item.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-white/40">
                    Sin imagen
                  </div>
                )}
                <span className="absolute bottom-1 right-1 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  ×{cartPreview.totalQuantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.26em] text-emerald-300/90">
                      Recién agregado
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-white">
                      {cartPreview.item.product_name}
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      {formatMoney(cartPreview.item.unit_price)} c/u · {cartPreview.totalQuantity}{" "}
                      {cartPreview.totalQuantity === 1 ? "unidad" : "unidades"} de este producto
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissCartPreview}
                    className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Cerrar vista previa del carrito"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                Tu carrito
              </p>
              <p className="text-xs font-medium text-white/70">
                {distinctCount} {distinctCount === 1 ? "producto" : "productos"}
              </p>
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {lines.map((line) => {
                const isAdded = line.product_key === cartPreview.item.product_key;
                return (
                  <div
                    key={line.product_key}
                    className={cn(
                      "shrink-0 rounded-xl border bg-black/25 p-1.5",
                      isAdded
                        ? "border-emerald-400/50 ring-1 ring-emerald-400/25"
                        : "border-white/10"
                    )}
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-white/5">
                      {line.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] text-white/35">
                          —
                        </div>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-950/90 px-1 text-[10px] font-bold text-white">
                        {line.quantity}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[3.5rem] truncate text-[10px] leading-tight text-white/60">
                      {line.product_name}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <span className="text-sm text-white/60">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums text-white">{formatMoney(subtotal)}</span>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => {
                  dismissCartPreview();
                  openCart();
                }}
                className="h-10 flex-1 rounded-full bg-sky-300 font-semibold text-slate-950 hover:bg-sky-200"
              >
                Ver carrito completo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={dismissCartPreview}
                className="h-10 rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"
              >
                Seguir comprando
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppFloatingButton() {
  return (
    <a
      href={STOREFRONT_WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Escribir por WhatsApp"
      className="fixed bottom-4 right-4 z-30 inline-flex cursor-pointer items-center gap-3 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-[#08110c] shadow-[0_20px_55px_rgba(37,211,102,0.35)] transition hover:scale-[1.02] hover:bg-[#3be27c] sm:bottom-6 sm:right-6"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}

function StorefrontNav() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(pathname !== "/");

  useEffect(() => {
    const alwaysVisible = pathname !== "/";

    const handleScroll = () => {
      if (alwaysVisible) {
        setVisible(true);
        return;
      }

      setVisible(window.scrollY > 48);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 px-4 sm:px-6">
      <div
        className={cn(
          "mx-auto max-w-7xl transition-all duration-300",
          visible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
        )}
      >
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-full border border-white/10 bg-[#061320]/88 px-4 py-3 shadow-[0_22px_60px_rgba(2,6,23,0.5)] backdrop-blur">
          <Link href="/" className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo-blanco-salta.png"
                alt="TechnoStore Salta"
                width={716}
                height={190}
                priority
                className="h-auto w-[132px] shrink-0 sm:w-[152px]"
              />
              <span className="hidden text-[10px] uppercase tracking-[0.28em] text-sky-300/80 sm:inline">
                Tienda oficial
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/#catalogo"
              className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
            >
              Catálogo
            </Link>
            <Link
              href="/#faqs"
              className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
            >
              FAQs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontShell({ children }: { children: ReactNode }) {
  const cart = useProvideStorefrontCart();

  return (
    <CartContext.Provider value={cart}>
      <StorefrontNav />
      {children}
      <WhatsAppFloatingButton />
      <CartFloatingButton />
      <CartAddPreview />
      <CartDrawer />
    </CartContext.Provider>
  );
}

export function StorefrontProductLink({
  productKey,
  className,
}: {
  productKey: string;
  className?: string;
}) {
  return (
    <a
      href={buildStorefrontProductUrl(productKey)}
      className={cn("cursor-pointer text-sm text-sky-200 underline-offset-4 hover:underline", className)}
    >
      Ver ficha del producto
    </a>
  );
}

export function StorefrontFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mx-auto max-w-7xl px-6 pb-10 text-center text-sm text-white/45 sm:px-10",
        className
      )}
    >
      <div className="inline-flex flex-col items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-5 py-4">
        <Image
          src="/una-tinta-blanco.png"
          alt="TechnoStore"
          width={1385}
          height={372}
          className="h-auto w-[132px] opacity-90"
        />
        <p className="inline-flex items-center gap-2 text-white/45">
          Made with <Heart className="h-4 w-4 fill-rose-400 text-rose-400" /> in Salta, Argentina
        </p>
      </div>
    </footer>
  );
}
