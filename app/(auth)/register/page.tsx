"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { createClient } from "@/lib/supabase/client";
import { registerSchema, type RegisterFormData } from "@/lib/validations";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("Este email já está cadastrado. Faça login.");
      } else {
        toast.error("Erro ao criar conta. Tente novamente.");
      }
      return;
    }

    toast.success("Conta criada com sucesso! Bem-vindo ao GranaBase.");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Criar conta grátis</h1>
        <p className="text-text-secondary">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-accent hover:underline font-medium">
            Fazer login
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nome completo" error={errors.full_name?.message} required>
          <Input
            type="text"
            placeholder="João da Silva"
            leftIcon={<User className="h-4 w-4" />}
            error={errors.full_name?.message}
            autoComplete="name"
            {...register("full_name")}
          />
        </FormField>

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
            placeholder="Mínimo 6 caracteres"
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
            autoComplete="new-password"
            {...register("password")}
          />
        </FormField>

        <FormField label="Confirmar senha" error={errors.confirmPassword?.message} required>
          <Input
            type={showConfirm ? "text" : "password"}
            placeholder="Repita a senha"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="text-text-secondary hover:text-text-primary transition-colors"
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
          Criar conta grátis
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border text-center">
        <p className="text-xs text-text-secondary">
          Ao criar sua conta, você concorda com os{" "}
          <span className="text-accent cursor-pointer hover:underline">Termos de uso</span>
          {" "}e{" "}
          <span className="text-accent cursor-pointer hover:underline">Política de privacidade</span>
        </p>
      </div>
    </div>
  );
}
