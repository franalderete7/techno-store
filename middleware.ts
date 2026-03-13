import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import {
  getCanonicalAdminHostname,
  getCanonicalAdminPath,
  getAdminVisibleDefaultPath,
  getAdminVisibleLoginPath,
  isAdminHostname,
  normalizeHostname,
  rewriteAdminVisiblePath,
  stripAdminPrefix,
} from "@/lib/host-routing";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

const legacyAdminRedirects = new Map<string, string>([
  ["/stock", "/admin/stock"],
  ["/purchases", "/admin/purchases"],
  ["/crm", "/admin/crm"],
  ["/reservations", "/admin"],
]);

function buildLoginRedirect(request: NextRequest, nextPath: string, reason?: string) {
  const hostname = normalizeHostname(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const loginUrl = new URL(getAdminVisibleLoginPath(hostname), request.url);
  loginUrl.searchParams.set("next", nextPath);
  if (reason) {
    loginUrl.searchParams.set("error", reason);
  }
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const hostname = normalizeHostname(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );
  const isAdminHost = isAdminHostname(hostname);
  const currentPath = request.nextUrl.pathname;
  const canonicalAdminHostname = getCanonicalAdminHostname(hostname);

  if (!isAdminHost && canonicalAdminHostname) {
    const canonicalAdminPath = getCanonicalAdminPath(currentPath);
    if (canonicalAdminPath) {
      const adminUrl = request.nextUrl.clone();
      adminUrl.hostname = canonicalAdminHostname;
      adminUrl.pathname = canonicalAdminPath;
      return NextResponse.redirect(adminUrl);
    }
  }

  if (isAdminHost && currentPath.startsWith("/admin")) {
    const cleanPath = stripAdminPrefix(currentPath);
    if (cleanPath !== currentPath) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath;
      return NextResponse.redirect(cleanUrl);
    }
  }

  const legacyPath = !isAdminHost ? legacyAdminRedirects.get(currentPath) : undefined;
  if (legacyPath) {
    return NextResponse.redirect(new URL(legacyPath, request.url));
  }

  const rewrittenAdminPath = isAdminHost ? rewriteAdminVisiblePath(currentPath) : null;
  if (isAdminHost && !rewrittenAdminPath) {
    const fallbackUrl = request.nextUrl.clone();
    fallbackUrl.pathname = "/";
    return NextResponse.redirect(fallbackUrl);
  }

  const targetPath = rewrittenAdminPath || currentPath;
  const response =
    rewrittenAdminPath && rewrittenAdminPath !== currentPath
      ? NextResponse.rewrite(new URL(targetPath, request.url))
      : NextResponse.next();

  const isAdminRoute = targetPath.startsWith("/admin");
  const isLoginRoute = targetPath === "/admin/login";
  if (!isAdminRoute) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAllowed = isAllowedAdminEmail(user?.email);

  if (isLoginRoute) {
    if (user?.email && isAllowed) {
      return NextResponse.redirect(new URL(getAdminVisibleDefaultPath(hostname), request.url));
    }
    return response;
  }

  if (isAdminRoute && !user) {
    return buildLoginRedirect(request, currentPath);
  }

  if (isAdminRoute && !isAllowed) {
    return buildLoginRedirect(request, currentPath, "access_denied");
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
