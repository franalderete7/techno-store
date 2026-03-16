import { supabase } from "@/lib/supabase";

export async function requireAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("No active admin session. Sign in again.");
  }

  return user;
}
