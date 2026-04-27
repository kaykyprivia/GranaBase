"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { FinancialSettings } from "@/components/settings/FinancialSettings";
import { PreferenceSettings } from "@/components/settings/PreferenceSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import {
  DEFAULT_FINANCIAL_FORM,
  DEFAULT_PREFERENCE_FORM,
  DEFAULT_PROFILE_FORM,
  type FinancialFormState,
  type PlanType,
  type PreferenceFormState,
  type ProfileFormState,
} from "@/components/settings/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/shared/PageIntro";
import { buildSettingsExportCsv, getSupabaseErrorMessage } from "@/lib/settings";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import type {
  Bill,
  ExpenseEntry,
  FinancialGoal,
  IncomeEntry,
  InsertUserSettings,
  Installment,
  InstallmentPayment,
  Investment,
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

async function findProfileRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ProfileLookupResult> {
  const byId = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (byId.data) {
    return {
      matchField: "id",
      record: coerceData<ProfileRecord>(byId.data),
    };
  }

  const byUserId = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();

  if (byUserId.data) {
    return {
      matchField: "user_id",
      record: coerceData<ProfileRecord>(byUserId.data),
    };
  }

  return { matchField: null, record: null };
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [endingSessions, setEndingSessions] = useState(false);
  const [exporting, setExporting] = useState(false);
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      const [profileLookup, settingsResponse] = await Promise.all([
        findProfileRecord(supabase, user.id),
        supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      const settingsRow = settingsResponse.error ? null : coerceData<UserSettings | null>(settingsResponse.data ?? null);
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

      const nextPreferenceForm: PreferenceFormState = {
        themePreference: settingsRow?.theme_preference ?? DEFAULT_PREFERENCE_FORM.themePreference,
        currencyFormat: settingsRow?.currency_format ?? DEFAULT_PREFERENCE_FORM.currencyFormat,
        privacyMode: settingsRow?.privacy_mode ?? DEFAULT_PREFERENCE_FORM.privacyMode,
        weekStart: settingsRow?.week_start ?? DEFAULT_PREFERENCE_FORM.weekStart,
        notificationsEnabled:
          settingsRow?.notifications_enabled ?? DEFAULT_PREFERENCE_FORM.notificationsEnabled,
      };

      const nextFinancialForm: FinancialFormState = {
        primaryCurrency: settingsRow?.primary_currency ?? DEFAULT_FINANCIAL_FORM.primaryCurrency,
        monthlyGoalDefault: settingsRow?.monthly_goal_default ?? DEFAULT_FINANCIAL_FORM.monthlyGoalDefault,
        defaultExpenseCategory:
          settingsRow?.default_expense_category ?? DEFAULT_FINANCIAL_FORM.defaultExpenseCategory,
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

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const profileDirty = JSON.stringify(profileForm) !== JSON.stringify(initialProfileForm);
  const preferenceDirty = JSON.stringify(preferenceForm) !== JSON.stringify(initialPreferenceForm);
  const financialDirty = JSON.stringify(financialForm) !== JSON.stringify(initialFinancialForm);
  const unsavedSections = [profileDirty, preferenceDirty, financialDirty].filter(Boolean).length;

  const updateUserSettings = async (payload: Partial<InsertUserSettings & UpdateUserSettings>) => {
    if (!userId) {
      throw new Error("Usuario nao autenticado.");
    }

    const { error } = await supabase.from("user_settings").upsert(
      coerceMutation({
        user_id: userId,
        ...payload,
      })
    );

    if (error) {
      throw error;
    }
  };

  const handleProfileFieldChange = <K extends keyof ProfileFormState>(
    field: K,
    fieldValue: ProfileFormState[K]
  ) => {
    setProfileForm((current) => ({ ...current, [field]: fieldValue }));
  };

  const handlePreferenceFieldChange = <K extends keyof PreferenceFormState>(
    field: K,
    fieldValue: PreferenceFormState[K]
  ) => {
    setPreferenceForm((current) => ({ ...current, [field]: fieldValue }));
  };

  const handleFinancialFieldChange = <K extends keyof FinancialFormState>(
    field: K,
    fieldValue: FinancialFormState[K]
  ) => {
    setFinancialForm((current) => ({ ...current, [field]: fieldValue }));
  };

  const handleSaveProfile = async () => {
    if (!userId) {
      toast.error("Sessao nao encontrada. Entre novamente para continuar.");
      return;
    }

    const fullName = profileForm.fullName.trim();

    if (!fullName) {
      toast.error("Informe seu nome completo.");
      return;
    }

    setSavingProfile(true);

    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          name: fullName,
          phone: profileForm.phone.trim() || null,
          avatar_url: profileForm.avatarUrl.trim() || null,
        },
      });

      if (authError) {
        throw authError;
      }

      if (profileMatchField === "id") {
        const { error } = await supabase
          .from("profiles")
          .update(coerceMutation({ full_name: fullName }))
          .eq("id", userId);

        if (error) {
          throw error;
        }
      }

      if (profileMatchField === "user_id") {
        const { error } = await supabase
          .from("profiles")
          .update(coerceMutation({ full_name: fullName }))
          .eq("user_id", userId);

        if (error) {
          throw error;
        }
      }

      await updateUserSettings({
        phone: profileForm.phone.trim() || null,
        avatar_url: profileForm.avatarUrl.trim() || null,
      });

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
    if (!userId) {
      toast.error("Sessao nao encontrada. Entre novamente para continuar.");
      return;
    }

    setSavingPreferences(true);

    try {
      await updateUserSettings({
        theme_preference: preferenceForm.themePreference,
        currency_format: preferenceForm.currencyFormat,
        privacy_mode: preferenceForm.privacyMode,
        week_start: preferenceForm.weekStart,
        notifications_enabled: preferenceForm.notificationsEnabled,
      });

      setInitialPreferenceForm(preferenceForm);
      toast.success("Preferencias salvas.");
      await loadSettings();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveFinancial = async () => {
    if (!userId) {
      toast.error("Sessao nao encontrada. Entre novamente para continuar.");
      return;
    }

    if (financialForm.monthlyGoalDefault < 0) {
      toast.error("A meta mensal padrao precisa ser maior ou igual a zero.");
      return;
    }

    setSavingFinancial(true);

    try {
      await updateUserSettings({
        primary_currency: financialForm.primaryCurrency,
        monthly_goal_default: financialForm.monthlyGoalDefault,
        default_expense_category: financialForm.defaultExpenseCategory,
      });

      setInitialFinancialForm(financialForm);
      toast.success("Preferencias financeiras salvas.");
      await loadSettings();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSavingFinancial(false);
    }
  };

  const handleChangePassword = async (nextPassword: string) => {
    setChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });

      if (error) {
        throw error;
      }

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

      if (error) {
        throw error;
      }

      toast.success("Outras sessoes foram encerradas.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
      throw error;
    } finally {
      setEndingSessions(false);
    }
  };

  const handleExportData = async () => {
    if (!userId) {
      toast.error("Sessao nao encontrada. Entre novamente para continuar.");
      return;
    }

    setExporting(true);

    try {
      const [
        incomeResponse,
        expenseResponse,
        billsResponse,
        installmentsResponse,
        installmentPaymentsResponse,
        investmentsResponse,
        goalsResponse,
      ] = await Promise.all([
        supabase.from("income_entries").select("*").eq("user_id", userId).order("received_at", { ascending: false }),
        supabase.from("expense_entries").select("*").eq("user_id", userId).order("spent_at", { ascending: false }),
        supabase.from("bills").select("*").eq("user_id", userId).order("due_date", { ascending: false }),
        supabase.from("installments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase
          .from("installment_payments")
          .select("*")
          .eq("user_id", userId)
          .order("due_date", { ascending: false }),
        supabase.from("investments").select("*").eq("user_id", userId).order("invested_at", { ascending: false }),
        supabase.from("financial_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);

      const firstError =
        incomeResponse.error ??
        expenseResponse.error ??
        billsResponse.error ??
        installmentsResponse.error ??
        installmentPaymentsResponse.error ??
        investmentsResponse.error ??
        goalsResponse.error;

      if (firstError) {
        throw firstError;
      }

      const csv = buildSettingsExportCsv({
        incomeEntries: coerceData<IncomeEntry[]>(incomeResponse.data ?? []),
        expenseEntries: coerceData<ExpenseEntry[]>(expenseResponse.data ?? []),
        bills: coerceData<Bill[]>(billsResponse.data ?? []),
        installments: coerceData<Installment[]>(installmentsResponse.data ?? []),
        installmentPayments: coerceData<InstallmentPayment[]>(installmentPaymentsResponse.data ?? []),
        investments: coerceData<Investment[]>(investmentsResponse.data ?? []),
        financialGoals: coerceData<FinancialGoal[]>(goalsResponse.data ?? []),
      });

      downloadCsv(`granabase-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success("Exportacao concluida.");
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);

    try {
      const { error } = await supabase.rpc("delete_my_account");

      if (error) {
        throw error;
      }

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

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Settings}
        iconTone="warning"
        title="Configuracoes"
        description="Gerencie sua conta e personalize sua experiencia com controles realmente uteis para o seu dia a dia financeiro."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={unsavedSections > 0 ? "warning" : "secondary"}>
              {unsavedSections > 0
                ? `${unsavedSections} ${unsavedSections === 1 ? "secao pendente" : "secoes pendentes"}`
                : "Tudo salvo"}
            </Badge>
            <Button type="button" variant="outline" onClick={() => void loadSettings()} disabled={loading}>
              Recarregar dados
            </Button>
          </div>
        }
      />

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
            onReset={() => setPreferenceForm(initialPreferenceForm)}
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

          <FinancialSettings
            value={financialForm}
            loading={loading}
            saving={savingFinancial}
            exporting={exporting}
            dirty={financialDirty}
            onFieldChange={handleFinancialFieldChange}
            onSave={() => void handleSaveFinancial()}
            onReset={() => setFinancialForm(initialFinancialForm)}
            onExport={() => void handleExportData()}
          />

          <AccountSettings
            loading={loading}
            plan={plan}
            email={profileForm.email}
            deletingAccount={deletingAccount}
            onDeleteAccount={handleDeleteAccount}
          />
        </div>
      </div>
    </div>
  );
}
