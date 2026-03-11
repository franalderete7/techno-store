import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { TopNav } from "@/components/layout/top-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "TechnoStore Admin",
  description: "TechnoStore management dashboard",
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/60 bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Panel admin</span>
            <span className="hidden sm:inline">{user?.email || "Sesion activa"}</span>
          </div>
          <SignOutButton />
        </div>
        <TopNav basePath="/admin" />
      </div>
      <main className="pb-16 sm:pb-0">{children}</main>
    </div>
  );
}
