"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      window.alert(getErrorMessage(error, "No se pudo cerrar sesion."));
      return;
    }

    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
      <LogOut className="h-4 w-4" />
      Salir
    </Button>
  );
}
