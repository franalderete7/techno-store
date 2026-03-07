export type StockStatus = "in_stock" | "reserved" | "sold" | "warranty" | "returned";
export type SaleStatus = "incomplete" | "confirmed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "partial";
export type ReservationStatus = "interested" | "pending_deposit" | "deposit_paid" | "cancelled" | "delivered";
export type PaymentMethod = "transferencia" | "efectivo_ars" | "efectivo_usd" | "crypto" | "tarjeta" | "cuotas_bancarizada" | "cuotas_macro" | "otro";
export type ErrorSeverity = "low" | "medium" | "high";

export interface StockUnit {
  id: number;
  imei1: string;
  imei2: string | null;
  product_key: string;
  purchase_id: string | null;
  supplier_name: string | null;
  cost_unit: number | null;
  cost_currency: string;
  date_received: string | null;
  status: StockStatus;
  reserved_for_phone: string | null;
  reserved_for_customer_id: number | null;
  reserved_until: string | null;
  reservation_id: number | null;
  sale_id: number | null;
  date_sold: string | null;
  price_sold: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockUnitInsert {
  imei1: string;
  imei2?: string | null;
  product_key: string;
  purchase_id?: string | null;
  supplier_name?: string | null;
  cost_unit?: number | null;
  cost_currency?: string;
  date_received?: string | null;
  status?: StockStatus;
  price_sold?: number | null;
  notes?: string | null;
}

export interface Purchase {
  id: number;
  purchase_id: string;
  date_purchase: string;
  supplier_name: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_cost: number | null;
  currency: string;
  funded_by: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseInsert {
  purchase_id?: string;
  date_purchase?: string;
  supplier_name: string;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  total_cost?: number | null;
  currency?: string;
  funded_by?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export interface Sale {
  id: number;
  date_sale: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_dni: string | null;
  payment_method: PaymentMethod;
  amount_total: number | null;
  currency: string;
  seller: string | null;
  channel: string;
  status: SaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: number;
  customer_id: number | null;
  manychat_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  product_key: string;
  requested_color: string | null;
  status: ReservationStatus;
  deposit_amount: number | null;
  deposit_date: string | null;
  deposit_method: PaymentMethod | null;
  balance_due: number | null;
  stock_unit_id: number | null;
  source: string;
  notes: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationInsert {
  customer_name?: string | null;
  customer_phone?: string | null;
  manychat_id?: string | null;
  product_key: string;
  requested_color?: string | null;
  status?: ReservationStatus;
  deposit_amount?: number | null;
  deposit_date?: string | null;
  deposit_method?: PaymentMethod | null;
  balance_due?: number | null;
  source?: string;
  notes?: string | null;
}

export const STOCK_STATUS_OPTIONS: { value: StockStatus; label: string; color: string }[] = [
  { value: "in_stock", label: "In Stock", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "reserved", label: "Reserved", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "sold", label: "Sold", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "warranty", label: "Warranty", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "returned", label: "Returned", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo_ars", label: "Efectivo ARS" },
  { value: "efectivo_usd", label: "Efectivo USD" },
  { value: "crypto", label: "Crypto" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "cuotas_bancarizada", label: "Cuotas Bancarizada" },
  { value: "cuotas_macro", label: "Cuotas Macro" },
  { value: "otro", label: "Otro" },
];

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
];

export const RESERVATION_STATUS_OPTIONS: { value: ReservationStatus; label: string; color: string }[] = [
  { value: "interested", label: "Interested", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "pending_deposit", label: "Pending Deposit", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "deposit_paid", label: "Deposit Paid", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "delivered", label: "Delivered", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
];
