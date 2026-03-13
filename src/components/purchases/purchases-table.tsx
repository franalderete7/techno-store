"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import {
  getErrorMessage,
  isMissingRelationError,
  isRowLevelSecurityError,
  parseOptionalNumber,
  parseOptionalText,
} from "@/lib/utils";
import type { Product, PurchaseInsert as DbPurchaseInsert } from "@/types/database";
import type {
  Financier,
  Purchase,
  PurchaseFinancier,
  PurchasePaymentLeg,
  PurchasePaymentLegInsert,
  StockUnit,
  StockUnitInsert,
  PaymentCurrency,
  PaymentMethod,
  PaymentStatus,
} from "@/types/stock";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS, STOCK_STATUS_OPTIONS } from "@/types/stock";
import {
  buildOwnershipShares,
  formatOwnershipSummary,
  getFinancierOptions,
  roundMoney,
  type OwnershipShareInput,
  validateOwnershipInputs,
} from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Search, Eye, PackagePlus, X } from "lucide-react";

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const colors: Record<PaymentStatus, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    partial: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  const labels: Record<PaymentStatus, string> = { pending: "Pending", paid: "Paid", partial: "Partial" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PurchaseDetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function formatPurchaseDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null) return "—";
  const prefix = currency === "ARS" ? "$" : "US$";
  return `${prefix}${value.toLocaleString("es-AR")}`;
}

const DEFAULT_PAYMENT_METHOD: PaymentMethod = "transferencia";
const DEFAULT_PAYMENT_STATUS: PaymentStatus = "pending";
const DEFAULT_CURRENCY = "USD";
const PAYMENT_LEG_CURRENCY_OPTIONS: { value: PaymentCurrency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "ARS", label: "ARS" },
  { value: "USDT", label: "USDT" },
  { value: "BTC", label: "BTC" },
];

type PurchasePaymentLegDraft = {
  id: number | null;
  financierId: number | null;
  paymentMethod: PaymentMethod;
  amount: string;
  currency: PaymentCurrency;
  fxRateToArs: string;
  paidAt: string;
  notes: string;
};

type NormalizedPurchasePaymentLeg = {
  id: number | null;
  financierId: number;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: PaymentCurrency;
  fxRateToArs: number | null;
  amountArs: number | null;
  paidAt: string | null;
  notes: string | null;
};

function normalizePaymentMethod(value: PaymentMethod | null | undefined): PaymentMethod {
  return value ?? DEFAULT_PAYMENT_METHOD;
}

function normalizePaymentStatus(value: PaymentStatus | null | undefined): PaymentStatus {
  return value ?? DEFAULT_PAYMENT_STATUS;
}

function normalizePaymentCurrency(value: string | null | undefined): PaymentCurrency {
  switch (value?.toUpperCase()) {
    case "ARS":
      return "ARS";
    case "USDT":
      return "USDT";
    case "BTC":
      return "BTC";
    default:
      return "USD";
  }
}

function formatPaymentMethodLabel(value: PaymentMethod | null | undefined) {
  const normalized = normalizePaymentMethod(value);
  const match = PAYMENT_METHOD_OPTIONS.find((option) => option.value === normalized);
  return match?.label ?? normalized.replace(/_/g, " ");
}

function formatPaymentLegAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  switch (normalizePaymentCurrency(currency)) {
    case "ARS":
      return `$${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    case "USD":
      return `US$${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    case "USDT":
      return `${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })} USDT`;
    case "BTC":
      return `${amount.toLocaleString("es-AR", { maximumFractionDigits: 8 })} BTC`;
  }
}

function resolvePaymentLegAmountArs(
  amount: number | null | undefined,
  currency: PaymentCurrency,
  fxRateToArs: number | null | undefined
) {
  if (amount == null || amount <= 0) return null;
  if (currency === "ARS") return amount;
  if (fxRateToArs == null || fxRateToArs <= 0) return null;
  return roundMoney(amount * fxRateToArs);
}

function validatePaymentLegDrafts(rows: PurchasePaymentLegDraft[]) {
  const normalized = rows
    .map((row) => {
      const amount = parseOptionalNumber(row.amount);
      const fxRateToArs = parseOptionalNumber(row.fxRateToArs);
      const currency = normalizePaymentCurrency(row.currency);

      return {
        id: row.id,
        financierId: row.financierId,
        paymentMethod: normalizePaymentMethod(row.paymentMethod),
        amount,
        currency,
        fxRateToArs,
        amountArs: resolvePaymentLegAmountArs(amount, currency, fxRateToArs),
        paidAt: parseOptionalText(row.paidAt),
        notes: parseOptionalText(row.notes),
      };
    })
    .filter((row) => row.amount != null || row.financierId != null || row.notes != null);

  return {
    rows: normalized,
    hasMissingFinancier: normalized.some((row) => row.financierId == null),
    hasInvalidAmount: normalized.some((row) => row.amount == null || row.amount <= 0),
    hasMissingFx: normalized.some(
      (row) => row.currency !== "ARS" && (row.fxRateToArs == null || row.fxRateToArs <= 0)
    ),
    totalAmountArs: normalized.reduce((sum, row) => sum + (row.amountArs ?? 0), 0),
  };
}

function handleOpenFromKeyboard(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}

function stopRowEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}


export function PurchasesTable() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [purchaseFinanciers, setPurchaseFinanciers] = useState<PurchaseFinancier[]>([]);
  const [purchasePaymentLegs, setPurchasePaymentLegs] = useState<PurchasePaymentLeg[]>([]);
  const [unitCounts, setUnitCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [ownershipTableReady, setOwnershipTableReady] = useState(true);
  const [paymentLegsTableReady, setPaymentLegsTableReady] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [deletePurchase, setDeletePurchase] = useState<Purchase | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [ownershipRows, setOwnershipRows] = useState<OwnershipShareInput[]>([{ financierId: null, sharePct: 100 }]);
  const [paymentLegRows, setPaymentLegRows] = useState<PurchasePaymentLegDraft[]>([]);

  // Detail view
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
  const [detailUnits, setDetailUnits] = useState<StockUnit[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add unit to purchase
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [addUnitPurchase, setAddUnitPurchase] = useState<Purchase | null>(null);
  const [unitForm, setUnitForm] = useState<Record<string, string>>({});

  const financierOptions = useMemo(() => getFinancierOptions(financiers), [financiers]);
  const financierMap = useMemo(
    () => new Map(financierOptions.map((financier) => [financier.id, financier])),
    [financierOptions]
  );
  const purchaseFinanciersByPurchaseId = useMemo(() => {
    const byPurchaseId = new Map<string, PurchaseFinancier[]>();
    purchaseFinanciers.forEach((share) => {
      const current = byPurchaseId.get(share.purchase_id) ?? [];
      current.push(share);
      byPurchaseId.set(share.purchase_id, current);
    });
    return byPurchaseId;
  }, [purchaseFinanciers]);
  const paymentLegsByPurchaseId = useMemo(() => {
    const byPurchaseId = new Map<string, PurchasePaymentLeg[]>();
    purchasePaymentLegs.forEach((leg) => {
      const current = byPurchaseId.get(leg.purchase_id) ?? [];
      current.push(leg);
      byPurchaseId.set(leg.purchase_id, current);
    });
    return byPurchaseId;
  }, [purchasePaymentLegs]);

  const resolveLegacyFinancierId = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    const normalized = trimmed.toLocaleLowerCase("es-AR");
    const matched = financierOptions.find(
      (financier) =>
        financier.display_name.toLocaleLowerCase("es-AR") === normalized ||
        financier.code.toLocaleLowerCase("es-AR") === normalized
    );

    return matched?.id ?? null;
  };

  const buildOwnershipDraft = (purchase?: Purchase | null): OwnershipShareInput[] => {
    if (!purchase) return [{ financierId: null, sharePct: 100 }];

    const shares = buildOwnershipShares(
      purchase,
      purchaseFinanciersByPurchaseId.get(purchase.purchase_id) ?? [],
      financierMap
    );

    return shares.map((share) => ({
      financierId: share.financierId ?? resolveLegacyFinancierId(share.label),
      sharePct: share.sharePct,
    }));
  };

  const buildPaymentLegDraft = (purchase?: Purchase | null): PurchasePaymentLegDraft[] => {
    if (purchase) {
      const existing = paymentLegsByPurchaseId.get(purchase.purchase_id) ?? [];
      if (existing.length > 0) {
        return existing.map((leg) => ({
          id: leg.id,
          financierId: leg.financier_id,
          paymentMethod: normalizePaymentMethod(leg.payment_method),
          amount: String(leg.amount),
          currency: normalizePaymentCurrency(leg.currency),
          fxRateToArs: leg.fx_rate_to_ars != null ? String(leg.fx_rate_to_ars) : "",
          paidAt: leg.paid_at ?? purchase.date_purchase,
          notes: leg.notes ?? "",
        }));
      }
    }

    const ownershipDraft = buildOwnershipDraft(purchase);
    const defaultFinancierId = ownershipDraft.length === 1 ? ownershipDraft[0].financierId : null;

    return [
      {
        id: null,
        financierId: defaultFinancierId,
        paymentMethod: normalizePaymentMethod(purchase?.payment_method),
        amount: purchase?.total_cost != null ? String(purchase.total_cost) : "",
        currency: normalizePaymentCurrency(purchase?.currency ?? DEFAULT_CURRENCY),
        fxRateToArs: "",
        paidAt: purchase?.date_purchase ?? new Date().toISOString().split("T")[0],
        notes: "",
      },
    ];
  };

  const getOwnershipSummary = (purchase: Purchase) =>
    formatOwnershipSummary(
      purchase,
      purchaseFinanciersByPurchaseId.get(purchase.purchase_id) ?? [],
      financierMap
    );

  const getPaymentSummary = (purchase: Purchase) => {
    const legs = paymentLegsByPurchaseId.get(purchase.purchase_id) ?? [];
    if (legs.length === 0) return formatPaymentMethodLabel(purchase.payment_method);

    if (legs.length === 1) {
      const leg = legs[0];
      return `${formatPaymentMethodLabel(leg.payment_method)} · ${formatPaymentLegAmount(leg.amount, leg.currency)}`;
    }

    const uniqueMethods = new Set(legs.map((leg) => formatPaymentMethodLabel(leg.payment_method)));
    if (uniqueMethods.size === 1) {
      const [method] = [...uniqueMethods];
      return `${method} · ${legs.length} legs`;
    }

    return `Mixed · ${legs.length} legs`;
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return purchases;
    const q = searchQuery.toLowerCase();
    return purchases.filter(
      (p) =>
        p.purchase_id.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q) ||
        getPaymentSummary(p).toLowerCase().includes(q) ||
        getOwnershipSummary(p).toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
    );
  }, [purchases, searchQuery, purchaseFinanciersByPurchaseId, paymentLegsByPurchaseId, financierMap]);

  const fetchAll = async () => {
    setLoading(true);
    const [purchRes, prodRes, countRes, financiersRes, purchaseFinanciersRes, purchasePaymentLegsRes] = await Promise.all([
      supabase.from("purchases").select("*").order("date_purchase", { ascending: false }),
      supabase.from("products").select("*").order("product_name"),
      supabase.from("stock_units").select("purchase_id"),
      supabase.from("financiers").select("*").eq("active", true).order("display_name"),
      supabase.from("purchase_financiers").select("*").order("purchase_id").order("id"),
      supabase.from("purchase_payment_legs").select("*").order("purchase_id").order("id"),
    ]);
    setPurchases((purchRes.data as Purchase[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);

    const counts = new Map<string, number>();
    ((countRes.data as { purchase_id: string | null }[]) ?? []).forEach((u) => {
      if (u.purchase_id) counts.set(u.purchase_id, (counts.get(u.purchase_id) ?? 0) + 1);
    });
    setUnitCounts(counts);

    const financiersError = financiersRes.error;
    const purchaseFinanciersError = purchaseFinanciersRes.error;
    const missingOwnershipTables =
      isMissingRelationError(financiersError, "financiers") ||
      isMissingRelationError(purchaseFinanciersError, "purchase_financiers");
    const missingPaymentLegsTable = isMissingRelationError(
      purchasePaymentLegsRes.error,
      "purchase_payment_legs"
    );

    setOwnershipTableReady(!missingOwnershipTables);
    setPaymentLegsTableReady(!missingPaymentLegsTable);
    setFinanciers((financiersRes.data as Financier[]) ?? []);
    setPurchaseFinanciers(
      missingOwnershipTables ? [] : ((purchaseFinanciersRes.data as PurchaseFinancier[]) ?? [])
    );
    setPurchasePaymentLegs(
      missingPaymentLegsTable ? [] : ((purchasePaymentLegsRes.data as PurchasePaymentLeg[]) ?? [])
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditingPurchase(null);
    setFormData({
      date_purchase: new Date().toISOString().split("T")[0],
      supplier_name: "",
      payment_method: "transferencia",
      payment_status: "pending",
      total_cost: "",
      currency: "USD",
      funded_by: "",
      notes: "",
      created_by: "",
    });
    setOwnershipRows([{ financierId: null, sharePct: 100 }]);
    setPaymentLegRows(buildPaymentLegDraft(null));
    setDialogOpen(true);
  };

  const openEdit = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      date_purchase: purchase.date_purchase,
      supplier_name: purchase.supplier_name,
      payment_method: normalizePaymentMethod(purchase.payment_method),
      payment_status: normalizePaymentStatus(purchase.payment_status),
      total_cost: purchase.total_cost != null ? String(purchase.total_cost) : "",
      currency: purchase.currency ?? DEFAULT_CURRENCY,
      funded_by: purchase.funded_by ?? "",
      notes: purchase.notes ?? "",
      created_by: purchase.created_by ?? "",
    });
    setOwnershipRows(buildOwnershipDraft(purchase));
    setPaymentLegRows(buildPaymentLegDraft(purchase));
    setDialogOpen(true);
  };

  const openDetail = async (purchase: Purchase) => {
    setDetailPurchase(purchase);
    setDetailUnits([]);
    setLoadingDetail(true);
    const { data } = await supabase
      .from("stock_units")
      .select("*")
      .eq("purchase_id", purchase.purchase_id)
      .order("created_at", { ascending: false });
    setDetailUnits((data as StockUnit[]) ?? []);
    setLoadingDetail(false);
  };

  const openAddUnit = (purchase: Purchase) => {
    setAddUnitPurchase(purchase);
    setUnitForm({
      imei1: "",
      imei2: "",
      product_key: "",
      color: "",
      battery_health: "",
      cost_unit: "",
      cost_currency: purchase.currency ?? "USD",
      notes: "",
    });
    setAddUnitOpen(true);
  };

  const addOwnershipRow = () => {
    setOwnershipRows((prev) => [...prev, { financierId: null, sharePct: 0 }]);
  };

  const updateOwnershipRow = (index: number, patch: Partial<OwnershipShareInput>) => {
    setOwnershipRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const removeOwnershipRow = (index: number) => {
    setOwnershipRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  const addPaymentLegRow = () => {
    setPaymentLegRows((prev) => [
      ...prev,
      {
        id: null,
        financierId: ownershipRows.length === 1 ? ownershipRows[0].financierId : null,
        paymentMethod: DEFAULT_PAYMENT_METHOD,
        amount: "",
        currency: normalizePaymentCurrency(formData.currency ?? DEFAULT_CURRENCY),
        fxRateToArs: "",
        paidAt: formData.date_purchase ?? new Date().toISOString().split("T")[0],
        notes: "",
      },
    ]);
  };

  const updatePaymentLegRow = (index: number, patch: Partial<PurchasePaymentLegDraft>) => {
    setPaymentLegRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if (patch.currency && normalizePaymentCurrency(patch.currency) === "ARS") {
          next.fxRateToArs = "";
        }
        return next;
      })
    );
  };

  const removePaymentLegRow = (index: number) => {
    setPaymentLegRows((prev) => {
      if (prev.length === 1) return prev.filter((_, rowIndex) => rowIndex !== index);
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  const handleSave = async () => {
    if (!formData.supplier_name?.trim()) {
      alert("Supplier is required.");
      return;
    }

    const paymentStatus = normalizePaymentStatus(formData.payment_status as PaymentStatus);

    const ownershipValidation = validateOwnershipInputs(ownershipRows);
    if (ownershipValidation.rows.length === 0 || ownershipValidation.hasMissingFinancier) {
      alert("Choose at least one financier for this purchase.");
      return;
    }
    if (ownershipValidation.hasDuplicates) {
      alert("Each financier should appear only once per purchase.");
      return;
    }
    if (ownershipValidation.hasNonPositiveShare) {
      alert("Every financier share must be greater than 0.");
      return;
    }
    if (Math.abs(ownershipValidation.totalPct - 100) > 0.01) {
      alert("Financier shares must total exactly 100%.");
      return;
    }
    if (!ownershipTableReady && ownershipValidation.rows.length > 1) {
      alert("Run supabase/serious_accounting_foundation.sql first to save split financing.");
      return;
    }

    const paymentLegValidation = validatePaymentLegDrafts(paymentLegRows);
    if (paymentLegsTableReady && paymentStatus !== "pending" && paymentLegValidation.rows.length === 0) {
      alert("Add at least one payment leg or set the purchase status to Pending.");
      return;
    }
    if (paymentLegsTableReady && paymentLegValidation.hasMissingFinancier) {
      alert("Every payment leg must be assigned to a financier.");
      return;
    }
    if (paymentLegsTableReady && paymentLegValidation.hasInvalidAmount) {
      alert("Every payment leg needs a valid amount greater than 0.");
      return;
    }
    if (paymentLegsTableReady && paymentLegValidation.hasMissingFx) {
      alert("Add an ARS FX rate for every non-ARS payment leg.");
      return;
    }

    const ownershipLabels = ownershipValidation.rows.map((row) => {
      const financier = financierMap.get(row.financierId ?? 0);
      return financier?.display_name ?? "Unknown financier";
    });
    const fundedBySummary =
      ownershipLabels.length === 1 ? ownershipLabels[0] : ownershipLabels.join(" · ");
    const resolvedPaymentMethod =
      paymentLegsTableReady && paymentLegValidation.rows.length > 0
        ? new Set(paymentLegValidation.rows.map((row) => row.paymentMethod)).size === 1
          ? paymentLegValidation.rows[0].paymentMethod
          : "otro"
        : (formData.payment_method as PaymentMethod) || DEFAULT_PAYMENT_METHOD;

    setSaving(true);
    const record: Record<string, unknown> = {
      date_purchase: formData.date_purchase || new Date().toISOString().split("T")[0],
      supplier_name: formData.supplier_name.trim(),
      payment_method: resolvedPaymentMethod,
      payment_status: paymentStatus,
      total_cost: formData.total_cost ? parseFloat(formData.total_cost) : null,
      currency: formData.currency || "USD",
      funded_by: fundedBySummary,
      notes: formData.notes?.trim() || null,
      created_by: formData.created_by?.trim() || null,
    };

    try {
      let savedPurchase: Purchase | null = editingPurchase;
      if (editingPurchase) {
        const { data, error } = await supabase
          .from("purchases")
          .update(record)
          .eq("id", editingPurchase.id)
          .select("*")
          .single();
        if (error) throw error;
        savedPurchase = data as Purchase;
      } else {
        // purchase_id is auto-generated by the database trigger
        const { data, error } = await supabase
          .from("purchases")
          .insert(record as unknown as DbPurchaseInsert)
          .select("*")
          .single();
        if (error) throw error;
        savedPurchase = data as Purchase;
      }

      if (savedPurchase && ownershipTableReady) {
        const purchaseId = savedPurchase.purchase_id;
        const { error: deleteOwnershipError } = await supabase
          .from("purchase_financiers")
          .delete()
          .eq("purchase_id", purchaseId);
        if (deleteOwnershipError) throw deleteOwnershipError;

        const ownershipInserts = ownershipValidation.rows.map((row) => ({
          purchase_id: purchaseId,
          financier_id: row.financierId as number,
          share_pct: row.sharePct,
        }));
        const { error: insertOwnershipError } = await supabase
          .from("purchase_financiers")
          .insert(ownershipInserts);
        if (insertOwnershipError) throw insertOwnershipError;
      }
      if (savedPurchase && paymentLegsTableReady) {
        const purchaseId = savedPurchase.purchase_id;
        const { error: deletePaymentLegsError } = await supabase
          .from("purchase_payment_legs")
          .delete()
          .eq("purchase_id", purchaseId);
        if (deletePaymentLegsError) throw deletePaymentLegsError;

        if (paymentLegValidation.rows.length > 0) {
          const paymentLegInserts: PurchasePaymentLegInsert[] = paymentLegValidation.rows.map(
            (row): PurchasePaymentLegInsert => ({
              purchase_id: purchaseId,
              financier_id: row.financierId as number,
              payment_method: row.paymentMethod,
              amount: row.amount as number,
              currency: row.currency,
              fx_rate_to_ars: row.fxRateToArs,
              amount_ars: row.amountArs,
              paid_at: row.paidAt,
              notes: row.notes,
            })
          );
          const { error: insertPaymentLegsError } = await supabase
            .from("purchase_payment_legs")
            .insert(paymentLegInserts);
          if (insertPaymentLegsError) throw insertPaymentLegsError;
        }
      }
      setDialogOpen(false);
      setEditingPurchase(null);
      setOwnershipRows([{ financierId: null, sharePct: 100 }]);
      setPaymentLegRows([]);
      fetchAll();
    } catch (err: unknown) {
      if (
        isMissingRelationError(err, "purchase_financiers") ||
        isMissingRelationError(err, "financiers") ||
        isMissingRelationError(err, "purchase_payment_legs")
      ) {
        alert("Database error: run supabase/serious_accounting_foundation.sql and supabase/purchase_payment_legs.sql in Supabase first.");
      } else if (isRowLevelSecurityError(err)) {
        alert("RLS blocked this purchase save. Run supabase/disable_all_public_rls.sql in Supabase or add an allow policy for purchases.");
      } else {
        alert(getErrorMessage(err, "Unexpected error saving purchase."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePurchase) return;
    if ((unitCounts.get(deletePurchase.purchase_id) ?? 0) > 0) {
      alert("This purchase still has linked stock units. Reassign or archive those units before deleting the purchase.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("purchases").delete().eq("id", deletePurchase.id);
    setSaving(false);
    if (error) {
      alert(getErrorMessage(error, "Unexpected error deleting purchase."));
      return;
    }
    setDeletePurchase(null);
    fetchAll();
  };

  const handleAddUnit = async () => {
    const imei1 = unitForm.imei1?.trim() ?? "";
    const imei2 = parseOptionalText(unitForm.imei2);
    const productKey = parseOptionalText(unitForm.product_key);

    if (!imei1 || !productKey || !addUnitPurchase) {
      alert("IMEI1 and Product are required.");
      return;
    }
    if (!/^\d{15}$/.test(imei1)) {
      alert("IMEI1 must be exactly 15 digits.");
      return;
    }
    if (imei2 && !/^\d{15}$/.test(imei2)) {
      alert("IMEI2 must be exactly 15 digits.");
      return;
    }
    setSaving(true);
    const record: StockUnitInsert = {
      imei1,
      imei2,
      product_key: productKey,
      color: parseOptionalText(unitForm.color),
      battery_health: parseOptionalNumber(unitForm.battery_health),
      purchase_id: addUnitPurchase.purchase_id,
      supplier_name: null,
      cost_unit: parseOptionalNumber(unitForm.cost_unit),
      cost_currency: parseOptionalText(unitForm.cost_currency) ?? "USD",
      date_received: addUnitPurchase.date_purchase,
      status: "in_stock",
      notes: parseOptionalText(unitForm.notes),
    };

    try {
      const { error } = await supabase.from("stock_units").insert(record);
      if (error) throw error;
      setAddUnitOpen(false);
      setAddUnitPurchase(null);
      fetchAll();
      if (detailPurchase?.purchase_id === addUnitPurchase.purchase_id) {
        openDetail(addUnitPurchase);
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Unexpected error adding stock unit.");
      if (
        (msg.includes("Could not find the 'color' column") || msg.includes("schema cache")) &&
        msg.includes("color")
      ) {
        alert("Database error: run the stock_units_color.sql migration in Supabase first.");
      } else if (
        (msg.includes("Could not find the 'battery_health' column") || msg.includes("schema cache")) &&
        msg.includes("battery_health")
      ) {
        alert("Database error: run the normalize_inventory_schema.sql migration in Supabase first.");
      } else if (msg.includes("valid_imei1")) {
        alert("Invalid IMEI1: must be exactly 15 digits.");
      } else if (msg.includes("duplicate key") || msg.includes("unique")) {
        alert("IMEI1 already exists in stock.");
      } else if (isRowLevelSecurityError(err)) {
        alert("RLS blocked this stock save. Run supabase/disable_all_public_rls.sql in Supabase or add an allow policy for stock_units.");
      } else {
        alert(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));
  const updateUnitForm = (key: string, value: string) => setUnitForm((prev) => ({ ...prev, [key]: value }));

  const productMap = useMemo(() => new Map(products.map((p) => [p.product_key, p])), [products]);
  const ownershipDraftValidation = useMemo(
    () => validateOwnershipInputs(ownershipRows),
    [ownershipRows]
  );
  const paymentLegDraftValidation = useMemo(
    () => validatePaymentLegDrafts(paymentLegRows),
    [paymentLegRows]
  );
  const detailPaymentLegs = useMemo(
    () => (detailPurchase ? paymentLegsByPurchaseId.get(detailPurchase.purchase_id) ?? [] : []),
    [detailPurchase, paymentLegsByPurchaseId]
  );

  return (
    <div className="min-h-screen bg-background px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">Purchases</h1>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Purchase</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        <div className="mb-3 sm:mb-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search purchase ID, supplier..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground sm:p-12">
            {purchases.length === 0 ? 'No purchases yet. Tap "New" to create one.' : "No purchases match the search."}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground sm:mb-3 sm:text-sm">
              Showing {filtered.length} of {purchases.length} purchases
            </p>

            {/* Mobile: Cards */}
            <div className="space-y-2 sm:hidden">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(p)}
                  onKeyDown={(event) => handleOpenFromKeyboard(event, () => openDetail(p))}
                  className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{p.purchase_id}</p>
                      <p className="mt-0.5 text-sm font-medium">{p.supplier_name}</p>
                    </div>
                    <PaymentStatusBadge status={normalizePaymentStatus(p.payment_status)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatPurchaseDate(p.date_purchase)}</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(p.total_cost, p.currency)}
                    </span>
                    <span>{getPaymentSummary(p)}</span>
                    <span>Funded: {getOwnershipSummary(p)}</span>
                    <span>
                      <Badge variant="secondary" className="text-[10px]">
                        {unitCounts.get(p.purchase_id) ?? 0} units
                      </Badge>
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1"
                      onClick={(event) => {
                        stopRowEvent(event);
                        openDetail(p);
                      }}
                    >
                      <Eye className="mr-1 h-3 w-3" /> View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={(event) => {
                        stopRowEvent(event);
                        openAddUnit(p);
                      }}
                    >
                      <PackagePlus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={(event) => {
                        stopRowEvent(event);
                        openEdit(p);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={(event) => {
                        stopRowEvent(event);
                        setDeletePurchase(p);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table */}
            <div className="hidden overflow-auto rounded-lg border sm:block" style={{ maxHeight: "calc(100vh - 16rem)" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 bg-background">Purchase ID</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Date</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Supplier</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Payment</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Total</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Funded By</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Units</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Notes</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => openDetail(p)}
                    >
                      <TableCell className="font-mono text-xs">{p.purchase_id}</TableCell>
                      <TableCell>{formatPurchaseDate(p.date_purchase)}</TableCell>
                      <TableCell className="font-medium">{p.supplier_name}</TableCell>
                      <TableCell className="text-xs">{getPaymentSummary(p)}</TableCell>
                      <TableCell><PaymentStatusBadge status={normalizePaymentStatus(p.payment_status)} /></TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatMoney(p.total_cost, p.currency)}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-sm">{getOwnershipSummary(p)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{unitCounts.get(p.purchase_id) ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">{p.notes ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View units"
                            onClick={(event) => {
                              stopRowEvent(event);
                              openDetail(p);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Add unit"
                            onClick={(event) => {
                              stopRowEvent(event);
                              openAddUnit(p);
                            }}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              stopRowEvent(event);
                              openEdit(p);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(event) => {
                              stopRowEvent(event);
                              setDeletePurchase(p);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Purchase Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditingPurchase(null);
            setOwnershipRows([{ financierId: null, sharePct: 100 }]);
            setPaymentLegRows([]);
          }
        }}
      >
        <DialogContent className="max-h-[95vh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingPurchase ? "Edit Purchase" : "New Purchase"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:gap-4">
            {editingPurchase && (
              <div className="rounded-md border bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">Purchase ID</p>
                <p className="font-mono text-sm font-medium">{editingPurchase.purchase_id}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date_purchase ?? ""}
                onChange={(e) => updateForm("date_purchase", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Input
                value={formData.supplier_name ?? ""}
                onChange={(e) => updateForm("supplier_name", e.target.value)}
                placeholder="Supplier name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!paymentLegsTableReady && (
                <div className="space-y-2">
                  <Label>Legacy Payment Method</Label>
                  <Select value={formData.payment_method ?? "transferencia"} onValueChange={(v) => updateForm("payment_method", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={formData.payment_status ?? "pending"} onValueChange={(v) => updateForm("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Purchase Total</Label>
                <Input
                  type="number"
                  value={formData.total_cost ?? ""}
                  onChange={(e) => updateForm("total_cost", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase Currency</Label>
                <Select value={formData.currency ?? "USD"} onValueChange={(v) => updateForm("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the supplier/base purchase cost, usually in USD. Actual supplier payments can be mixed below.
            </p>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Financing Ownership</Label>
                  <p className="text-xs text-muted-foreground">
                    Profit from all units in this purchase follows these ownership shares.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addOwnershipRow}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {!ownershipTableReady && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Run <span className="font-mono">supabase/serious_accounting_foundation.sql</span> to persist split financing professionally.
                </div>
              )}

              <div className="space-y-2">
                {ownershipRows.map((row, index) => (
                  <div key={`${index}-${row.financierId ?? "unset"}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_108px_40px]">
                    <Select
                      value={row.financierId != null ? String(row.financierId) : "__unset__"}
                      onValueChange={(value) =>
                        updateOwnershipRow(index, {
                          financierId: value === "__unset__" ? null : Number(value),
                        })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Choose financier" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset__">Choose financier</SelectItem>
                        {financierOptions.map((financier) => (
                          <SelectItem key={financier.id} value={String(financier.id)}>
                            {financier.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 sm:contents">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={String(row.sharePct)}
                        onChange={(event) =>
                          updateOwnershipRow(index, {
                            sharePct: parseOptionalNumber(event.target.value) ?? 0,
                          })
                        }
                        placeholder="%"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={ownershipRows.length === 1}
                        onClick={() => removeOwnershipRow(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <p className={`text-xs ${Math.abs(ownershipDraftValidation.totalPct - 100) < 0.01 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-300"}`}>
                Total share: {ownershipDraftValidation.totalPct.toFixed(ownershipDraftValidation.totalPct % 1 === 0 ? 0 : 2)}%
              </p>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Payment Legs</Label>
                  <p className="text-xs text-muted-foreground">
                    Use one row per real supplier payment: USD cash, ARS transfer, USDT, BTC, etc.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentLegRow}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {!paymentLegsTableReady && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Run <span className="font-mono">supabase/purchase_payment_legs.sql</span> to track mixed USD, ARS, and crypto purchase payments.
                </div>
              )}

              {paymentLegRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No payment legs yet. Pending purchases can stay empty; paid or partial purchases should have at least one.
                </p>
              ) : (
                <div className="space-y-3">
                  {paymentLegRows.map((row, index) => {
                    const amountArsPreview = resolvePaymentLegAmountArs(
                      parseOptionalNumber(row.amount),
                      normalizePaymentCurrency(row.currency),
                      parseOptionalNumber(row.fxRateToArs)
                    );

                    return (
                      <div key={`${row.id ?? "new"}-${index}`} className="rounded-md border bg-background/70 p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Financier</Label>
                            <Select
                              value={row.financierId != null ? String(row.financierId) : "__unset__"}
                              onValueChange={(value) =>
                                updatePaymentLegRow(index, {
                                  financierId: value === "__unset__" ? null : Number(value),
                                })
                              }
                            >
                              <SelectTrigger><SelectValue placeholder="Choose financier" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unset__">Choose financier</SelectItem>
                                {financierOptions.map((financier) => (
                                  <SelectItem key={financier.id} value={String(financier.id)}>
                                    {financier.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Payment Method</Label>
                            <Select
                              value={row.paymentMethod}
                              onValueChange={(value) =>
                                updatePaymentLegRow(index, {
                                  paymentMethod: value as PaymentMethod,
                                })
                              }
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PAYMENT_METHOD_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Amount</Label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={row.amount}
                              onChange={(event) => updatePaymentLegRow(index, { amount: event.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Currency</Label>
                            <Select
                              value={row.currency}
                              onValueChange={(value) =>
                                updatePaymentLegRow(index, {
                                  currency: value as PaymentCurrency,
                                })
                              }
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PAYMENT_LEG_CURRENCY_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">FX to ARS</Label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={row.fxRateToArs}
                              onChange={(event) => updatePaymentLegRow(index, { fxRateToArs: event.target.value })}
                              placeholder={row.currency === "ARS" ? "Not needed for ARS" : "0.00"}
                              disabled={row.currency === "ARS"}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Paid At</Label>
                            <Input
                              type="date"
                              value={row.paidAt}
                              onChange={(event) => updatePaymentLegRow(index, { paidAt: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs sm:text-sm">Notes</Label>
                            <Input
                              value={row.notes}
                              onChange={(event) => updatePaymentLegRow(index, { notes: event.target.value })}
                              placeholder="Optional"
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            ARS snapshot:{" "}
                            <span className="font-medium text-foreground">
                              {amountArsPreview != null
                                ? `$${amountArsPreview.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`
                                : "—"}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => removePaymentLegRow(index)}
                          >
                            <X className="mr-1 h-4 w-4" />
                            Remove leg
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className={`text-xs ${paymentLegDraftValidation.rows.length === 0 || paymentLegDraftValidation.hasMissingFinancier || paymentLegDraftValidation.hasInvalidAmount || paymentLegDraftValidation.hasMissingFx ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>
                ARS snapshot total: ${paymentLegDraftValidation.totalAmountArs.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Created By</Label>
              <Input
                value={formData.created_by ?? ""}
                onChange={(e) => updateForm("created_by", e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.notes ?? ""}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditingPurchase(null);
                setOwnershipRows([{ financierId: null, sharePct: 100 }]);
                setPaymentLegRows([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPurchase ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPurchase} onOpenChange={(open) => {
        if (!open) {
          setDetailPurchase(null);
          setDetailUnits([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Purchase {detailPurchase?.purchase_id} — {detailPurchase?.supplier_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {detailPurchase && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PurchaseDetailField label="Date" value={formatPurchaseDate(detailPurchase.date_purchase)} />
                  <PurchaseDetailField label="Supplier" value={detailPurchase.supplier_name} />
                  <PurchaseDetailField label="Total" value={formatMoney(detailPurchase.total_cost, detailPurchase.currency)} />
                  <PurchaseDetailField label="Units" value={loadingDetail ? "Loading..." : String(detailUnits.length)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <PurchaseDetailField label="Payment Summary" value={getPaymentSummary(detailPurchase)} />
                  <PurchaseDetailField label="Payment Status" value={<PaymentStatusBadge status={normalizePaymentStatus(detailPurchase.payment_status)} />} />
                  <PurchaseDetailField label="Funded By" value={getOwnershipSummary(detailPurchase)} />
                </div>
                {detailPurchase.notes ? (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</p>
                    <p className="mt-1 text-sm">{detailPurchase.notes}</p>
                  </div>
                ) : null}
                {paymentLegsTableReady ? (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-3">
                      <p className="text-sm font-medium">Payment legs</p>
                      <p className="text-xs text-muted-foreground">
                        Each row shows how the supplier was actually paid.
                      </p>
                    </div>
                    {detailPaymentLegs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No payment legs saved yet.</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {detailPaymentLegs.map((leg) => {
                          const financier = financierMap.get(leg.financier_id);
                          return (
                            <div key={leg.id} className="rounded-md border bg-background/70 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">
                                    {financier?.display_name ?? `Financier #${leg.financier_id}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatPaymentMethodLabel(leg.payment_method)}
                                  </p>
                                </div>
                                <Badge variant="secondary">{normalizePaymentCurrency(leg.currency)}</Badge>
                              </div>
                              <div className="mt-3 space-y-1 text-sm">
                                <p>{formatPaymentLegAmount(leg.amount, leg.currency)}</p>
                                <p className="text-muted-foreground">
                                  ARS snapshot:{" "}
                                  {leg.amount_ars != null
                                    ? `$${leg.amount_ars.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`
                                    : "—"}
                                </p>
                                <p className="text-muted-foreground">
                                  Paid at: {formatPurchaseDate(leg.paid_at)}
                                </p>
                                {leg.notes ? <p className="text-muted-foreground">{leg.notes}</p> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}

            <div>
              <div className="mb-3">
                <p className="text-sm font-medium">Stock units in this purchase</p>
                <p className="text-xs text-muted-foreground">
                  Every unit linked to {detailPurchase?.purchase_id} is listed here.
                </p>
              </div>
              {loadingDetail ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : detailUnits.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">No units in this purchase yet.</p>
              ) : (
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IMEI1</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Battery</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailUnits.map((u) => {
                        const prod = productMap.get(u.product_key);
                        const statusOpt = STOCK_STATUS_OPTIONS.find((o) => o.value === u.status);
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-mono text-xs">{u.imei1}</TableCell>
                            <TableCell>{prod?.product_name ?? u.product_key}</TableCell>
                            <TableCell>{u.color ?? "—"}</TableCell>
                            <TableCell>{u.battery_health != null ? `${u.battery_health}%` : "—"}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusOpt?.color ?? ""}`}>
                                {statusOpt?.label ?? u.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              {u.cost_unit != null
                                ? `${u.cost_currency === "ARS" ? "$" : "US$"}${u.cost_unit.toLocaleString()}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => detailPurchase && openAddUnit(detailPurchase)}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
            <Button variant="outline" onClick={() => setDetailPurchase(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Unit to Purchase Dialog */}
      <Dialog open={addUnitOpen} onOpenChange={(open) => { if (!open) { setAddUnitOpen(false); setAddUnitPurchase(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unit to {addUnitPurchase?.purchase_id}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>IMEI1 *</Label>
                <Input
                  value={unitForm.imei1 ?? ""}
                  onChange={(e) => updateUnitForm("imei1", e.target.value)}
                  placeholder="15 digits"
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label>IMEI2</Label>
                <Input
                  value={unitForm.imei2 ?? ""}
                  onChange={(e) => updateUnitForm("imei2", e.target.value)}
                  placeholder="Optional"
                  maxLength={15}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={unitForm.product_key ?? ""} onValueChange={(v) => updateUnitForm("product_key", v)}>
                <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {products.map((p) => (
                    <SelectItem key={p.product_key} value={p.product_key}>{p.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input
                value={unitForm.color ?? ""}
                onChange={(e) => updateUnitForm("color", e.target.value)}
                placeholder="Black, White, Blue..."
              />
            </div>
            <div className="space-y-2">
              <Label>Battery Health</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={unitForm.battery_health ?? ""}
                onChange={(e) => updateUnitForm("battery_health", e.target.value)}
                placeholder="92"
              />
              <p className="text-xs text-muted-foreground">
                Save battery health here for used or like-new units. Product rows keep shared specs only.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Unit Cost</Label>
                <Input
                  type="number"
                  value={unitForm.cost_unit ?? ""}
                  onChange={(e) => updateUnitForm("cost_unit", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Currency</Label>
                <Select value={unitForm.cost_currency ?? "USD"} onValueChange={(v) => updateUnitForm("cost_currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Record the supplier/base cost here, usually in USD. Saving it recalculates linked product pricing from this stock cost.
            </p>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={unitForm.notes ?? ""}
                onChange={(e) => updateUnitForm("notes", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddUnitOpen(false); setAddUnitPurchase(null); }}>Cancel</Button>
            <Button onClick={handleAddUnit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePurchase} onOpenChange={(o) => !o && setDeletePurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase</AlertDialogTitle>
            <AlertDialogDescription>
              Delete purchase {deletePurchase?.purchase_id}? Purchases with linked units should be kept for audit and profit attribution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
