import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getAdminAllowlist, isAllowedAdminEmail } from "@/lib/admin-auth";
import { getAdminVisibleDefaultPath, getAdminVisibleLoginPath, isAdminHostname } from "@/lib/host-routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLoginPage() {
  const requestHeaders = headers();
  const hostname = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const defaultNextPath = getAdminVisibleDefaultPath(hostname);
  const loginPath = getAdminVisibleLoginPath(hostname);
  const adminOnSubdomain = isAdminHostname(hostname);
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email && isAllowedAdminEmail(user.email)) {
    redirect(defaultNextPath);
  }

  const allowlist = getAdminAllowlist();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_32%),linear-gradient(180deg,#050b16_0%,#020611_40%,#020611_100%)] px-6 py-10">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-white backdrop-blur">
          <p className="text-sm uppercase tracking-[0.32em] text-sky-300">TechnoStore</p>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight">Admin privado con Supabase Auth</h1>
            <p className="max-w-lg text-base leading-7 text-white/70">
              El storefront queda publico para clientes, mientras que productos, stock, compras
              y CRM requieren login por email.
            </p>
          </div>

          <div className="grid gap-4 text-sm text-white/70">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white">Storefront</p>
              <p className="mt-1">
                {adminOnSubdomain
                  ? "La tienda publica vive en el storefront y este subdominio queda reservado para el panel."
                  : "`/` y `/productos/[handle]` son publicos y solo lectura."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white">Admin</p>
              <p className="mt-1">
                {adminOnSubdomain
                  ? "`/`, `/stock`, `/purchases`, `/crm`, `/login`."
                  : "`/admin`, `/admin/stock`, `/admin/purchases`, `/admin/crm`."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white">Emails habilitados</p>
              <p className="mt-1">
                {allowlist.length > 0
                  ? allowlist.join(", ")
                  : "No hay allowlist configurada. Si queres bloquear por email, agrega ADMIN_EMAIL_ALLOWLIST."}
              </p>
            </div>
          </div>

          {user ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p className="font-medium">Sesion detectada: {user.email}</p>
              <p className="mt-1">
                Ese email no esta habilitado para el admin. Cerra sesion y entra con una cuenta permitida.
              </p>
              <div className="mt-4">
                <SignOutButton loginPath={loginPath} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-center">
          <AdminLoginForm defaultNextPath={defaultNextPath} />
        </div>
      </div>
    </div>
  );
}
