"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cadastroSchema, type CadastroInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CadastroPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CadastroInput>({ resolver: zodResolver(cadastroSchema) });

  async function onSubmit(values: CadastroInput) {
    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { name: values.name, phone: values.phone },
      },
    });

    if (error) {
      toast.error(
        error.message === "User already registered"
          ? "Este e-mail já está cadastrado."
          : "Não foi possível concluir o cadastro."
      );
      setIsSubmitting(false);
      return;
    }

    toast.success("Cadastro realizado! Verifique seu e-mail para confirmar.");
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-acai-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-acai-700">
          Criar conta
        </h1>
        <p className="mt-1 text-center text-sm text-acai-500">
          Cadastre-se para fazer seu pedido
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <Input
            id="name"
            label="Nome completo"
            autoComplete="name"
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            id="phone"
            label="Telefone"
            type="tel"
            autoComplete="tel"
            placeholder="(12) 99999-9999"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <Input
            id="password"
            label="Senha"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" isLoading={isSubmitting} className="mt-2">
            Criar conta
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-acai-600">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-semibold text-gold-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
