"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage, isRowLevelSecurityError } from "@/lib/utils";
import type { StoreSetting, StoreSettingInsert } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type SettingSectionId =
  | "storefront"
  | "payments"
  | "location"
  | "pricing"
  | "legacy"
  | "automation";

type SettingInputKind = "text" | "textarea" | "number";

type SettingDefinition = {
  key: string;
  label: string;
  section: SettingSectionId;
  kind?: SettingInputKind;
  rows?: number;
  placeholder?: string;
  helpText?: string;
  description?: string;
  step?: string;
};

const SETTING_SECTIONS: Array<{
  id: SettingSectionId;
  title: string;
  description: string;
}> = [
  {
    id: "storefront",
    title: "Storefront",
    description: "Visible store identity and customer-facing text shown on the site.",
  },
  {
    id: "payments",
    title: "Payments And Policies",
    description: "Payment methods, financing rules, shipping, and warranty copy used by the site and bot.",
  },
  {
    id: "location",
    title: "Location And WhatsApp",
    description: "Physical location metadata used for maps, pins, and assisted replies.",
  },
  {
    id: "pricing",
    title: "Pricing Defaults",
    description: "Primary pricing defaults that influence derived prices and financing calculations.",
  },
  {
    id: "legacy",
    title: "Legacy Compatibility",
    description: "Older defaults still present in the database for compatibility with existing pricing logic.",
  },
  {
    id: "automation",
    title: "Automation",
    description: "Operational values used by workflows and bot coordination.",
  },
];

const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "store_location_name",
    label: "Store Location Name",
    section: "storefront",
    placeholder: "TechnoStore Salta",
    description: "Display name used across storefront and location replies.",
  },
  {
    key: "store_address",
    label: "Store Address",
    section: "storefront",
    kind: "textarea",
    rows: 3,
    placeholder: "Caseros 1365, Salta Capital...",
  },
  {
    key: "store_hours",
    label: "Store Hours",
    section: "storefront",
    kind: "textarea",
    rows: 3,
    placeholder: "Lunes a Viernes...",
  },
  {
    key: "store_social_instagram",
    label: "Instagram",
    section: "storefront",
    placeholder: "@technostore.salta",
  },
  {
    key: "store_social_facebook",
    label: "Facebook",
    section: "storefront",
    placeholder: "@technostore.salta",
  },
  {
    key: "store_payment_methods",
    label: "Store Payment Methods",
    section: "payments",
    kind: "textarea",
    rows: 4,
    placeholder: "Transferencia bancaria en pesos...",
  },
  {
    key: "store_credit_policy",
    label: "Store Credit Policy",
    section: "payments",
    kind: "textarea",
    rows: 4,
    placeholder: "No hacemos créditos personales...",
  },
  {
    key: "store_financing_scope",
    label: "Store Financing Scope",
    section: "payments",
    kind: "textarea",
    rows: 4,
    placeholder: "6 cuotas fijas, solo presencial...",
  },
  {
    key: "customer_cards_supported",
    label: "Supported Cards",
    section: "payments",
    kind: "textarea",
    rows: 3,
    placeholder: "macro,naranja,visa,mastercard,...",
    helpText: "Comma-separated card or financing brands accepted.",
  },
  {
    key: "customer_cards_blocked",
    label: "Blocked Cards",
    section: "payments",
    placeholder: "SuCredito",
    helpText: "Comma-separated blocked financing brands.",
  },
  {
    key: "customer_payment_mentions_supported",
    label: "Supported Payment Mentions",
    section: "payments",
    kind: "textarea",
    rows: 4,
    placeholder: "transferencia,mercado_pago,efectivo_ars,...",
    helpText: "Normalized payment tokens the workflows should understand.",
  },
  {
    key: "store_shipping_policy",
    label: "Shipping Policy",
    section: "payments",
    kind: "textarea",
    rows: 4,
    placeholder: "Envíos gratis a sucursal...",
  },
  {
    key: "store_warranty_new",
    label: "Warranty For New Devices",
    section: "payments",
    kind: "textarea",
    rows: 3,
    placeholder: "Los equipos nuevos tienen 1 año...",
  },
  {
    key: "store_warranty_used",
    label: "Warranty For Used Devices",
    section: "payments",
    kind: "textarea",
    rows: 3,
    placeholder: "Los equipos seminuevos o usados...",
  },
  {
    key: "store_latitude",
    label: "Store Latitude",
    section: "location",
    kind: "number",
    step: "any",
    placeholder: "-24.7891289",
  },
  {
    key: "store_longitude",
    label: "Store Longitude",
    section: "location",
    kind: "number",
    step: "any",
    placeholder: "-65.4214185",
  },
  {
    key: "usd_to_ars",
    label: "USD To ARS",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "1460",
  },
  {
    key: "pricing_default_usd_rate",
    label: "Pricing Default USD Rate",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "1460",
  },
  {
    key: "pricing_default_logistics_usd",
    label: "Pricing Default Logistics USD",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "10",
  },
  {
    key: "pricing_default_cuotas_qty",
    label: "Pricing Default Cuotas Qty",
    section: "pricing",
    kind: "number",
    step: "1",
    placeholder: "6",
  },
  {
    key: "pricing_bancarizada_interest",
    label: "Pricing Bancarizada Interest",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.50",
    helpText: "Use decimal form: 0.50 means 50%.",
  },
  {
    key: "pricing_macro_interest",
    label: "Pricing Macro Interest",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.40",
    helpText: "Use decimal form: 0.40 means 40%.",
  },
  {
    key: "pricing_margin_band_1_max_cost_usd",
    label: "Margin Band 1 Max Cost USD",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "200",
  },
  {
    key: "pricing_margin_band_1_margin_pct",
    label: "Margin Band 1 Margin",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.30",
    helpText: "Use decimal form: 0.30 means 30%.",
  },
  {
    key: "pricing_margin_band_2_max_cost_usd",
    label: "Margin Band 2 Max Cost USD",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "400",
  },
  {
    key: "pricing_margin_band_2_margin_pct",
    label: "Margin Band 2 Margin",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.25",
    helpText: "Use decimal form: 0.25 means 25%.",
  },
  {
    key: "pricing_margin_band_3_max_cost_usd",
    label: "Margin Band 3 Max Cost USD",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "800",
  },
  {
    key: "pricing_margin_band_3_margin_pct",
    label: "Margin Band 3 Margin",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.20",
    helpText: "Use decimal form: 0.20 means 20%.",
  },
  {
    key: "pricing_margin_band_4_max_cost_usd",
    label: "Margin Band 4 Max Cost USD",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "999999",
  },
  {
    key: "pricing_margin_band_4_margin_pct",
    label: "Margin Band 4 Margin",
    section: "pricing",
    kind: "number",
    step: "0.01",
    placeholder: "0.15",
    helpText: "Use decimal form: 0.15 means 15%.",
  },
  {
    key: "logistics_usd",
    label: "Legacy Logistics USD",
    section: "legacy",
    kind: "number",
    step: "0.01",
    placeholder: "10",
  },
  {
    key: "cuotas_qty",
    label: "Legacy Cuotas Qty",
    section: "legacy",
    kind: "number",
    step: "1",
    placeholder: "6",
  },
  {
    key: "bancarizada_interest",
    label: "Legacy Bancarizada Interest",
    section: "legacy",
    kind: "number",
    step: "0.01",
    placeholder: "0.50",
    helpText: "Use decimal form: 0.50 means 50%.",
  },
  {
    key: "macro_interest",
    label: "Legacy Macro Interest",
    section: "legacy",
    kind: "number",
    step: "0.01",
    placeholder: "0.40",
    helpText: "Use decimal form: 0.40 means 40%.",
  },
  {
    key: "iphone_delivery_days",
    label: "iPhone Delivery Days",
    section: "legacy",
    kind: "number",
    step: "1",
    placeholder: "3",
  },
  {
    key: "bot_version",
    label: "Bot Version",
    section: "automation",
    placeholder: "v8",
  },
];

