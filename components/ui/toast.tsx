"use client";

// Toast primitive — thin wrapper around Sonner with locale + RTL awareness.
//
// Usage from any client component:
//
//   import { toast } from "@/components/ui/toast";
//   toast.success("שמור");
//   toast.error(err, { fallback: "לא הצלחנו לשמור" });
//   toast.info("מסונכרן…");
//
// The error() variant is deliberately opinionated: it accepts a raw
// unknown error and only surfaces a friendly Hebrew message. Raw stack
// text or JSON blobs never leak to the user. Callers can pass an
// override string via `{ description }` for context.

import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import type { AppLocale } from "@/lib/i18n";

export interface ToastErrorOptions {
  // Hebrew (or English) headline shown to the user. Falls back to a
  // generic message when omitted.
  fallback?: string;
  // Optional sub-line — e.g. "בדוק את החיבור לאינטרנט".
  description?: string;
  // Only send this to the console; the user sees `fallback`.
  logAs?: string;
}

function extractSafeErrorText(err: unknown): string | null {
  if (typeof err === "string") return err.length > 200 ? null : err;
  if (err instanceof Error) {
    // Only surface the message if it looks like a plain sentence, not a
    // stack trace, JSON blob, or SDK dump.
    const msg = err.message;
    if (!msg || msg.length > 200) return null;
    if (msg.includes("{") || msg.includes("<!DOCTYPE")) return null;
    if (msg.split("\n").length > 2) return null;
    return msg;
  }
  return null;
}

export const toast = {
  success: (message: string, options?: { description?: string }) =>
    sonnerToast.success(message, options),
  info: (message: string, options?: { description?: string }) =>
    sonnerToast(message, options),
  warning: (message: string, options?: { description?: string }) =>
    sonnerToast.warning(message, options),
  // Error toast — always safe; never leaks raw stacks.
  error: (err: unknown, options: ToastErrorOptions = {}) => {
    const safeText = extractSafeErrorText(err);
    const headline = options.fallback ?? "משהו השתבש. נסו שוב.";
    const description = options.description ?? (safeText ?? undefined);
    // Log the full raw error for the developer regardless.
    console.error(options.logAs ?? "[toast:error]", err);
    return sonnerToast.error(headline, description ? { description } : undefined);
  },
  loading: (message: string) => sonnerToast.loading(message),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id)
};

// Root-level Toaster component. Mount once inside the app root layout so
// every route sees toasts. Positioned bottom-center on mobile, top-right
// on desktop (or top-left in RTL locales) — matches the operator's scan
// path in Hebrew.
export function Toaster({ locale }: { locale: AppLocale }) {
  const isHe = locale === "he";
  return (
    <SonnerToaster
      dir={isHe ? "rtl" : "ltr"}
      position={isHe ? "top-left" : "top-right"}
      richColors
      closeButton
      toastOptions={{
        className: "font-sans",
        style: {
          fontFamily: 'inherit'
        }
      }}
    />
  );
}
