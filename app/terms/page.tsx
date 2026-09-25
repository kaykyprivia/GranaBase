import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/BrandLogo";

export const metadata = {
  title: "Termos de Uso - GranaBase",
};

export default function TermsPage() {
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

      <article className="max-w-3xl mx-auto px-4 py-12 prose-invert">
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Termos de Uso
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Ultima atualizacao: setembro de 2026
        </p>

        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              1. Aceitacao dos termos
            </h2>
            <p>
              Ao criar uma conta no GranaBase, voce concorda integralmente com
              estes Termos de Uso. Caso nao concorde, nao utilize a plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              2. Descricao do servico
            </h2>
            <p>
              O GranaBase e uma plataforma de controle financeiro pessoal e
              empresarial. Oferecemos ferramentas para registro de entradas,
              gastos, metas, investimentos, gestao de negocio e relatorios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              3. Conta e responsabilidade
            </h2>
            <p>
              Voce e responsavel por manter a confidencialidade da sua senha e
              por todas as atividades realizadas na sua conta. Notifique-nos
              imediatamente em caso de uso nao autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              4. Planos e pagamentos
            </h2>
            <p>
              O GranaBase oferece um periodo gratuito de 7 dias por produto
              (Personal e Business). Apos esse periodo, o acesso pode ser
              mantido atraves de assinatura mensal, semestral ou anual. Os
              pagamentos sao processados pelo Mercado Pago.
            </p>
            <p className="mt-2">
              Voce pode cancelar sua assinatura a qualquer momento. Apos o
              cancelamento, o acesso permanece ate o fim do periodo ja pago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              5. Preservacao de dados
            </h2>
            <p>
              Seus dados financeiros NAO sao apagados apos o encerramento do
              periodo gratuito ou cancelamento da assinatura. Voce pode
              reativar o acesso quando quiser e continuar de onde parou.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              6. Programa de indicacao
            </h2>
            <p>
              O GranaBase oferece comissoes por indicacoes. Os percentuais
              variam conforme seu plano. Comissoes so sao creditadas apos a
              confirmacao do pagamento e podem ser canceladas em caso de
              reembolso, cancelamento ou chargeback.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              7. Uso proibido
            </h2>
            <p>
              Voce concorda em nao usar a plataforma para atividades ilegais,
              nao tentar acessar contas de outros usuarios, e nao explorar
              vulnerabilidades de seguranca.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              8. Alteracoes
            </h2>
            <p>
              Podemos atualizar estes termos periodicamente. Notificaremos
              mudancas relevantes por e-mail ou na plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              9. Contato
            </h2>
            <p>
              Duvidas sobre estes termos? Entre em contato pelo e-mail{" "}
              <span className="text-accent">contato@granabase.app</span>.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
