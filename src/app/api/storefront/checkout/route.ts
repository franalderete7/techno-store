import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, StorefrontOrderItemInsert } from "@/types/database";
import {
  buildCustomerPhoneLookupCandidates,
  normalizeCustomerPhoneDigits,
} from "@/lib/customer-identity";
import {
  TRANSFER_ALIASES,
  buildStorefrontWhatsAppUrl,
  buildStorefrontDeliveryNotes,
  isValidCheckoutAddress,
  isValidCheckoutCity,
  isValidCheckoutEmail,
  isValidCheckoutName,
  isValidCheckoutPhone,
  isValidCheckoutProvince,
  isValidCheckoutZipCode,
} from "@/lib/storefront-checkout";
import { getStorefrontAvailabilityCode } from "@/lib/storefront-presenters";
import { getErrorMessage } from "@/lib/utils";

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
  phone?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  province?: string;
  deliveryInstructions?: string;
  items?: CheckoutItemInput[];
};

type CustomerLookupRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "manychat_id" | "whatsapp_wa_id" | "whatsapp_phone" | "phone"
>;

function getSupabaseRouteClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en el deployment.");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el deployment. Configurala en Vercel para poder guardar pedidos."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function formatCheckoutRouteError(error: unknown) {
  const message = getErrorMessage(error, "No se pudo guardar el pedido.").toLowerCase();

  if (
    (message.includes("storefront_orders") || message.includes("storefront_order_items")) &&
    (message.includes("does not exist") ||
      message.includes("storefront_order_items") ||
      message.includes("address") ||
      message.includes("zip_code") ||
      message.includes("city") ||
      message.includes("province") ||
      message.includes("phone") ||
      message.includes("phone_normalized") ||
      message.includes("customer_id") ||
      message.includes("manychat_id") ||
      message.includes("whatsapp_wa_id") ||
      message.includes("whatsapp_phone") ||
      message.includes("status") ||
      message.includes("whatsapp_handoff_token") ||
      message.includes("whatsapp_handoff_started_at") ||
      message.includes("source_channel") ||
      message.includes("delivery_instructions") ||
      message.includes("could not find the table") ||
      message.includes("relation") ||
      message.includes("schema cache"))
  ) {
    return "Falta actualizar la estructura de pedidos. Ejecutá `supabase/storefront_checkout.sql`, `supabase/storefront_checkout_delivery_fields.sql`, `supabase/storefront_order_items.sql`, `supabase/storefront_order_customer_identity.sql` y `supabase/storefront_order_whatsapp_handoff.sql` en Supabase.";
  }

  if (
    message.includes("storefront_orders_email_check") ||
    message.includes("email") ||
    message.includes("violates check constraint")
  ) {
    return "El email ingresado no es válido. Probá con otro formato (ej: nombre@dominio.com).";
  }

  if (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed")
  ) {
    return "Supabase está rechazando el guardado del pedido. Revisá la service role key o las políticas de la tabla `storefront_orders`.";
  }

  if (message.includes("service_role") || message.includes("supabase_service_role_key")) {
    return "Falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel para guardar pedidos.";
  }

  return getErrorMessage(error, "No se pudo guardar el pedido.");
}

function generateStorefrontOrderHandoffToken() {
  return randomBytes(9).toString("base64url");
}

function buildStorefrontOrderHandoffMessage(orderId: number, token: string, firstName: string) {
  const shortName = String(firstName || "").trim() || "amigo";
  return `Hola TechnoStore, quiero continuar mi pedido web #${orderId} token ${token}. Soy ${shortName}.`;
}

function scoreCustomerPhoneMatch(customer: CustomerLookupRow, normalizedPhone: string) {
  if (!normalizedPhone) return 0;

  const waIdDigits = normalizeCustomerPhoneDigits(customer.whatsapp_wa_id);
  const manychatDigits = normalizeCustomerPhoneDigits(customer.manychat_id);
  const whatsappPhoneDigits = normalizeCustomerPhoneDigits(customer.whatsapp_phone);
  const phoneDigits = normalizeCustomerPhoneDigits(customer.phone);

  if (waIdDigits === normalizedPhone) return 120;
  if (manychatDigits === normalizedPhone) return 110;
  if (whatsappPhoneDigits === normalizedPhone) return 100;
  if (phoneDigits === normalizedPhone) return 90;
  if (waIdDigits.endsWith(normalizedPhone)) return 70;
  if (manychatDigits.endsWith(normalizedPhone)) return 60;
  if (whatsappPhoneDigits.endsWith(normalizedPhone)) return 50;
  if (phoneDigits.endsWith(normalizedPhone)) return 40;

  return 0;
}

