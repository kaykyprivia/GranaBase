import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 bg-acai-50 px-4 text-center">
      <h1 className="text-3xl font-bold text-acai-700">Açaí Delivery</h1>
      <p className="max-w-sm text-acai-600">
        Cardápio e pedidos chegam nas próximas fases. Por enquanto, crie sua conta.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/cadastro">
          <Button>Criar conta</Button>
        </Link>
        <Link href="/login">
          <Button variant="outline">Entrar</Button>
        </Link>
      </div>
    </main>
  );
}
