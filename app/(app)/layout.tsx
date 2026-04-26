import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen lg:min-h-0">
        <Header />
        <main className="flex-1 overflow-x-hidden pb-20 lg:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
