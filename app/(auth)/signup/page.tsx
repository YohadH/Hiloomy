import { SignupForm } from "@/components/auth/signup-form";
import { getAppLocale } from "@/lib/i18n";

export default async function SignupPage() {
  // Locale: an explicit ?lang= is read client-side in the form; without
  // one the form falls back to this cookie-derived default.
  const defaultLocale = await getAppLocale();
  return <SignupForm defaultLocale={defaultLocale} />;
}