async function findCustomerByCheckoutPhone(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  phone: string
) {
  const candidates = buildCustomerPhoneLookupCandidates(phone);
  const normalizedPhone = normalizeCustomerPhoneDigits(phone);

  if (!normalizedPhone || candidates.length === 0) {
    return null;
  }

  const columns: Array<keyof Pick<CustomerLookupRow, "manychat_id" | "whatsapp_wa_id" | "whatsapp_phone" | "phone">> = [
    "whatsapp_wa_id",
    "manychat_id",
    "whatsapp_phone",
    "phone",
  ];

  const matches: CustomerLookupRow[] = [];

  for (const column of columns) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,manychat_id,whatsapp_wa_id,whatsapp_phone,phone")
      .in(column, candidates)
      .limit(10);

    if (error) {
      throw error;
    }

    if (Array.isArray(data)) {
      matches.push(...(data as CustomerLookupRow[]));
    }
  }

  const deduped = Array.from(
    new Map(matches.map((row) => [row.id, row] as const)).values()
  );

  deduped.sort((left, right) => {
    const scoreDiff =
      scoreCustomerPhoneMatch(right, normalizedPhone) -
      scoreCustomerPhoneMatch(left, normalizedPhone);

    if (scoreDiff !== 0) return scoreDiff;

    return Number(right.id) - Number(left.id);
  });

  return deduped[0] || null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const zipCode = String(body.zipCode || "").trim();
    const city = String(body.city || "").trim();
    const province = String(body.province || "").trim();
    const deliveryInstructions = String(body.deliveryInstructions || "").trim();
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
    if (!isValidCheckoutPhone(phone)) {
      return NextResponse.json({ error: "WhatsApp o teléfono inválido." }, { status: 400 });
    }
    if (!isValidCheckoutAddress(address)) {
      return NextResponse.json({ error: "Dirección inválida." }, { status: 400 });
    }
    if (!isValidCheckoutZipCode(zipCode)) {
      return NextResponse.json({ error: "Código postal inválido." }, { status: 400 });
    }
    if (!isValidCheckoutCity(city)) {
      return NextResponse.json({ error: "Ciudad inválida." }, { status: 400 });
    }
    if (!isValidCheckoutProvince(province)) {
      return NextResponse.json({ error: "Provincia inválida." }, { status: 400 });
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
    const matchedCustomer = await findCustomerByCheckoutPhone(supabase, phone);
    const normalizedPhone = normalizeCustomerPhoneDigits(phone);
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
          availability: getStorefrontAvailabilityCode(product),
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
    const handoffToken = generateStorefrontOrderHandoffToken();
    const orderNotes = buildStorefrontDeliveryNotes({
      phone,
      address,
      zipCode,
      city,
      province,
      deliveryInstructions,
    });

    const { data: insertedOrder, error: insertError } = await supabase
      .from("storefront_orders")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        phone_normalized: normalizedPhone,
        address,
        zip_code: zipCode,
        city,
        province,
        customer_id: matchedCustomer?.id ?? null,
        manychat_id: matchedCustomer?.manychat_id ?? null,
        whatsapp_wa_id: matchedCustomer?.whatsapp_wa_id ?? null,
        whatsapp_phone: matchedCustomer?.whatsapp_phone ?? null,
        source_channel: "storefront_web",
        status: "pending_whatsapp",
        whatsapp_handoff_token: handoffToken,
        delivery_instructions: deliveryInstructions || null,
        payment_method: "transferencia",
        currency: "ARS",
        subtotal,
        item_count: itemCount,
        items: orderItems,
        transfer_aliases: [...TRANSFER_ALIASES],
        notes: orderNotes,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    const orderItemRows: StorefrontOrderItemInsert[] = orderItems.map((item, index) => ({
      order_id: insertedOrder.id,
      sort_order: index,
      product_id: item.id,
      product_key: item.product_key,
      product_name: item.product_name,
      image_url: item.image_url,
      unit_price_ars: item.unit_price,
      quantity: item.quantity,
      line_total_ars: item.line_total,
      availability_code: item.availability,
    }));

    const { error: orderItemsError } = await supabase
      .from("storefront_order_items")
      .insert(orderItemRows);

    if (orderItemsError) {
      await supabase.from("storefront_orders").delete().eq("id", insertedOrder.id);
      throw orderItemsError;
    }

    return NextResponse.json({
      orderId: insertedOrder.id,
      subtotal,
      aliases: [...TRANSFER_ALIASES],
      whatsappUrl: buildStorefrontWhatsAppUrl(
        buildStorefrontOrderHandoffMessage(insertedOrder.id, handoffToken, firstName)
      ),
    });
  } catch (error) {
    console.error("storefront checkout error", error);
    const message = formatCheckoutRouteError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
