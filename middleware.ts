import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedAdminEmail } from "@/lib/admin-auth";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

const legacyAdminRedirects = new Map<string, string>([
  ["/stock", "/admin/stock"],
  ["/purchases", "/admin/purchases"],
  ["/crm", "/admin/crm"],
  ["/tiendanube", "/admin/tiendanube"],
  ["/reservations", "/admin"],
]);

function buildLoginRedirect(request: NextRequest, nextPath: string, reason?: string) {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  if (reason) {
    loginUrl.searchParams.set("error", reason);
  }
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const legacyPath = legacyAdminRedirects.get(request.nextUrl.pathname);
  const targetPath = legacyPath || request.nextUrl.pathname;
  const response =
    legacyPath !== undefined
      ? NextResponse.redirect(new URL(targetPath, request.url))
      : NextResponse.next();

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

  const isAdminRoute = targetPath.startsWith("/admin");
  const isLoginRoute = targetPath === "/admin/login";
  const isAllowed = isAllowedAdminEmail(user?.email);

  if (isLoginRoute) {
    if (user?.email && isAllowed) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return response;
  }

  if (isAdminRoute && !user) {
    return buildLoginRedirect(request, targetPath);
  }

  if (isAdminRoute && !isAllowed) {
    return buildLoginRedirect(request, targetPath, "access_denied");
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/stock", "/purchases", "/crm", "/tiendanube", "/reservations"],
};
