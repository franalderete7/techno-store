const normalizedAllowlist = String(process.env.ADMIN_EMAIL_ALLOWLIST || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function getAdminAllowlist() {
  return normalizedAllowlist;
}

export function isAllowedAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  if (normalizedAllowlist.length === 0) return true;
  return normalizedAllowlist.includes(email.trim().toLowerCase());
}
