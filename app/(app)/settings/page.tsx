"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, LockKeyhole, LogOut, Save, Settings, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import type { Profile } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { useRouter } from "next/navigation";

interface SettingsState {
  email: string;
  fullName: string;
  avatarUrl: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<SettingsState>({
    email: "",
    fullName: "",
    avatarUrl: "",
  });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    if (error) {
      toast.error("Erro ao carregar configuracoes");
      setLoading(false);
      return;
    }

    const profileData = coerceData<Profile>(data);
    setProfile(profileData);
    setState({
      email: profileData.email,
      fullName: profileData.full_name ?? "",
      avatarUrl: profileData.avatar_url ?? "",
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(coerceMutation({
          full_name: state.fullName || null,
          avatar_url: state.avatarUrl || null,
        }))
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      toast.success("Configuracoes salvas");
      await fetchProfile();
    } catch {
      toast.error("Nao foi possivel salvar suas configuracoes");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessao encerrada");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Settings}
        iconTone="warning"
        title="Configuracoes"
        description="Gerencie perfil, seguranca operacional e o que voce quer ver no produto."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Ambiente" value="Producao" icon={ShieldCheck} variant="profit" loading={loading} />
        <StatCard title="Tema" value="Dark premium" icon={Settings} variant="accent" loading={loading} />
        <StatCard title="Privacidade" value="RLS ativo" icon={LockKeyhole} variant="warning" loading={loading} />
        <StatCard title="Sessao" value={profile ? "Ativa" : "Offline"} icon={UserRound} variant="default" loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <FormField label="Nome completo" required>
                  <Input value={state.fullName} onChange={(event) => setState((current) => ({ ...current, fullName: event.target.value }))} />
                </FormField>

                <FormField label="Email">
                  <Input value={state.email} disabled />
                </FormField>

                <FormField label="URL do avatar">
                  <Input value={state.avatarUrl} onChange={(event) => setState((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://..." />
                </FormField>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    Salvar alteracoes
                  </Button>
                  <Button type="button" variant="outline" onClick={fetchProfile}>
                    Recarregar
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seguranca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-text-secondary">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-text-primary">
                  <ShieldCheck className="h-4 w-4 text-profit" />
                  <span className="font-medium">Dados isolados por usuario</span>
                </div>
                <p>O banco usa Row Level Security para garantir que cada conta veja apenas seus proprios dados.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-text-primary">
                  <LockKeyhole className="h-4 w-4 text-warning" />
                  <span className="font-medium">Sessao protegida por Supabase Auth</span>
                </div>
                <p>Login, cookies de sessao e refresh token estao centralizados na integracao SSR do projeto.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferencias do app</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-text-secondary">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-text-primary">
                  <BellRing className="h-4 w-4 text-accent" />
                  <span className="font-medium">Alertas visuais</span>
                </div>
                <p>O produto prioriza contas vencendo, parcelas futuras e folga estimada no dashboard principal.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-text-primary">
                  <Settings className="h-4 w-4 text-warning" />
                  <span className="font-medium">Modo visual</span>
                </div>
                <p>O app esta otimizado para dark mode premium com foco em leitura, contraste e densidade profissional.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Encerrar sessao
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
