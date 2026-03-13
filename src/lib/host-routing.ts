const ADMIN_SUBDOMAIN_PREFIX = "admin.";
const LOCAL_ONLY_HOST_PATTERNS = [/^localhost$/, /^127(?:\.\d{1,3}){3}$/, /^0\.0\.0\.0$/, /\.vercel\.app$/];

function normalizeSlashes(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, "/");
  return normalized === "" ? "/" : normalized;
}

export function normalizeHostname(hostname: string | null | undefined) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function isAdminHostname(hostname: string | null | undefined) {
  return normalizeHostname(hostname).startsWith(ADMIN_SUBDOMAIN_PREFIX);
}

export function getCanonicalAdminHostname(hostname: string | null | undefined) {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isAdminHostname(normalized)) {
    return normalized || null;
  }

  const bareHostname = normalized.startsWith("www.") ? normalized.slice(4) : normalized;
  if (LOCAL_ONLY_HOST_PATTERNS.some((pattern) => pattern.test(bareHostname))) {
    return null;
  }

  return `${ADMIN_SUBDOMAIN_PREFIX}${bareHostname}`;
}

export function getAdminVisibleBasePath(hostname: string | null | undefined) {
  return isAdminHostname(hostname) ? "/" : "/admin";
}

export function getAdminVisibleDefaultPath(hostname: string | null | undefined) {
  return isAdminHostname(hostname) ? "/" : "/admin";
}

export function getAdminVisibleLoginPath(hostname: string | null | undefined) {
  return isAdminHostname(hostname) ? "/login" : "/admin/login";
}

export function stripAdminPrefix(pathname: string) {
  const normalized = normalizeSlashes(pathname);

  if (normalized === "/admin") return "/";
  if (normalized.startsWith("/admin/")) {
    return normalizeSlashes(normalized.slice("/admin".length));
  }

  return normalized;
}

export function rewriteAdminVisiblePath(pathname: string) {
  const normalized = normalizeSlashes(pathname);

  if (normalized === "/" || normalized === "/login") {
    return `/admin${normalized === "/" ? "" : normalized}`;
  }

  if (
    normalized === "/stock" ||
    normalized === "/purchases" ||
    normalized === "/crm" ||
    normalized === "/reservations"
  ) {
    return `/admin${normalized === "/reservations" ? "" : normalized}`;
  }

  if (normalized === "/admin" || normalized.startsWith("/admin/")) {
    return normalized;
  }

  return null;
}

export function getCanonicalAdminPath(pathname: string) {
  const normalized = normalizeSlashes(pathname);

  if (normalized === "/admin" || normalized === "/reservations") {
    return "/";
  }

  if (normalized === "/admin/login") {
    return "/login";
  }

  if (normalized.startsWith("/admin/")) {
    return normalizeSlashes(normalized.slice("/admin".length));
  }

  if (normalized === "/stock" || normalized === "/purchases" || normalized === "/crm") {
    return normalized;
  }

  return null;
}
