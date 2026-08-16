import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string; next?: string }>;
}) {
  // searchParams is a Promise in Next.js 15 — resolved inside the
  // client component via the `next` query param. Locale default falls
  // back to Hebrew (Israel-first launch).
  return <SignupForm />;
}
