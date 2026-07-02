import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemedToaster } from "@/components/theme/ThemedToaster";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GranaBase — Gestão Financeira para Renda Variável",
    template: "%s | GranaBase",
  },
  manifest: "/manifest.webmanifest?v=2",
  appleWebApp: {
    capable: true,
    title: "GranaBase",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png?v=2",
    shortcut: "/favicon.ico?v=2",
    icon: [
      { url: "/favicon.ico?v=2", type: "image/x-icon" },
      { url: "/icons/granabase-icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icons/granabase-icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1E" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-background text-text-primary antialiased">
        <ThemeProvider>
          <PwaRegistration />
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
