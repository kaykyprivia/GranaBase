export const MAE_USER_ID = "6d26a689-112c-4759-8e99-28d5247a94fe";

export function isMaeName(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return normalized.includes("mae");
}

export type MaeFilterMode = "exclude-mae" | "only-mae";

export function appliesMaeFilter(userId: string, mode: MaeFilterMode, name: string | null | undefined): boolean {
  if (userId !== MAE_USER_ID) {
    return mode === "exclude-mae";
  }
  return mode === "only-mae" ? isMaeName(name) : !isMaeName(name);
}
