import type {
  Database,
  Financier as FinancierRow,
  Purchase as PurchaseRow,
  PurchaseFinancier as PurchaseFinancierRow,
  PurchasePaymentLeg as PurchasePaymentLegRow,
  PurchasePaymentLegInsert as PurchasePaymentLegInsertRow,
  PurchasePaymentLegUpdate as PurchasePaymentLegUpdateRow,
  PurchaseInsert as PurchaseInsertRow,
  StockUnit as StockUnitRow,
  StockUnitInsert as StockUnitInsertRow,
  StockUnitUpdate as StockUnitUpdateRow,
} from "@/types/database";

export type StockStatus = Database["public"]["Enums"]["stock_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type DatabasePaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentMethod = DatabasePaymentMethod;
export type ErrorSeverity = Database["public"]["Enums"]["error_severity"];
export type SaleCurrency = "ARS" | "USD";
export type PaymentCurrency = "ARS" | "USD" | "USDT" | "BTC";

export type StockUnit = StockUnitRow;
export type StockUnitInsert = StockUnitInsertRow;
export type StockUnitUpdate = StockUnitUpdateRow;

export type Financier = FinancierRow;
export type PurchaseFinancier = PurchaseFinancierRow;
export type PurchasePaymentLeg = PurchasePaymentLegRow;
export type PurchasePaymentLegInsert = PurchasePaymentLegInsertRow;
export type PurchasePaymentLegUpdate = PurchasePaymentLegUpdateRow;
export type Purchase = Omit<PurchaseRow, "payment_method"> & { payment_method: PaymentMethod | null };
export type PurchaseInsert = Omit<PurchaseInsertRow, "payment_method"> & {
  payment_method?: PaymentMethod | null;
};

export const STOCK_STATUS_OPTIONS: { value: StockStatus; label: string; color: string }[] = [
  { value: "in_stock", label: "In Stock", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "reserved", label: "Reserved", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "sold", label: "Sold", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "warranty", label: "Warranty", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "returned", label: "Returned", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "efectivo_ars", label: "Efectivo ARS" },
  { value: "efectivo_usd", label: "Efectivo USD" },
  { value: "crypto", label: "Crypto" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "usdt", label: "USDT" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "naranja", label: "Naranja" },
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "Amex" },
  { value: "cabal", label: "Cabal" },
  { value: "cuotas_bancarizada", label: "Cuotas Bancarizada" },
  { value: "cuotas_macro", label: "Cuotas Macro" },
  { value: "otro", label: "Otro" },
];

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
];
