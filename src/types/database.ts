export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: number;
          product_key: string;
          category: string;
          product_name: string;
          cost_usd: number | null;
          logistics_usd: number | null;
          total_cost_usd: number | null;
          margin_pct: number | null;
          price_usd: number;
          price_ars: number;
          promo_price_ars: number | null;
          bancarizada_total: number | null;
          bancarizada_cuota: number | null;
          bancarizada_interest: number | null;
          macro_total: number | null;
          macro_cuota: number | null;
          macro_interest: number | null;
          cuotas_qty: number | null;
          in_stock: boolean | null;
          delivery_type: string | null;
          delivery_days: number | null;
          usd_rate: number | null;
          created_at: string | null;
          updated_at: string | null;
          ram_gb: number | null;
          storage_gb: number | null;
          color: string | null;
          network: string | null;
          image_url: string | null;
          battery_health: number | null;
          condition: string;
        };
        Insert: {
          id?: number;
          product_key: string;
          category: string;
          product_name: string;
          cost_usd?: number | null;
          logistics_usd?: number | null;
          total_cost_usd?: number | null;
          margin_pct?: number | null;
          price_usd: number;
          price_ars: number;
          promo_price_ars?: number | null;
          bancarizada_total?: number | null;
          bancarizada_cuota?: number | null;
          bancarizada_interest?: number | null;
          macro_total?: number | null;
          macro_cuota?: number | null;
          macro_interest?: number | null;
          cuotas_qty?: number | null;
          in_stock?: boolean | null;
          delivery_type?: string | null;
          delivery_days?: number | null;
          usd_rate?: number | null;
          ram_gb?: number | null;
          storage_gb?: number | null;
          color?: string | null;
          network?: string | null;
          image_url?: string | null;
          battery_health?: number | null;
          condition?: string;
        };
        Update: {
          id?: number;
          product_key?: string;
          category?: string;
          product_name?: string;
          cost_usd?: number | null;
          logistics_usd?: number | null;
          total_cost_usd?: number | null;
          margin_pct?: number | null;
          price_usd?: number;
          price_ars?: number;
          promo_price_ars?: number | null;
          bancarizada_total?: number | null;
          bancarizada_cuota?: number | null;
          bancarizada_interest?: number | null;
          macro_total?: number | null;
          macro_cuota?: number | null;
          macro_interest?: number | null;
          cuotas_qty?: number | null;
          in_stock?: boolean | null;
          delivery_type?: string | null;
          delivery_days?: number | null;
          usd_rate?: number | null;
          ram_gb?: number | null;
          storage_gb?: number | null;
          color?: string | null;
          network?: string | null;
          image_url?: string | null;
          battery_health?: number | null;
          condition?: string;
        };
      };
    };
  };
}

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
