"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/utils";

type Mode = "login" | "signup";

type AdminLoginFormProps = {
  defaultNextPath?: string;
};

export function AdminLoginForm({ defaultNextPath = "/admin" }: AdminLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    const error = searchParams.get("error");
    if (error === "access_denied") {
      return "Tu email inicio sesion, pero no esta habilitado para el panel admin.";
    }
    return null;
  });

  const nextPath = useMemo(
    () => searchParams.get("next") || defaultNextPath,
    [defaultNextPath, searchParams]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          setMessage("Las contrasenas no coinciden.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (!data.session) {
          setMessage(
            "Cuenta creada. Si tu proyecto pide confirmacion por email, revisa tu casilla antes de entrar al panel."
          );
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setMessage(getErrorMessage(error, "No se pudo iniciar sesion."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur">
      <div className="mb-6 space-y-2">
        <p className="text-sm uppercase tracking-[0.32em] text-sky-300">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {mode === "login" ? "Entrar al panel" : "Crear cuenta admin"}
        </h1>
        <p className="text-sm text-white/70">
          El panel usa Supabase Auth con email. Solo los emails habilitados pueden entrar.
        </p>
      </div>

      <div className="mb-6 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
            mode === "login" ? "bg-white text-black" : "text-white/70 hover:text-white"
          }`}
        >
          Ingresar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
            mode === "signup" ? "bg-white text-black" : "text-white/70 hover:text-white"
          }`}
        >
          Crear cuenta
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm text-white/70" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            placeholder="admin@techno-store.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-white/70" htmlFor="password">
            Contrasena
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            placeholder="********"
          />
        </div>

        {mode === "signup" ? (
          <div className="space-y-2">
            <label className="text-sm text-white/70" htmlFor="confirmPassword">
              Repeti la contrasena
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              placeholder="********"
            />
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {message}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="w-full rounded-2xl bg-sky-300 font-semibold text-black hover:bg-sky-200"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "login" ? (
            <>
              <Lock className="h-4 w-4" />
              Entrar
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              Crear cuenta
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
