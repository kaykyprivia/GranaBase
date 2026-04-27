export type ThemePreference = "dark" | "light";
export type CurrencyCode = "BRL" | "USD";
export type WeekStart = "monday" | "sunday";
export type PlanType = "free" | "pro";

export interface ProfileFormState {
  fullName: string;
  email: string;
  avatarUrl: string;
  phone: string;
}

export interface PreferenceFormState {
  themePreference: ThemePreference;
  currencyFormat: CurrencyCode;
  privacyMode: boolean;
  weekStart: WeekStart;
  notificationsEnabled: boolean;
}

export interface FinancialFormState {
  primaryCurrency: CurrencyCode;
  monthlyGoalDefault: number;
  defaultExpenseCategory: string;
}

export const DEFAULT_PROFILE_FORM: ProfileFormState = {
  fullName: "",
  email: "",
  avatarUrl: "",
  phone: "",
};

export const DEFAULT_PREFERENCE_FORM: PreferenceFormState = {
  themePreference: "dark",
  currencyFormat: "BRL",
  privacyMode: false,
  weekStart: "monday",
  notificationsEnabled: true,
};

export const DEFAULT_FINANCIAL_FORM: FinancialFormState = {
  primaryCurrency: "BRL",
  monthlyGoalDefault: 0,
  defaultExpenseCategory: "Outro",
};
