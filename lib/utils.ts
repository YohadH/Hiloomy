import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Repair UTF-8 text that was decoded as Latin-1 somewhere upstream
 * ("תוכנית" → "ª×□×…"). Hebrew UTF-8 bytes start with 0xD7 which renders
 * as "×" in Latin-1, so a string dense with "×" is the classic
 * double-decode signature (F-091: bulk-imported affiliate data). Applies
 * only when the input matches the signature AND the re-decode yields
 * Hebrew — anything else passes through untouched.
 */
export function repairMojibake(value: string | null | undefined): string {
  const input = value ?? "";
  if (!input.includes("×")) return input;
  try {
    // latin1 → percent-escapes → UTF-8 decode. `escape` maps each Latin-1
    // code unit to %XX, which is exactly the byte-level round trip needed.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const repaired = decodeURIComponent(escape(input));
    return /[֐-׿]/.test(repaired) ? repaired : input;
  } catch {
    return input;
  }
}

export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDateRange(start: string | Date, end: string | Date, locale: "en-US" | "he-IL" = "en-US") {
  const startDate = start instanceof Date ? start : new Date(`${start}T00:00:00`);
  const endDate = end instanceof Date ? end : new Date(`${end}T00:00:00`);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const startLabel = formatter.format(startDate);
  const endLabel = formatter.format(endDate);

  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}
