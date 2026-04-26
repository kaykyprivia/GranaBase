"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginFormData } from "@/lib/validations";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "Email ou senha incorretos"
          : "Erro ao fazer login. Tente novamente."
      );
      return;
    }

    toast.success("Bem-vindo de volta!");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Entrar na conta</h1>
        <p className="text-text-secondary">
          Novo por aqui?{" "}
          <Link href="/register" className="text-accent hover:underline font-medium">
            Criar conta grátis
          </Link>
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

        <FormField label="Senha" error={errors.password?.message} required>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            error={errors.password?.message}
            autoComplete="current-password"
            {...register("password")}
          />
        </FormField>

        <div className="flex justify-end">
          <button type="button" className="text-sm text-accent hover:underline">
            Esqueci minha senha
          </button>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isSubmitting}
        >
          Entrar
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border text-center">
        <p className="text-xs text-text-secondary">
          Ao entrar, você concorda com nossos{" "}
          <span className="text-accent cursor-pointer hover:underline">Termos de uso</span>
          {" "}e{" "}
          <span className="text-accent cursor-pointer hover:underline">Política de privacidade</span>
        </p>
      </div>
    </div>
  );
}
