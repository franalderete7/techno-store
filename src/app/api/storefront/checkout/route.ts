import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  TRANSFER_ALIASES,
  isValidCheckoutEmail,
  isValidCheckoutName,
} from "@/lib/storefront-checkout";

export const runtime = "nodejs";

type CheckoutItemInput = {
  id?: number;
  product_key?: string;
  quantity?: number;
};

type CheckoutBody = {
  firstName?: string;
  lastName?: string;
  email?: string;
  items?: CheckoutItemInput[];
};

function getSupabaseRouteClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !apiKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient<Database>(supabaseUrl, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!isValidCheckoutName(firstName)) {
      return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
    }
    if (!isValidCheckoutName(lastName)) {
      return NextResponse.json({ error: "Apellido inválido." }, { status: 400 });
    }
    if (!isValidCheckoutEmail(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "El carrito está vacío." }, { status: 400 });
    }

    const requestedItems = items
      .map((item) => ({
        id: Number(item.id),
        product_key: String(item.product_key || "").trim(),
        quantity: Math.max(1, Math.min(5, Number(item.quantity) || 1)),
      }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.product_key);

    if (requestedItems.length === 0) {
      return NextResponse.json({ error: "No pude validar los productos del carrito." }, { status: 400 });
    }

    const supabase = getSupabaseRouteClient();
    const productIds = [...new Set(requestedItems.map((item) => item.id))];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id,product_key,product_name,price_ars,promo_price_ars,image_url,in_stock,delivery_type")
      .in("id", productIds);

    if (productsError) {
      throw productsError;
    }

    const productMap = new Map(
      (products || []).map((product) => [Number(product.id), product])
    );

    const orderItems = requestedItems
      .map((item) => {
        const product = productMap.get(item.id);
        if (!product || String(product.product_key || "").trim() !== item.product_key) {
          return null;
        }

        const unitPrice = Number(product.promo_price_ars ?? product.price_ars ?? 0);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          return null;
        }

        return {
          id: Number(product.id),
          product_key: String(product.product_key || "").trim(),
          product_name: String(product.product_name || "").trim(),
          image_url: product.image_url || null,
          unit_price: unitPrice,
          quantity: item.quantity,
          line_total: unitPrice * item.quantity,
          availability: product.in_stock
            ? "in_stock"
            : product.delivery_type === "on_order"
              ? "on_order"
              : "consult",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: "No pude validar los precios del carrito." },
        { status: 400 }
      );
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.line_total, 0);
    const itemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);

    const { data: insertedOrder, error: insertError } = await supabase
      .from("storefront_orders")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        payment_method: "transferencia",
        currency: "ARS",
        subtotal,
        item_count: itemCount,
        items: orderItems,
        transfer_aliases: [...TRANSFER_ALIASES],
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      orderId: insertedOrder.id,
      subtotal,
      aliases: [...TRANSFER_ALIASES],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el pedido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
