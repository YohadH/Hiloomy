import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAppLocale } from "@/lib/i18n";

export default async function ResetPasswordPage() {
  const defaultLocale = await getAppLocale();
  return <ResetPasswordForm defaultLocale={defaultLocale} />;
}
