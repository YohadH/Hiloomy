import { SigninForm } from "@/components/auth/signin-form";
import { getAppLocale } from "@/lib/i18n";

export default async function SigninPage() {
  const defaultLocale = await getAppLocale();
  return <SigninForm defaultLocale={defaultLocale} />;
}
