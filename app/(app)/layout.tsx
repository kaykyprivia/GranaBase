import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { WalletContributionProvider } from "@/components/wallet/WalletContributionProvider";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletContributionProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col min-h-screen lg:ml-64">
          <Header />
          <main className="flex-1 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </WalletContributionProvider>
  );
}
