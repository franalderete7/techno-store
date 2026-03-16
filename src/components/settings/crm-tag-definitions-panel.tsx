"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, Tag, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CRM_TAG_GROUP_OPTIONS,
  getCrmTagGroupMeta,
  humanizeCrmTagKey,
  inferCrmTagGroup,
  normalizeCrmColorHex,
  normalizeCrmTagKey,
  suggestCrmTagKey,
} from "@/lib/crm-tags";
import { getErrorMessage, isRowLevelSecurityError } from "@/lib/utils";
import type { CrmTagDefinition, CrmTagDefinitionInsert } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TagDraftRow = {
  localId: string;
  originalTagKey: string | null;
  tag_key: string;
  tag_group: string;
  label: string;
  description: string;
  color_hex: string;
  sort_order: string;
  active: boolean;
  isNew: boolean;
};

function makeLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `crm-tag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDraftRow(row: CrmTagDefinition): TagDraftRow {
  return {
    localId: row.tag_key,
    originalTagKey: row.tag_key,
    tag_key: row.tag_key,
    tag_group: row.tag_group || inferCrmTagGroup(row.tag_key),
    label: row.label || humanizeCrmTagKey(row.tag_key),
    description: row.description || "",
    color_hex: row.color_hex || "",
    sort_order: String(row.sort_order ?? 0),
    active: row.active ?? true,
    isNew: false,
  };
}

function normalizeDraftForCompare(row: TagDraftRow) {
  return JSON.stringify({
    originalTagKey: row.originalTagKey,
    tag_key: normalizeCrmTagKey(row.tag_key),
    tag_group: String(row.tag_group || "").trim(),
    label: row.label.trim(),
    description: row.description.trim(),
    color_hex: normalizeCrmColorHex(row.color_hex) || "",
    sort_order: row.sort_order.trim(),
    active: row.active,
    isNew: row.isNew,
  });
}

export function CrmTagDefinitionsPanel() {
  const [rows, setRows] = useState<TagDraftRow[]>([]);
  const [initialRows, setInitialRows] = useState<TagDraftRow[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDefinitions = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("crm_tag_definitions")
      .select("*")
      .order("tag_group", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("tag_key", { ascending: true });

    if (fetchError) {
      setRows([]);
      setInitialRows([]);
      setDeletedKeys([]);
      setError(
        isRowLevelSecurityError(fetchError)
          ? "Supabase está bloqueando la lectura de crm_tag_definitions por RLS."
          : getErrorMessage(fetchError, "No pude cargar crm_tag_definitions.")
      );
      setLoading(false);
      return;
    }

    const nextRows = (data || []).map(toDraftRow);
    setRows(nextRows);
    setInitialRows(nextRows);
    setDeletedKeys([]);
    setLoading(false);
  };

  useEffect(() => {
    loadDefinitions();
  }, []);

  const groupOptions = useMemo(() => {
    const extraGroups = Array.from(
      new Set(
        rows
          .map((row) => String(row.tag_group || "").trim())
          .filter((group) => group && !CRM_TAG_GROUP_OPTIONS.some((option) => option.value === group))
      )
    ).map((group) => ({
      value: group,
      label: group,
      prefix: "",
      description: "Existing custom group already present in the database.",
    }));

    return [...CRM_TAG_GROUP_OPTIONS, ...extraGroups];
  }, [rows]);

  const initialByKey = useMemo(
    () => new Map(initialRows.map((row) => [row.originalTagKey || row.tag_key, row])),
    [initialRows]
  );

  const dirtyCount = useMemo(() => {
    const changedRows = rows.filter((row) => {
      const baselineKey = row.originalTagKey || row.tag_key;
      const baseline = initialByKey.get(baselineKey);
      if (!baseline) return true;
      return normalizeDraftForCompare(row) !== normalizeDraftForCompare(baseline);
    }).length;

    return changedRows + deletedKeys.length;
  }, [deletedKeys.length, initialByKey, rows]);

  const handleRowPatch = (
    localId: string,
    updater: (row: TagDraftRow) => TagDraftRow
  ) => {
    setRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) return row;

        const nextRow = updater(row);
        if (!row.isNew) return nextRow;

        const previousSuggested = suggestCrmTagKey(row.tag_group, row.label);
        const currentKey = normalizeCrmTagKey(row.tag_key);
        const nextSuggested = suggestCrmTagKey(nextRow.tag_group, nextRow.label);
        const shouldAutoUpdateKey = !currentKey || currentKey === previousSuggested;

        return shouldAutoUpdateKey
          ? {
              ...nextRow,
              tag_key: nextSuggested,
            }
          : nextRow;
      })
    );

    if (success) {
      setSuccess(null);
    }
  };

  const addRow = () => {
    const maxSortOrder = rows.reduce((max, row) => {
      const next = Number.parseInt(row.sort_order, 10);
      return Number.isFinite(next) ? Math.max(max, next) : max;
    }, 0);

    setRows((current) => [
      {
        localId: makeLocalId(),
        originalTagKey: null,
        tag_key: "",
        tag_group: "tag",
        label: "",
        description: "",
        color_hex: "",
        sort_order: String(maxSortOrder + 10),
        active: true,
        isNew: true,
      },
      ...current,
    ]);
    setSuccess(null);
    setError(null);
  };

  const removeRow = (row: TagDraftRow) => {
    const isExisting = Boolean(row.originalTagKey);
    if (
      isExisting &&
      typeof window !== "undefined" &&
      !window.confirm(`Delete CRM tag "${row.tag_key}"? This can stop workflows from applying it.`)
    ) {
      return;
    }

    setRows((current) => current.filter((candidate) => candidate.localId !== row.localId));
    if (row.originalTagKey) {
      setDeletedKeys((current) =>
        current.includes(row.originalTagKey as string)
          ? current
          : [...current, row.originalTagKey as string]
      );
    }
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const seenKeys = new Set<string>();
    const payload: CrmTagDefinitionInsert[] = [];

    for (const row of rows) {
      const label = row.label.trim();
      const tagGroup = String(row.tag_group || "").trim() || inferCrmTagGroup(row.tag_key);
      const tagKey = normalizeCrmTagKey(row.tag_key || suggestCrmTagKey(tagGroup, label));
      const description = row.description.trim();
      const sortOrder = Number.parseInt(row.sort_order.trim(), 10);
      const rawColor = row.color_hex.trim();
      const colorHex = rawColor ? normalizeCrmColorHex(rawColor) : null;

      if (!label) {
        setError(`Cada tag necesita un label. Revisá la fila ${row.tag_key || row.localId}.`);
        setSaving(false);
        return;
      }

      if (!tagGroup) {
        setError(`Cada tag necesita un group. Revisá la fila ${row.tag_key || label}.`);
        setSaving(false);
        return;
      }

      if (!tagKey) {
        setError(`No pude generar el tag_key para "${label}".`);
        setSaving(false);
        return;
      }

      if (seenKeys.has(tagKey)) {
        setError(`Hay un tag_key repetido: "${tagKey}".`);
        setSaving(false);
        return;
      }

      if (!Number.isFinite(sortOrder)) {
        setError(`Sort order inválido para "${tagKey}".`);
        setSaving(false);
        return;
      }

      if (rawColor && !colorHex) {
        setError(`Color inválido para "${tagKey}". Usá formato #RRGGBB.`);
        setSaving(false);
        return;
      }

      seenKeys.add(tagKey);
      payload.push({
        tag_key: tagKey,
        tag_group: tagGroup,
        label,
        description,
        color_hex: colorHex,
        sort_order: sortOrder,
        active: row.active,
      });
    }

    if (deletedKeys.length > 0) {
      const { error: deleteError } = await supabase
        .from("crm_tag_definitions")
        .delete()
        .in("tag_key", deletedKeys);

      if (deleteError) {
        setError(
          isRowLevelSecurityError(deleteError)
            ? "Supabase está bloqueando el borrado de crm_tag_definitions por RLS."
            : getErrorMessage(deleteError, "No pude borrar tags de CRM.")
        );
        setSaving(false);
        return;
      }
    }

    if (payload.length > 0) {
      const { error: saveError } = await supabase
        .from("crm_tag_definitions")
        .upsert(payload, { onConflict: "tag_key" });

      if (saveError) {
        setError(
          isRowLevelSecurityError(saveError)
            ? "Supabase está bloqueando la escritura de crm_tag_definitions por RLS."
            : getErrorMessage(saveError, "No pude guardar crm_tag_definitions.")
        );
        setSaving(false);
        return;
      }
    }

    await loadDefinitions();
    setSaving(false);
    setSuccess(
      `Guardé ${payload.length} tag${payload.length === 1 ? "" : "s"} y borré ${deletedKeys.length}.`
    );
  };

  const activeCount = rows.filter((row) => row.active).length;

  return (
    <section className="space-y-6 px-4 pb-6 sm:px-6">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-tight">CRM Tag Definitions</h2>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              This is the control plane for the custom CRM tag system. Active tag keys are the ones
              workflows should be allowed to save into conversations and customer profiles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {loading ? "Loading..." : `${rows.length} tags`}
            </Badge>
            <Badge variant="secondary">{activeCount} active</Badge>
            <Badge variant={dirtyCount > 0 ? "default" : "secondary"}>
              {dirtyCount > 0 ? `${dirtyCount} pending` : "No pending changes"}
            </Badge>
            <Button variant="outline" onClick={loadDefinitions} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            <Button variant="outline" onClick={addRow} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tag
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || dirtyCount === 0}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Tags
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

      {rows.length === 0 && !loading ? (
        <div className="rounded-3xl border border-dashed bg-card/60 p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No CRM tag definitions yet. Add the first tag and save it so the workflows can start
            whitelisting it.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {rows.map((row) => {
          const normalizedColor = normalizeCrmColorHex(row.color_hex);
          const groupMeta = getCrmTagGroupMeta(row.tag_group);
          const isDirty = (() => {
            const baselineKey = row.originalTagKey || row.tag_key;
            const baseline = initialByKey.get(baselineKey);
            if (!baseline) return true;
            return normalizeDraftForCompare(row) !== normalizeDraftForCompare(baseline);
          })();

          return (
            <div key={row.localId} className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-transparent"
                      style={
                        normalizedColor
                          ? {
                              borderColor: `${normalizedColor}55`,
                              backgroundColor: `${normalizedColor}18`,
                              color: normalizedColor,
                            }
                          : undefined
                      }
                    >
                      {row.label.trim() || "New tag"}
                    </Badge>
                    <Badge variant={row.active ? "default" : "secondary"}>
                      {row.active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant={isDirty ? "default" : "secondary"}>
                      {row.originalTagKey || row.isNew ? row.tag_key || "unsaved_key" : "saved"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {groupMeta.description}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {row.isNew ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleRowPatch(row.localId, (current) => ({
                          ...current,
                          tag_key: suggestCrmTagKey(current.tag_group, current.label),
                        }))
                      }
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Suggest Key
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeRow(row)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={`${row.localId}-group`}>Group</Label>
                  <Select
                    value={row.tag_group || "tag"}
                    onValueChange={(value) =>
                      handleRowPatch(row.localId, (current) => ({
                        ...current,
                        tag_group: value,
                      }))
                    }
                  >
                    <SelectTrigger id={`${row.localId}-group`} className="w-full">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${row.localId}-label`}>Label</Label>
                  <Input
                    id={`${row.localId}-label`}
                    value={row.label}
                    onChange={(event) =>
                      handleRowPatch(row.localId, (current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    placeholder="Reserva caliente"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${row.localId}-tag-key`}>Tag Key</Label>
                  <Input
                    id={`${row.localId}-tag-key`}
                    value={row.tag_key}
                    onChange={(event) =>
                      handleRowPatch(row.localId, (current) => ({
                        ...current,
                        tag_key: normalizeCrmTagKey(event.target.value),
                      }))
                    }
                    placeholder="behavior_hot_reservation"
                    readOnly={!row.isNew}
                    className={!row.isNew ? "bg-muted/50 text-muted-foreground" : undefined}
                  />
                  {!row.isNew ? (
                    <p className="text-xs text-muted-foreground">
                      Existing keys stay fixed so workflows and historical data do not drift.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${row.localId}-sort-order`}>Sort Order</Label>
                  <Input
                    id={`${row.localId}-sort-order`}
                    type="number"
                    step="1"
                    value={row.sort_order}
                    onChange={(event) =>
                      handleRowPatch(row.localId, (current) => ({
                        ...current,
                        sort_order: event.target.value,
                      }))
                    }
                    placeholder="100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${row.localId}-color-text`}>Color Hex</Label>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Tag color picker"
                      type="color"
                      value={normalizedColor || "#94A3B8"}
                      onChange={(event) =>
                        handleRowPatch(row.localId, (current) => ({
                          ...current,
                          color_hex: event.target.value.toUpperCase(),
                        }))
                      }
                      className="h-9 w-12 rounded-md border border-input bg-background px-1"
                    />
                    <Input
                      id={`${row.localId}-color-text`}
                      value={row.color_hex}
                      onChange={(event) =>
                        handleRowPatch(row.localId, (current) => ({
                          ...current,
                          color_hex: event.target.value,
                        }))
                      }
                      placeholder="#14B8A6"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty if you want the CRM to use the default group color.
                  </p>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
                    <Checkbox
                      checked={row.active}
                      onCheckedChange={(checked) =>
                        handleRowPatch(row.localId, (current) => ({
                          ...current,
                          active: checked === true,
                        }))
                      }
                    />
                    <span>
                      Active
                      <span className="block text-xs text-muted-foreground">
                        Inactive tags stay for history but workflows should stop using them.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor={`${row.localId}-description`}>Description</Label>
                <textarea
                  id={`${row.localId}-description`}
                  rows={3}
                  value={row.description}
                  onChange={(event) =>
                    handleRowPatch(row.localId, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="How and when this tag should be used by workflows or humans."
                  className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
