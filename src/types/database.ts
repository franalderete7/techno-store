// Generated from the live Supabase PostgREST OpenAPI schema.
// Run `npm run db:types:pull` to refresh.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Enums: {
      error_severity: "low" | "medium" | "high";
      payment_method: "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro" | "mercado_pago" | "bitcoin" | "usdt" | "naranja" | "visa" | "mastercard" | "amex" | "cabal";
      payment_status: "pending" | "paid" | "partial";
      stock_status: "in_stock" | "reserved" | "sold" | "warranty" | "returned";
    };
    Tables: {
      "conversations": {
        Row: {
          "id": number;
          "customer_id": number | null;
          "manychat_id": string;
          "role": string;
          "message": string;
          "message_type": string | null;
          "intent_detected": string | null;
          "products_mentioned": string[] | null;
          "triggered_human": boolean | null;
          "was_audio": boolean | null;
          "audio_transcription": string | null;
          "created_at": string | null;
        };
        Insert: {
          "id"?: number | null;
          "customer_id"?: number | null;
          "manychat_id": string;
          "role": string;
          "message": string;
          "message_type"?: string | null;
          "intent_detected"?: string | null;
          "products_mentioned"?: string[] | null;
          "triggered_human"?: boolean | null;
          "was_audio"?: boolean | null;
          "audio_transcription"?: string | null;
          "created_at"?: string | null;
        };
        Update: {
          "id"?: number | null;
          "customer_id"?: number | null;
          "manychat_id"?: string | null;
          "role"?: string | null;
          "message"?: string | null;
          "message_type"?: string | null;
          "intent_detected"?: string | null;
          "products_mentioned"?: string[] | null;
          "triggered_human"?: boolean | null;
          "was_audio"?: boolean | null;
          "audio_transcription"?: string | null;
          "created_at"?: string | null;
        };
        Relationships: [];
      };
      "customers": {
        Row: {
          "id": number;
          "manychat_id": string;
          "phone": string | null;
          "first_name": string | null;
          "last_name": string | null;
          "timezone": string | null;
          "city": string | null;
          "is_salta_capital": boolean | null;
          "preferred_brand": string | null;
          "preferred_budget": string | null;
          "payment_preference": string | null;
          "interested_product": string | null;
          "funnel_stage": string | null;
          "lead_score": number | null;
          "tags": string[] | null;
          "total_interactions": number | null;
          "last_bot_interaction": string | null;
          "last_human_interaction": string | null;
          "human_assigned": boolean | null;
          "manychat_subscribed_at": string | null;
          "manychat_tags": string[] | null;
          "created_at": string | null;
          "updated_at": string | null;
          "whatsapp_phone": string | null;
          "payment_methods_mentioned": string[];
          "payment_method_last": string | null;
          "last_intent": string | null;
          "products_mentioned": string[];
          "location_source": string | null;
          "last_funnel_change_at": string | null;
          "phone_area_code": string | null;
          "phone_area_name": string | null;
          "phone_area_province": string | null;
        };
        Insert: {
          "id"?: number | null;
          "manychat_id": string;
          "phone"?: string | null;
          "first_name"?: string | null;
          "last_name"?: string | null;
          "timezone"?: string | null;
          "city"?: string | null;
          "is_salta_capital"?: boolean | null;
          "preferred_brand"?: string | null;
          "preferred_budget"?: string | null;
          "payment_preference"?: string | null;
          "interested_product"?: string | null;
          "funnel_stage"?: string | null;
          "lead_score"?: number | null;
          "tags"?: string[] | null;
          "total_interactions"?: number | null;
          "last_bot_interaction"?: string | null;
          "last_human_interaction"?: string | null;
          "human_assigned"?: boolean | null;
          "manychat_subscribed_at"?: string | null;
          "manychat_tags"?: string[] | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "whatsapp_phone"?: string | null;
          "payment_methods_mentioned": string[];
          "payment_method_last"?: string | null;
          "last_intent"?: string | null;
          "products_mentioned": string[];
          "location_source"?: string | null;
          "last_funnel_change_at"?: string | null;
          "phone_area_code"?: string | null;
          "phone_area_name"?: string | null;
          "phone_area_province"?: string | null;
        };
        Update: {
          "id"?: number | null;
          "manychat_id"?: string | null;
          "phone"?: string | null;
          "first_name"?: string | null;
          "last_name"?: string | null;
          "timezone"?: string | null;
          "city"?: string | null;
          "is_salta_capital"?: boolean | null;
          "preferred_brand"?: string | null;
          "preferred_budget"?: string | null;
          "payment_preference"?: string | null;
          "interested_product"?: string | null;
          "funnel_stage"?: string | null;
          "lead_score"?: number | null;
          "tags"?: string[] | null;
          "total_interactions"?: number | null;
          "last_bot_interaction"?: string | null;
          "last_human_interaction"?: string | null;
          "human_assigned"?: boolean | null;
          "manychat_subscribed_at"?: string | null;
          "manychat_tags"?: string[] | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "whatsapp_phone"?: string | null;
          "payment_methods_mentioned"?: string[] | null;
          "payment_method_last"?: string | null;
          "last_intent"?: string | null;
          "products_mentioned"?: string[] | null;
          "location_source"?: string | null;
          "last_funnel_change_at"?: string | null;
          "phone_area_code"?: string | null;
          "phone_area_name"?: string | null;
          "phone_area_province"?: string | null;
        };
        Relationships: [];
      };
      "products": {
        Row: {
          "id": number;
          "product_key": string;
          "category": string;
          "product_name": string;
          "cost_usd": number | null;
          "logistics_usd": number | null;
          "total_cost_usd": number | null;
          "margin_pct": number | null;
          "price_usd": number;
          "price_ars": number;
          "promo_price_ars": number | null;
          "bancarizada_total": number | null;
          "bancarizada_cuota": number | null;
          "bancarizada_interest": number | null;
          "macro_total": number | null;
          "macro_cuota": number | null;
          "macro_interest": number | null;
          "cuotas_qty": number | null;
          "in_stock": boolean | null;
          "delivery_type": string | null;
          "delivery_days": number | null;
          "usd_rate": number | null;
          "created_at": string | null;
          "updated_at": string | null;
          "ram_gb": number | null;
          "storage_gb": number | null;
          "network": string | null;
          "image_url": string | null;
          "condition": string;
          "pricing_source_stock_unit_id": number | null;
        };
        Insert: {
          "id"?: number | null;
          "product_key": string;
          "category": string;
          "product_name": string;
          "cost_usd"?: number | null;
          "logistics_usd"?: number | null;
          "total_cost_usd"?: number | null;
          "margin_pct"?: number | null;
          "price_usd": number;
          "price_ars": number;
          "promo_price_ars"?: number | null;
          "bancarizada_total"?: number | null;
          "bancarizada_cuota"?: number | null;
          "bancarizada_interest"?: number | null;
          "macro_total"?: number | null;
          "macro_cuota"?: number | null;
          "macro_interest"?: number | null;
          "cuotas_qty"?: number | null;
          "in_stock"?: boolean | null;
          "delivery_type"?: string | null;
          "delivery_days"?: number | null;
          "usd_rate"?: number | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "ram_gb"?: number | null;
          "storage_gb"?: number | null;
          "network"?: string | null;
          "image_url"?: string | null;
          "condition"?: string | null;
          "pricing_source_stock_unit_id"?: number | null;
        };
        Update: {
          "id"?: number | null;
          "product_key"?: string | null;
          "category"?: string | null;
          "product_name"?: string | null;
          "cost_usd"?: number | null;
          "logistics_usd"?: number | null;
          "total_cost_usd"?: number | null;
          "margin_pct"?: number | null;
          "price_usd"?: number | null;
          "price_ars"?: number | null;
          "promo_price_ars"?: number | null;
          "bancarizada_total"?: number | null;
          "bancarizada_cuota"?: number | null;
          "bancarizada_interest"?: number | null;
          "macro_total"?: number | null;
          "macro_cuota"?: number | null;
          "macro_interest"?: number | null;
          "cuotas_qty"?: number | null;
          "in_stock"?: boolean | null;
          "delivery_type"?: string | null;
          "delivery_days"?: number | null;
          "usd_rate"?: number | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "ram_gb"?: number | null;
          "storage_gb"?: number | null;
          "network"?: string | null;
          "image_url"?: string | null;
          "condition"?: string | null;
          "pricing_source_stock_unit_id"?: number | null;
        };
        Relationships: [];
      };
      "purchases": {
        Row: {
          "id": number;
          "purchase_id": string;
          "date_purchase": string;
          "supplier_name": string;
          "payment_method": "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro" | "mercado_pago" | "bitcoin" | "usdt" | "naranja" | "visa" | "mastercard" | "amex" | "cabal" | null;
          "payment_status": "pending" | "paid" | "partial" | null;
          "total_cost": number | null;
          "currency": string | null;
          "notes": string | null;
          "created_by": string | null;
          "created_at": string | null;
          "updated_at": string | null;
          "funded_by": string | null;
        };
        Insert: {
          "id"?: number | null;
          "purchase_id": string;
          "date_purchase"?: string | null;
          "supplier_name": string;
          "payment_method"?: "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro" | "mercado_pago" | "bitcoin" | "usdt" | "naranja" | "visa" | "mastercard" | "amex" | "cabal" | null;
          "payment_status"?: "pending" | "paid" | "partial" | null;
          "total_cost"?: number | null;
          "currency"?: string | null;
          "notes"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "funded_by"?: string | null;
        };
        Update: {
          "id"?: number | null;
          "purchase_id"?: string | null;
          "date_purchase"?: string | null;
          "supplier_name"?: string | null;
          "payment_method"?: "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro" | "mercado_pago" | "bitcoin" | "usdt" | "naranja" | "visa" | "mastercard" | "amex" | "cabal" | null;
          "payment_status"?: "pending" | "paid" | "partial" | null;
          "total_cost"?: number | null;
          "currency"?: string | null;
          "notes"?: string | null;
          "created_by"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "funded_by"?: string | null;
        };
        Relationships: [];
      };
      "stock_errors_log": {
        Row: {
          "id": number;
          "event": string;
          "severity": "low" | "medium" | "high";
          "error_code": string;
          "message": string | null;
          "payload": Json | null;
          "resolved": boolean | null;
          "resolved_at": string | null;
          "resolved_by": string | null;
          "created_at": string | null;
        };
        Insert: {
          "id"?: number | null;
          "event": string;
          "severity"?: "low" | "medium" | "high" | null;
          "error_code": string;
          "message"?: string | null;
          "payload"?: Json | null;
          "resolved"?: boolean | null;
          "resolved_at"?: string | null;
          "resolved_by"?: string | null;
          "created_at"?: string | null;
        };
        Update: {
          "id"?: number | null;
          "event"?: string | null;
          "severity"?: "low" | "medium" | "high" | null;
          "error_code"?: string | null;
          "message"?: string | null;
          "payload"?: Json | null;
          "resolved"?: boolean | null;
          "resolved_at"?: string | null;
          "resolved_by"?: string | null;
          "created_at"?: string | null;
        };
        Relationships: [];
      };
      "stock_units": {
        Row: {
          "id": number;
          "imei1": string;
          "imei2": string | null;
          "product_key": string;
          "purchase_id": string | null;
          "supplier_name": string | null;
          "cost_unit": number | null;
          "cost_currency": string | null;
          "date_received": string | null;
          "status": "in_stock" | "reserved" | "sold" | "warranty" | "returned";
          "date_sold": string | null;
          "notes": string | null;
          "created_at": string | null;
          "updated_at": string | null;
          "price_sold": number | null;
          "proof_image_urls": string[] | null;
          "color": string | null;
          "battery_health": number | null;
        };
        Insert: {
          "id"?: number | null;
          "imei1": string;
          "imei2"?: string | null;
          "product_key": string;
          "purchase_id"?: string | null;
          "supplier_name"?: string | null;
          "cost_unit"?: number | null;
          "cost_currency"?: string | null;
          "date_received"?: string | null;
          "status"?: "in_stock" | "reserved" | "sold" | "warranty" | "returned" | null;
          "date_sold"?: string | null;
          "notes"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "price_sold"?: number | null;
          "proof_image_urls"?: string[] | null;
          "color"?: string | null;
          "battery_health"?: number | null;
        };
        Update: {
          "id"?: number | null;
          "imei1"?: string | null;
          "imei2"?: string | null;
          "product_key"?: string | null;
          "purchase_id"?: string | null;
          "supplier_name"?: string | null;
          "cost_unit"?: number | null;
          "cost_currency"?: string | null;
          "date_received"?: string | null;
          "status"?: "in_stock" | "reserved" | "sold" | "warranty" | "returned" | null;
          "date_sold"?: string | null;
          "notes"?: string | null;
          "created_at"?: string | null;
          "updated_at"?: string | null;
          "price_sold"?: number | null;
          "proof_image_urls"?: string[] | null;
          "color"?: string | null;
          "battery_health"?: number | null;
        };
        Relationships: [];
      };
      "store_settings": {
        Row: {
          "key": string;
          "value": string;
          "description": string | null;
          "updated_at": string | null;
        };
        Insert: {
          "key"?: string | null;
          "value": string;
          "description"?: string | null;
          "updated_at"?: string | null;
        };
        Update: {
          "key"?: string | null;
          "value"?: string | null;
          "description"?: string | null;
          "updated_at"?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      "v_customer_context": {
        Row: {
          "id": number | null;
          "manychat_id": string | null;
          "phone": string | null;
          "whatsapp_phone": string | null;
          "first_name": string | null;
          "last_name": string | null;
          "timezone": string | null;
          "city": string | null;
          "is_salta_capital": boolean | null;
          "location_source": string | null;
          "phone_area_code": string | null;
          "phone_area_name": string | null;
          "phone_area_province": string | null;
          "preferred_brand": string | null;
          "preferred_budget": string | null;
          "payment_preference": string | null;
          "payment_method_last": string | null;
          "payment_methods_mentioned": string[] | null;
          "interested_product": string | null;
          "products_mentioned": string[] | null;
          "funnel_stage": string | null;
          "last_funnel_change_at": string | null;
          "last_intent": string | null;
          "lead_score": number | null;
          "tags": string[] | null;
          "total_interactions": number | null;
          "last_bot_interaction": string | null;
          "last_human_interaction": string | null;
          "human_assigned": boolean | null;
          "manychat_subscribed_at": string | null;
          "manychat_tags": string[] | null;
          "created_at": string | null;
          "updated_at": string | null;
        };
        Relationships: [];
      };
      "v_product_catalog": {
        Row: {
          "id": number | null;
          "product_key": string | null;
          "category": string | null;
          "product_name": string | null;
          "price_usd": number | null;
          "price_ars": number | null;
          "promo_price_ars": number | null;
          "bancarizada_total": number | null;
          "bancarizada_cuota": number | null;
          "macro_total": number | null;
          "macro_cuota": number | null;
          "cuotas_qty": number | null;
          "in_stock": boolean | null;
          "delivery_type": string | null;
          "delivery_days": number | null;
          "ram_gb": number | null;
          "storage_gb": number | null;
          "color": string | null;
          "network": string | null;
          "image_url": string | null;
          "battery_health": number | null;
          "condition": string | null;
        };
        Relationships: [];
      };
      "v_recent_conversations": {
        Row: {
          "id": number | null;
          "customer_id": number | null;
          "manychat_id": string | null;
          "role": string | null;
          "message": string | null;
          "message_type": string | null;
          "intent_detected": string | null;
          "products_mentioned": string[] | null;
          "triggered_human": boolean | null;
          "was_audio": boolean | null;
          "audio_transcription": string | null;
          "created_at": string | null;
        };
        Relationships: [];
      };
      "v_recent_purchases": {
        Row: {
          "id": number | null;
          "purchase_id": string | null;
          "date_purchase": string | null;
          "supplier_name": string | null;
          "payment_method": "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro" | "mercado_pago" | "bitcoin" | "usdt" | "naranja" | "visa" | "mastercard" | "amex" | "cabal" | null;
          "payment_status": "pending" | "paid" | "partial" | null;
          "total_cost": number | null;
          "currency": string | null;
          "notes": string | null;
          "created_by": string | null;
          "created_at": string | null;
          "unit_count": number | null;
        };
        Relationships: [];
      };
      "v_stock_summary": {
        Row: {
          "product_key": string | null;
          "product_name": string | null;
          "category": string | null;
          "price_ars": number | null;
          "promo_price_ars": number | null;
          "price_usd": number | null;
          "condition": string | null;
          "units_in_stock": number | null;
          "units_reserved": number | null;
          "units_sold": number | null;
          "total_units": number | null;
        };
        Relationships: [];
      };
      "v_store_context": {
        Row: {
          "store_address": string | null;
          "store_hours": string | null;
          "store_payment_methods": string | null;
          "store_credit_policy": string | null;
          "store_shipping_policy": string | null;
          "store_warranty_new": string | null;
          "store_warranty_used": string | null;
          "store_social_instagram": string | null;
          "store_social_facebook": string | null;
          "customer_cards_supported": string | null;
          "customer_cards_blocked": string | null;
          "customer_payment_mentions_supported": string | null;
          "store_financing_scope": string | null;
          "usd_to_ars": string | null;
        };
        Relationships: [];
      };
    };
    Functions: {};
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"];
export type ConversationUpdate = Database["public"]["Tables"]["conversations"]["Update"];

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type Purchase = Database["public"]["Tables"]["purchases"]["Row"];
export type PurchaseInsert = Database["public"]["Tables"]["purchases"]["Insert"];
export type PurchaseUpdate = Database["public"]["Tables"]["purchases"]["Update"];

export type StockErrorsLog = Database["public"]["Tables"]["stock_errors_log"]["Row"];
export type StockErrorsLogInsert = Database["public"]["Tables"]["stock_errors_log"]["Insert"];
export type StockErrorsLogUpdate = Database["public"]["Tables"]["stock_errors_log"]["Update"];

export type StockUnit = Database["public"]["Tables"]["stock_units"]["Row"];
export type StockUnitInsert = Database["public"]["Tables"]["stock_units"]["Insert"];
export type StockUnitUpdate = Database["public"]["Tables"]["stock_units"]["Update"];

export type StoreSetting = Database["public"]["Tables"]["store_settings"]["Row"];
export type StoreSettingInsert = Database["public"]["Tables"]["store_settings"]["Insert"];
export type StoreSettingUpdate = Database["public"]["Tables"]["store_settings"]["Update"];

export type VCustomerContext = Database["public"]["Views"]["v_customer_context"]["Row"];
export type VProductCatalog = Database["public"]["Views"]["v_product_catalog"]["Row"];
export type VRecentConversations = Database["public"]["Views"]["v_recent_conversations"]["Row"];
export type VRecentPurchases = Database["public"]["Views"]["v_recent_purchases"]["Row"];
export type VStockSummary = Database["public"]["Views"]["v_stock_summary"]["Row"];
export type VStoreContext = Database["public"]["Views"]["v_store_context"]["Row"];
