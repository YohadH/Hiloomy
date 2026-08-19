import { SigninForm } from "@/components/auth/signin-form";
import { getAppLocale } from "@/lib/i18n";

// Public login URL — hiloomy.com/login. Same form as /signin; both routes
// stay live so older links keep working.

export default async function LoginPage() {
  const defaultLocale = await getAppLocale();
  return <SigninForm defaultLocale={defaultLocale} />;
}
