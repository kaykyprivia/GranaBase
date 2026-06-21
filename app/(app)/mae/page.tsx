"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageIntro } from "@/components/shared/PageIntro";
import { InstallmentsPanel, type InstallmentsPanelHandle } from "@/components/installments/InstallmentsPanel";
import { BillsManager, type BillsManagerHandle } from "@/components/bills/BillsManager";

type ActiveTab = "bills" | "installments";

export default function MaePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const installmentsPanelRef = useRef<InstallmentsPanelHandle>(null);
  const billsManagerRef = useRef<BillsManagerHandle>(null);

  const activeTab: ActiveTab = searchParams.get("tab") === "installments" ? "installments" : "bills";

  const handleSectionChange = (nextTab: ActiveTab) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTab === "installments") {
      params.set("tab", "installments");
    } else {
      params.delete("tab");
    }

    const nextUrl = params.toString() ? `/mae?${params.toString()}` : "/mae";
    router.replace(nextUrl, { scroll: false });
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Heart}
        iconTone="accent"
        title="Mãe"
        description="Contas e parcelamentos da mãe, separados das suas finanças."
        actions={
          activeTab === "bills" ? (
            <Button onClick={() => billsManagerRef.current?.openCreateModal()} size="sm" variant="warning" className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nova Conta</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          ) : (
            <Button onClick={() => installmentsPanelRef.current?.openCreateModal()} size="sm" className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo parcelamento</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        <Tabs value={activeTab} onValueChange={(value) => handleSectionChange(value as ActiveTab)}>
          <TabsList className="h-auto rounded-xl border-border/80 bg-surface/80 p-1.5">
            <TabsTrigger
              value="bills"
              className={cn(
                "min-w-[120px] border border-transparent px-4 py-2",
                activeTab === "bills"
                  ? "!border-accent/70 !bg-accent !text-slate-950 !shadow-sm"
                  : "hover:bg-background/70"
              )}
            >
              Contas
            </TabsTrigger>
            <TabsTrigger
              value="installments"
              className={cn(
                "min-w-[140px] border border-transparent px-4 py-2",
                activeTab === "installments"
                  ? "!border-accent/70 !bg-accent !text-slate-950 !shadow-sm"
                  : "hover:bg-background/70"
              )}
            >
              Parcelamentos
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "bills" ? (
        <BillsManager ref={billsManagerRef} mode="only-mae" />
      ) : (
        <InstallmentsPanel ref={installmentsPanelRef} mode="only-mae" />
      )}
    </div>
  );
}
