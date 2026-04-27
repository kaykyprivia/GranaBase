"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    prompt: () => Promise<void>;
    userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
  }
}

function isIosDevice(userAgent: string) {
  return /iphone|ipad|ipod/i.test(userAgent);
}

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const standaloneMatch = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone =
    typeof navigator !== "undefined" &&
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return standaloneMatch || navigatorStandalone;
}

export function InstallAppSettings() {
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

    setIsIos(isIosDevice(userAgent));
    setInstalled(isStandaloneMode());
    setLoading(false);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      toast.success("GranaBase instalado com sucesso.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const availabilityCopy = useMemo(() => {
    if (installed) {
      return {
        title: "App instalado",
        description: "O GranaBase ja esta instalado neste dispositivo e pronto para abrir como app.",
      };
    }

    if (isIos) {
      return {
        title: "Instalacao manual no iPhone",
        description: "No iPhone, toque em compartilhar e selecione 'Adicionar a Tela de Inicio'.",
      };
    }

    if (canInstall) {
      return {
        title: "Instalacao disponivel",
        description: "Seu navegador permite instalar o GranaBase com experiencia de app nativo.",
      };
    }

    return {
      title: "Instalacao automatica indisponivel",
      description: "Instalacao automatica indisponivel neste navegador.",
    };
  }, [canInstall, installed, isIos]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        toast.success("Instalacao iniciada.");
      } else {
        toast.message("Instalacao cancelada.");
      }
    } catch {
      toast.error("Nao foi possivel abrir o instalador agora.");
    } finally {
      setDeferredPrompt(null);
      setCanInstall(false);
      setInstalling(false);
    }
  };

  return (
    <Card className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <CardTitle>Instalar aplicativo</CardTitle>
        <CardDescription>
          Instale o GranaBase no seu celular ou computador para acessar mais rapido, como um app nativo.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                {installed ? (
                  <CheckCircle2 className="h-4 w-4 text-profit" />
                ) : isIos ? (
                  <Smartphone className="h-4 w-4 text-warning" />
                ) : canInstall ? (
                  <Download className="h-4 w-4 text-accent" />
                ) : (
                  <Info className="h-4 w-4 text-text-secondary" />
                )}
                {availabilityCopy.title}
              </div>

              <p className="text-sm text-text-secondary">{availabilityCopy.description}</p>

              {installed && (
                <div className="mt-4">
                  <Badge variant="profit">App instalado</Badge>
                </div>
              )}

              {isIos && !installed && (
                <div className="mt-4 space-y-1 rounded-xl border border-warning/20 bg-warning/10 p-3 text-sm text-text-secondary">
                  <p>1. Toque em Compartilhar</p>
                  <p>2. Depois em &quot;Adicionar a Tela de Inicio&quot;</p>
                </div>
              )}
            </div>

            {canInstall && !installed && (
              <Button type="button" onClick={handleInstall} loading={installing} className="gap-2">
                <Download className="h-4 w-4" />
                Instalar GranaBase
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
