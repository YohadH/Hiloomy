import { SigninForm } from "@/components/auth/signin-form";

// Public login URL — hiloomy.com/login. Same form as /signin; both routes
// stay live so older links keep working.

export default function LoginPage() {
  return <SigninForm />;
}
