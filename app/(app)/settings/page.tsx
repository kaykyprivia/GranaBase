"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { InstallAppSettings } from "@/components/settings/InstallAppSettings";
import { PreferenceSettings } from "@/components/settings/PreferenceSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { FinancialSettings } from "@/components/settings/FinancialSettings";
import {
  DEFAULT_PROFILE_FORM,
  DEFAULT_PREFERENCE_FORM,
  DEFAULT_FINANCIAL_FORM,
  type PlanType,
  type ProfileFormState,
  type PreferenceFormState,
  type FinancialFormState,
} from "@/components/settings/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseErrorMessage } from "@/lib/settings";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import type {
  InsertUserSettings,
  UpdateUserSettings,
  UserSettings,
} from "@/types/database";

type ProfileMatchField = "id" | "user_id" | null;

interface ProfileRecord {
  id?: string;
  user_id?: string;
  email?: string | null;
  full_name?: string | null;
}

interface ProfileLookupResult {
  matchField: ProfileMatchField;
  record: ProfileRecord | null;
}

function normalizePlan(rawPlan: unknown): PlanType {
  return typeof rawPlan === "string" && rawPlan.toLowerCase() === "pro" ? "pro" : "free";
}

function buildEmailFallback(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "Usuario";
}

function toTitleCase(value: string) {
  return value.trim().split(/\s+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function getDisplayName(form: ProfileFormState) {
  if (form.fullName.trim()) return toTitleCase(form.fullName);
  const prefix = form.email.split("@")[0] ?? "Granabase";
  return toTitleCase(prefix.replace(/[._-]+/g, " "));
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

async function findProfileRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ProfileLookupResult> {
  const byId = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (byId.data) return { matchField: "id", record: coerceData<ProfileRecord>(byId.data) };

  const byUserId = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (byUserId.data) return { matchField: "user_id", record: coerceData<ProfileRecord>(byUserId.data) };

  return { matchField: null, record: null };
}

export default function SettingsPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [supabase] = useState(() => createClient());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [exportingFinancial, setExportingFinancial] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [endingSessions, setEndingSessions] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileMatchField, setProfileMatchField] = useState<ProfileMatchField>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM);
  const [initialProfileForm, setInitialProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM);
  const [preferenceForm, setPreferenceForm] = useState<PreferenceFormState>(DEFAULT_PREFERENCE_FORM);
  const [initialPreferenceForm, setInitialPreferenceForm] = useState<PreferenceFormState>(DEFAULT_PREFERENCE_FORM);
  const [financialForm, setFinancialForm] = useState<FinancialFormState>(DEFAULT_FINANCIAL_FORM);
  const [initialFinancialForm, setInitialFinancialForm] = useState<FinancialFormState>(DEFAULT_FINANCIAL_FORM);
  const [plan, setPlan] = useState<PlanType>("free");
  const [lastAccess, setLastAccess] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) { router.push("/login"); return; }

      const [profileLookup, settingsResponse] = await Promise.all([
        findProfileRecord(supabase, user.id),
        supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      const settingsRow = settingsResponse.error
        ? null
        : coerceData<UserSettings | null>(settingsResponse.data ?? null);
      const profileRecord = profileLookup.record;
      const email = user.email ?? profileRecord?.email ?? "";
      const fullName =
        profileRecord?.full_name ??
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        buildEmailFallback(email);

      const nextProfileForm: ProfileFormState = {
        fullName,
        email,
        avatarUrl:
          settingsRow?.avatar_url ??
          (typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : "") ??
          "",
        phone:
          settingsRow?.phone ??
          (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "") ??
          "",
      };

      const nextFinancialForm: FinancialFormState = {
        primaryCurrency: settingsRow?.primary_currency ?? "BRL",
        monthlyGoalDefault: settingsRow?.monthly_goal_default ?? 0,
        defaultExpenseCategory: settingsRow?.default_expense_category ?? "Outro",
        customCategories: Array.isArray(settingsRow?.custom_categories) ? settingsRow.custom_categories : [],
      };

      const nextPreferenceForm: PreferenceFormState = {
        themePreference: settingsRow?.theme_preference ?? "dark",
        currencyFormat: settingsRow?.currency_format ?? "BRL",
        weekStart: settingsRow?.week_start ?? "monday",
      };

      setUserId(user.id);
      setProfileMatchField(profileLookup.matchField);
      setPlan(
        normalizePlan(
          settingsRow?.plan ??
            user.user_metadata?.plan ??
            user.user_metadata?.subscription_tier ??
            user.app_metadata?.plan
        )
      );
      setLastAccess(user.last_sign_in_at ?? null);
      setProfileForm(nextProfileForm);
      setInitialProfileForm(nextProfileForm);
      setPreferenceForm(nextPreferenceForm);
      setInitialPreferenceForm(nextPreferenceForm);
      setFinancialForm(nextFinancialForm);
      setInitialFinancialForm(nextFinancialForm);
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const profileDirty = JSON.stringify(profileForm) !== JSON.stringify(initialProfileForm);
  const preferenceDirty = JSON.stringify(preferenceForm) !== JSON.stringify(initialPreferenceForm);
  const financialDirty = JSON.stringify(financialForm) !== JSON.stringify(initialFinancialForm);

  const updateUserSettings = async (payload: Partial<InsertUserSettings & UpdateUserSettings>) => {
    if (!userId) throw new Error("Usuario nao autenticado.");
    const { error } = await supabase.from("user_settings").upsert(
      coerceMutation({ user_id: userId, ...payload })
    );
    if (error) throw error;
  };

  const handleProfileFieldChange = <K extends keyof ProfileFormState>(field: K, fieldValue: ProfileFormState[K]) => {
    setProfileForm((current) => ({ ...current, [field]: fieldValue }));
  };

  const handleFinancialFieldChange = <K extends keyof FinancialFormState>(field: K, fieldValue: FinancialFormState[K]) => {
    setFinancialForm((current) => ({ ...current, [field]: fieldValue }));
  };

  const handlePreferenceFieldChange = <K extends keyof PreferenceFormState>(field: K, fieldValue: PreferenceFormState[K]) => {
    setPreferenceForm((current) => ({ ...current, [field]: fieldValue }));
    if (field === "themePreference") {
      setTheme(fieldValue as PreferenceFormState["themePreference"]);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) { toast.error("Sessao nao encontrada. Entre novamente para continuar."); return; }
    const fullName = profileForm.fullName.trim();
    if (!fullName) { toast.error("Informe seu nome completo."); return; }

    setSavingProfile(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: fullName, name: fullName, phone: profileForm.phone.trim() || null, avatar_url: profileForm.avatarUrl.trim() || null },
      });
      if (authError) throw authError;

      if (profileMatchField === "id") {
        const { error } = await supabase.from("profiles").update(coerceMutation({ full_name: fullName })).eq("id", userId);
        if (error) throw error;
      }
      if (profileMatchField === "user_id") {
        const { error } = await supabase.from("profiles").update(coerceMutation({ full_name: fullName })).eq("user_id", userId);
        if (error) throw error;
      }

      await updateUserSettings({ phone: profileForm.phone.trim() || null, avatar_url: profileForm.avatarUrl.trim() || null });
      setInitialProfileForm(profileForm);
      toast.success("Perfil atualizado.");
      await loadSettings();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    try {
      await updateUserSettings({
        theme_preference: preferenceForm.themePreference,
        currency_format: preferenceForm.currencyFormat,
        week_start: preferenceForm.weekStart,
      });
      setInitialPreferenceForm(preferenceForm);
      toast.success("Preferencias salvas.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveFinancial = async () => {
    setSavingFinancial(true);
    try {
      await updateUserSettings({
        primary_currency: financialForm.primaryCurrency,
        monthly_goal_default: financialForm.monthlyGoalDefault,
        default_expense_category: financialForm.defaultExpenseCategory,
        custom_categories: financialForm.customCategories,
      });
      setInitialFinancialForm(financialForm);
      toast.success("Preferencias financeiras salvas.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSavingFinancial(false);
    }
  };

  const handleExport = async () => {
    if (!userId) return;
    setExportingFinancial(true);
    try {
      type ExpenseRow = { description: string; amount: number; category: string; spent_at: string };
      type IncomeRow = { description: string; amount: number; category: string; received_at: string };
      type BillRow = { name: string; amount: number; due_date: string | null; category: string | null };

      const [expensesRes, incomeRes, billsRes] = await Promise.all([
        supabase.from("expense_entries").select("description, amount, category, spent_at").eq("user_id", userId),
        supabase.from("income_entries").select("description, amount, category, received_at").eq("user_id", userId),
        supabase.from("bills").select("name, amount, due_date, category").eq("user_id", userId),
      ]);

      const expenses = (expensesRes.data ?? []) as unknown as ExpenseRow[];
      const income = (incomeRes.data ?? []) as unknown as IncomeRow[];
      const bills = (billsRes.data ?? []) as unknown as BillRow[];

      const rows: string[][] = [["tipo", "descricao", "valor", "data", "categoria"]];
      for (const row of expenses) {
        rows.push(["gasto", row.description, String(row.amount), row.spent_at, row.category]);
      }
      for (const row of income) {
        rows.push(["entrada", row.description, String(row.amount), row.received_at, row.category]);
      }
      for (const row of bills) {
        rows.push(["conta", row.name, String(row.amount), row.due_date ?? "", row.category ?? ""]);
      }

      const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `granabase-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados.");
    } catch {
      toast.error("Erro ao exportar dados.");
    } finally {
      setExportingFinancial(false);
    }
  };

  const handleChangePassword = async (nextPassword: string) => {
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      toast.success("Senha atualizada.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
      throw error;
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEndSessions = async () => {
    setEndingSessions(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("Outras sessoes foram encerradas.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
      throw error;
    } finally {
      setEndingSessions(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Conta excluida com sucesso.");
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
      throw error;
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const toastId = toast.loading("Enviando foto...");
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/avatar/upload", { method: "POST", body: form });
      const json = await res.json() as { url?: string; error?: string };

      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Erro ao enviar foto.");
      }

      await supabase.auth.updateUser({ data: { avatar_url: json.url } });
      await updateUserSettings({ avatar_url: json.url });

      setProfileForm((prev) => ({ ...prev, avatarUrl: json.url! }));
      setInitialProfileForm((prev) => ({ ...prev, avatarUrl: json.url! }));
      toast.success("Foto atualizada.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto.", { id: toastId });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessao encerrada");
    router.push("/login");
  };

  const displayName = getDisplayName(profileForm);
  const initials = getInitials(displayName);

  return (
    <div className="page-container animate-fade-in">
      {/* Profile Hero */}
      <div className="mb-6 rounded-2xl border border-border/80 bg-surface/95 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative h-14 w-14 shrink-0 rounded-full overflow-hidden group cursor-pointer"
            title="Alterar foto"
          >
            {profileForm.avatarUrl ? (
              <img src={profileForm.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-sky-400 via-sky-300 to-cyan-300 flex items-center justify-center text-base font-bold text-slate-950">
                {loading ? "…" : initials}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="h-4 w-4 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleAvatarUpload(e)}
          />
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <p className="text-base font-semibold text-text-primary">{displayName}</p>
                  <Badge variant={plan === "pro" ? "warning" : "secondary"}>
                    {plan === "pro" ? "Pro" : "Free"}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">{profileForm.email || "—"}</p>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleLogout()}
            className="gap-2 shrink-0 text-expense hover:text-expense hover:border-expense/50"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <ProfileSettings
            value={profileForm}
            loading={loading}
            saving={savingProfile}
            dirty={profileDirty}
            onFieldChange={handleProfileFieldChange}
            onSave={() => void handleSaveProfile()}
            onReset={() => setProfileForm(initialProfileForm)}
          />
          <PreferenceSettings
            value={preferenceForm}
            loading={loading}
            saving={savingPreferences}
            dirty={preferenceDirty}
            onFieldChange={handlePreferenceFieldChange}
            onSave={() => void handleSavePreferences()}
            onReset={() => {
              setPreferenceForm(initialPreferenceForm);
              setTheme(initialPreferenceForm.themePreference);
            }}
          />
          <FinancialSettings
            value={financialForm}
            loading={loading}
            saving={savingFinancial}
            exporting={exportingFinancial}
            dirty={financialDirty}
            onFieldChange={handleFinancialFieldChange}
            onSave={() => void handleSaveFinancial()}
            onReset={() => setFinancialForm(initialFinancialForm)}
            onExport={() => void handleExport()}
          />
        </div>

        <div className="space-y-6">
          <SecuritySettings
            loading={loading}
            changingPassword={changingPassword}
            endingSessions={endingSessions}
            lastAccess={lastAccess}
            onChangePassword={handleChangePassword}
            onEndSessions={handleEndSessions}
          />
          <AccountSettings
            loading={loading}
            plan={plan}
            email={profileForm.email}
            deletingAccount={deletingAccount}
            onDeleteAccount={handleDeleteAccount}
          />
          <InstallAppSettings />
        </div>
      </div>
    </div>
  );
}