const definitionByKey = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

function humanizeSettingKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getFieldValue(values: Record<string, string>, key: string) {
  return values[key] ?? "";
}

export function StoreSettingsPanel() {
  const [settings, setSettings] = useState<StoreSetting[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("store_settings")
      .select("*")
      .order("key");

    if (fetchError) {
      setSettings([]);
      setFormValues({});
      setInitialValues({});
      setError(
        isRowLevelSecurityError(fetchError)
          ? "Supabase está bloqueando la lectura de store_settings por RLS."
          : getErrorMessage(fetchError, "No pude cargar store_settings.")
      );
      setLoading(false);
      return;
    }

    const nextSettings = data ?? [];
    const nextValues = Object.fromEntries(
      nextSettings.map((row) => [row.key, row.value ?? ""])
    ) as Record<string, string>;

    setSettings(nextSettings);
    setFormValues(nextValues);
    setInitialValues(nextValues);
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const allTrackedKeys = Array.from(
    new Set([...SETTING_DEFINITIONS.map((definition) => definition.key), ...settings.map((row) => row.key)])
  );
  const dirtyKeys = allTrackedKeys.filter(
    (key) => getFieldValue(formValues, key) !== getFieldValue(initialValues, key)
  );
  const dirtyCount = dirtyKeys.length;

  const handleValueChange = (key: string, value: string) => {
    setFormValues((current) => ({ ...current, [key]: value }));
    if (success) {
      setSuccess(null);
    }
  };

  const handleReset = () => {
    setFormValues(initialValues);
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    if (dirtyKeys.length === 0) {
      setSuccess("No hay cambios pendientes.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: StoreSettingInsert[] = dirtyKeys.map((key) => {
      const existing = settings.find((row) => row.key === key);
      const definition = definitionByKey.get(key);

      return {
        key,
        value: getFieldValue(formValues, key),
        description: existing?.description ?? definition?.description ?? null,
      };
    });

    const { error: saveError } = await supabase
      .from("store_settings")
      .upsert(payload, { onConflict: "key" });

    if (saveError) {
      setError(
        isRowLevelSecurityError(saveError)
          ? "Supabase está bloqueando la escritura de store_settings por RLS."
          : getErrorMessage(saveError, "No pude guardar store_settings.")
      );
      setSaving(false);
      return;
    }

    await loadSettings();
    setSaving(false);
    setSuccess(`Guardé ${payload.length} setting${payload.length === 1 ? "" : "s"}.`);
  };

  const rowsByKey = new Map(settings.map((row) => [row.key, row]));
  const unknownRows = settings.filter((row) => !definitionByKey.has(row.key));

  return (
    <section className="space-y-6 px-4 py-6 sm:px-6">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Store Settings</h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              These values feed the storefront, pricing defaults, and WhatsApp workflows directly.
              Text values save exactly as written. Decimal percentages use values like{" "}
              <span className="font-mono">0.40</span> for 40%.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {loading ? "Loading..." : `${settings.length} rows in store_settings`}
            </Badge>
            <Badge variant={dirtyCount > 0 ? "default" : "secondary"}>
              {dirtyCount > 0 ? `${dirtyCount} pending` : "No pending changes"}
            </Badge>
            <Button variant="outline" onClick={loadSettings} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving || dirtyCount === 0}>
              Reset
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || dirtyCount === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}
      </div>

      {SETTING_SECTIONS.map((section) => {
        const sectionDefinitions = SETTING_DEFINITIONS.filter(
          (definition) => definition.section === section.id
        );

        return (
          <div key={section.id} className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-5 space-y-1">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {sectionDefinitions.map((definition) => {
                const row = rowsByKey.get(definition.key);
                const fieldValue = getFieldValue(formValues, definition.key);
                const isDirty = fieldValue !== getFieldValue(initialValues, definition.key);
                const isTextarea = definition.kind === "textarea";
                const description = row?.description ?? definition.description ?? null;

                return (
                  <div
                    key={definition.key}
                    className={`rounded-2xl border border-border/60 bg-background/70 p-4 ${
                      isTextarea ? "md:col-span-2" : ""
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Label htmlFor={definition.key} className="text-sm font-medium">
                        {definition.label}
                      </Label>
                      <Badge variant={isDirty ? "default" : "secondary"}>{definition.key}</Badge>
                      {row?.updated_at ? (
                        <Badge variant="outline">Updated {formatUpdatedAt(row.updated_at)}</Badge>
                      ) : null}
                    </div>

                    {description ? (
                      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
                    ) : null}

                    {isTextarea ? (
                      <textarea
                        id={definition.key}
                        rows={definition.rows ?? 4}
                        value={fieldValue}
                        onChange={(event) => handleValueChange(definition.key, event.target.value)}
                        placeholder={definition.placeholder}
                        className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    ) : (
                      <Input
                        id={definition.key}
                        type={definition.kind === "number" ? "number" : "text"}
                        step={definition.kind === "number" ? definition.step ?? "any" : undefined}
                        value={fieldValue}
                        onChange={(event) => handleValueChange(definition.key, event.target.value)}
                        placeholder={definition.placeholder}
                      />
                    )}

                    {definition.helpText ? (
                      <p className="mt-2 text-xs text-muted-foreground">{definition.helpText}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {unknownRows.length > 0 ? (
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-5 space-y-1">
            <h2 className="text-lg font-semibold">Other Settings</h2>
            <p className="text-sm text-muted-foreground">
              Rows currently in the database that are not in the curated editor groups.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {unknownRows.map((row) => {
              const fieldValue = getFieldValue(formValues, row.key);
              const isDirty = fieldValue !== getFieldValue(initialValues, row.key);

              return (
                <div key={row.key} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Label htmlFor={row.key} className="text-sm font-medium">
                      {humanizeSettingKey(row.key)}
                    </Label>
                    <Badge variant={isDirty ? "default" : "secondary"}>{row.key}</Badge>
                    {row.updated_at ? (
                      <Badge variant="outline">Updated {formatUpdatedAt(row.updated_at)}</Badge>
                    ) : null}
                  </div>

                  {row.description ? (
                    <p className="mb-3 text-xs text-muted-foreground">{row.description}</p>
                  ) : null}

                  <Input
                    id={row.key}
                    value={fieldValue}
                    onChange={(event) => handleValueChange(row.key, event.target.value)}
                    placeholder={row.key}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
