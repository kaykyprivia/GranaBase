import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/BrandLogo";

export const metadata = {
  title: "Politica de Privacidade - GranaBase",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <BrandLogo className="h-10 rounded-lg" />
          </Link>
          <Link href="/register">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Politica de Privacidade
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Ultima atualizacao: setembro de 2026
        </p>

        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              1. Dados coletados
            </h2>
            <p>Coletamos apenas os dados necessarios para o funcionamento do servico:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>E-mail e senha (para autenticacao)</li>
              <li>Nome completo (para exibicao)</li>
              <li>Dados financeiros que voce registra (entradas, gastos, metas, etc)</li>
              <li>Dados de assinatura (plano, status, historico de pagamento)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              2. Como usamos seus dados
            </h2>
            <p>
              Seus dados sao usados exclusivamente para fornecer o servico:
              exibir seus registros, calcular relatorios, processar assinaturas
              e enviar notificacoes relevantes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              3. Compartilhamento com terceiros
            </h2>
            <p>
              Nao vendemos nem compartilhamos seus dados com terceiros para fins
              de marketing. Utilizamos os seguintes provedores de
              infraestrutura:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Supabase (banco de dados e autenticacao)</li>
              <li>Vercel (hospedagem)</li>
              <li>Mercado Pago (processamento de pagamentos)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              4. Seguranca
            </h2>
            <p>
              Utilizamos Row Level Security (RLS) em nivel de banco de dados.
              Isso significa que cada usuario so consegue acessar seus proprios
              dados, mesmo em caso de falha na aplicacao.
            </p>
            <p className="mt-2">
              Todas as comunicacoes sao criptografadas via HTTPS.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              5. Seus direitos (LGPD)
            </h2>
            <p>
              Conforme a Lei Geral de Protecao de Dados (LGPD), voce tem
              direito a:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Acessar todos os seus dados armazenados</li>
              <li>Corrigir dados incorretos</li>
              <li>Solicitar a exclusao da sua conta e dados associados</li>
              <li>Exportar seus dados</li>
              <li>Revogar consentimento a qualquer momento</li>
            </ul>
            <p className="mt-2">
              Para exercer esses direitos, use as opcoes em Configuracoes ou
              envie e-mail para privacidade@granabase.app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              6. Retencao de dados
            </h2>
            <p>
              Seus dados sao mantidos enquanto sua conta existir. Ao excluir a
              conta, todos os dados sao removidos permanentemente em ate 30
              dias, exceto registros que a legislacao exija manter.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              7. Cookies
            </h2>
            <p>
              Utilizamos apenas cookies essenciais para autenticacao. Nao
              utilizamos cookies de rastreamento ou publicidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              8. Contato
            </h2>
            <p>
              Duvidas sobre privacidade? Entre em contato pelo e-mail{" "}
              <span className="text-accent">privacidade@granabase.app</span>.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
