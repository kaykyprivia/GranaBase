import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Own copy of the classname helper — the spreadsheets module does not import
 * from `lib/` to stay fully independent from the rest of the app.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
