"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { createClient } from "@/lib/supabase/client";

const resetSchema = z
  .object({
    password: z.string().min(6, "Minimo 6 caracteres"),
    confirmPassword: z.string().min(6, "Minimo 6 caracteres"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

type SessionState = "loading" | "ready" | "invalid" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  useEffect(() => {
    let active = true;

    async function checkSession() {
      // Supabase processa o token do hash automaticamente e cria sessao
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        setSessionState("invalid");
        return;
      }

      setSessionState("ready");
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [supabase]);

  const onSubmit = async (data: ResetFormData) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) throw error;

      setSessionState("success");
      toast.success("Senha atualizada com sucesso!");

      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao atualizar senha";
      toast.error(msg);
    }
  };

  if (sessionState === "loading") {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-text-secondary">Validando link...</p>
      </div>
    );
  }

  if (sessionState === "invalid") {
    return (
      <div className="animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-expense/10">
            <AlertCircle className="h-6 w-6 text-expense" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Link invalido ou expirado
            </h1>
          </div>
        </div>

        <p className="text-text-secondary mb-6">
          O link de redefinicao expirou ou e invalido. Solicite um novo link.
        </p>

        <Link href="/forgot-password" className="block">
          <Button className="w-full">Solicitar novo link</Button>
        </Link>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-accent hover:underline"
          >
            Voltar para o login
          </Link>
        </div>
      </div>
    );
  }

  if (sessionState === "success") {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-profit/10">
          <CheckCircle2 className="h-8 w-8 text-profit" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-text-primary">
          Senha atualizada!
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Redirecionando para o painel...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Nova senha
        </h1>
        <p className="text-text-secondary">
          Defina uma senha nova para sua conta.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nova senha" error={errors.password?.message} required>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Minimo 6 caracteres"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            error={errors.password?.message}
            autoComplete="new-password"
            {...register("password")}
          />
        </FormField>

        <FormField label="Confirmar senha" error={errors.confirmPassword?.message} required>
          <Input
            type={showConfirm ? "text" : "password"}
            placeholder="Repita a nova senha"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            error={errors.confirmPassword?.message}
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
        </FormField>

        <Button
          type="submit"
          className="w-full mt-2"
          size="lg"
          loading={isSubmitting}
        >
          Atualizar senha
        </Button>
      </form>
    </div>
  );
}
