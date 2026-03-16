export function normalizeCustomerPhoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D+/g, "");
}

export function isValidCustomerPhone(value: string | null | undefined) {
  const digits = normalizeCustomerPhoneDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

export function buildCustomerPhoneLookupCandidates(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const digits = normalizeCustomerPhoneDigits(raw);
  const candidates = new Set<string>();

  const add = (candidate: string | null | undefined) => {
    const trimmed = String(candidate || "").trim();
    if (!trimmed) return;
    candidates.add(trimmed);
  };

  add(raw);
  add(digits);

  if (!digits) {
    return [];
  }

  const withoutCountry = digits.startsWith("54") ? digits.slice(2) : digits;
  const withoutWhatsappNine = withoutCountry.startsWith("9")
    ? withoutCountry.slice(1)
    : withoutCountry;

  const localDigits = withoutWhatsappNine || withoutCountry || digits;
  add(localDigits);
  add(`0${localDigits}`);
  add(`54${localDigits}`);
  add(`+54${localDigits}`);
  add(`549${localDigits}`);
  add(`+549${localDigits}`);

  if (withoutCountry && withoutCountry !== localDigits) {
    add(withoutCountry);
    add(`54${withoutCountry}`);
    add(`+54${withoutCountry}`);
  }

  if (digits.startsWith("549")) {
    add(digits.slice(3));
    add(`54${digits.slice(3)}`);
    add(`+54${digits.slice(3)}`);
  }

  return Array.from(candidates).filter(Boolean);
}
