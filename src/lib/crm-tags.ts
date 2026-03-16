export type CrmTagGroupOption = {
  value: string;
  label: string;
  prefix: string;
  description: string;
};

export const CRM_TAG_GROUP_OPTIONS: CrmTagGroupOption[] = [
  {
    value: "tag",
    label: "General",
    prefix: "",
    description: "Free-form tags that do not fit a stricter category.",
  },
  {
    value: "payment",
    label: "Payment",
    prefix: "pay",
    description: "Signals about payment method, financing, or payment intent.",
  },
  {
    value: "topic",
    label: "Topic",
    prefix: "topic",
    description: "What the user talked about, such as shipping, warranty, or images.",
  },
  {
    value: "brand",
    label: "Brand",
    prefix: "brand",
    description: "Brand affinity or brand-specific interest.",
  },
  {
    value: "stage",
    label: "Funnel Stage",
    prefix: "stage",
    description: "Commercial stage or buying momentum tags.",
  },
  {
    value: "intent",
    label: "Intent",
    prefix: "intent",
    description: "Normalized intent signals such as reservation or complaint.",
  },
  {
    value: "location",
    label: "Location",
    prefix: "loc",
    description: "City, province, area code, or location-derived tags.",
  },
  {
    value: "behavior",
    label: "Behavior",
    prefix: "behavior",
    description: "Operational or behavioral tags such as repeat buyer or hot lead.",
  },
];

const TAG_GROUP_PREFIXES = new Map(
  CRM_TAG_GROUP_OPTIONS.map((option) => [option.value, option.prefix] as const)
);

export function normalizeCrmTagSegment(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

export function normalizeCrmTagKey(value: string | null | undefined) {
  return normalizeCrmTagSegment(value).replace(/_/g, "_");
}

export function inferCrmTagGroup(value: string | null | undefined) {
  const tagKey = normalizeCrmTagKey(value);
  if (tagKey.startsWith("pay_")) return "payment";
  if (tagKey.startsWith("topic_")) return "topic";
  if (tagKey.startsWith("brand_")) return "brand";
  if (tagKey.startsWith("stage_")) return "stage";
  if (tagKey.startsWith("intent_")) return "intent";
  if (
    tagKey.startsWith("loc_") ||
    tagKey.startsWith("prov_") ||
    tagKey.startsWith("phone_")
  ) {
    return "location";
  }
  if (tagKey.startsWith("behavior_")) return "behavior";
  return "tag";
}

export function humanizeCrmTagKey(value: string | null | undefined) {
  return normalizeCrmTagKey(value)
    .replace(/^pay_/, "")
    .replace(/^topic_/, "")
    .replace(/^brand_/, "")
    .replace(/^stage_/, "")
    .replace(/^intent_/, "")
    .replace(/^prov_/, "")
    .replace(/^loc_/, "")
    .replace(/^phone_/, "")
    .replace(/^behavior_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function suggestCrmTagKey(
  group: string | null | undefined,
  label: string | null | undefined
) {
  const normalizedGroup = String(group || "").trim() || "tag";
  const prefix = TAG_GROUP_PREFIXES.get(normalizedGroup) ?? "";
  const segment = normalizeCrmTagSegment(label);
  if (!segment) return prefix || "";
  return prefix ? `${prefix}_${segment}` : segment;
}

export function normalizeCrmColorHex(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return null;
  }
  return withHash.toUpperCase();
}

export function isValidCrmColorHex(value: string | null | undefined) {
  return normalizeCrmColorHex(value) !== null;
}

export function getCrmTagGroupMeta(group: string | null | undefined) {
  return (
    CRM_TAG_GROUP_OPTIONS.find((option) => option.value === group) ||
    CRM_TAG_GROUP_OPTIONS[0]
  );
}
