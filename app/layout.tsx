import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GranaBase — Gestão Financeira para Renda Variável",
    template: "%s | GranaBase",
  },
  description:
    "Controle financeiro premium para autônomos, freelancers e quem tem renda variável. Saiba exatamente quanto entrou, saiu e sobra.",
  keywords: ["finanças pessoais", "controle financeiro", "renda variável", "freelancer", "autônomo"],
  authors: [{ name: "GranaBase" }],
  creator: "GranaBase",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "GranaBase — Gestão Financeira para Renda Variável",
    description: "Controle financeiro premium para autônomos, freelancers e quem tem renda variável.",
    siteName: "GranaBase",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-background text-text-primary antialiased">
        {children}
        <Toaster
          theme="dark"
          richColors
          position="top-right"
          toastOptions={{
            style: {
              background: "#111827",
              border: "1px solid #1F2937",
              color: "#F8FAFC",
            },
          }}
        />
      </body>
    </html>
  );
}
