"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { createClient } from "@/lib/supabase/client";

const forgotSchema = z.object({
  email: z.string().email("Email invalido"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : "https://granabase.vercel.app/reset-password";

      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo,
      });

      if (error) throw error;

      setSent(true);
      toast.success("Link enviado! Verifique seu email.");
    } catch (error) {
      console.error("Erro ao enviar link:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao enviar link";
      toast.error(msg);
    }
  };

  if (sent) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Verifique seu email
          </h1>
          <p className="text-text-secondary">
            Enviamos um link para{" "}
            <strong className="text-text-primary">{getValues("email")}</strong>.
            Clique nele para redefinir sua senha.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-surface p-4 text-sm text-text-secondary">
            Nao recebeu? Verifique a caixa de spam ou tente novamente em alguns
            minutos.
          </div>

          <Link href="/login" className="block">
            <Button variant="outline" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Esqueci minha senha
        </h1>
        <p className="text-text-secondary">
          Informe seu email para receber um link de redefinicao.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Email" error={errors.email?.message} required>
          <Input
            type="email"
            placeholder="seu@email.com"
            leftIcon={<Mail className="h-4 w-4" />}
            error={errors.email?.message}
            autoComplete="email"
            {...register("email")}
          />
        </FormField>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            "Enviar link"
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border text-center">
        <Link
          href="/login"
          className="text-sm text-accent hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
