import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getAppLocale } from "@/lib/i18n";

export default async function ForgotPasswordPage() {
  const defaultLocale = await getAppLocale();
  return <ForgotPasswordForm defaultLocale={defaultLocale} />;
}
