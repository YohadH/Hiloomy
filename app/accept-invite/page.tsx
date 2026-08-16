import { redirect } from "next/navigation";
import { getDb } from "@/lib/server/db";
import { getAuthContext } from "@/lib/auth/session";
import { getAppLocale } from "@/lib/i18n";

// /accept-invite?token=<token>
//
// Three flows:
//   1. Token invalid / expired / revoked → friendly error
//   2. Recipient not signed in → redirect to /signin?next=/accept-invite?token=…
//      so they sign in (or sign up) with the email the invite was sent to
//   3. Recipient signed in → consume token: delete invitation, create
//      Membership, set their active org cookie, redirect to /

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim();
  const locale = await getAppLocale();
  const isHe = locale === "he";

  const t = isHe
    ? {
        invalid: "ההזמנה אינה תקפה או שפג תוקפה.",
        backHome: "חזרה לדף הבית",
        emailMismatch: "ההזמנה נשלחה לכתובת אימייל אחרת. התחברו מחדש עם הכתובת הנכונה."
      }
    : {
        invalid: "This invitation is invalid or has expired.",
        backHome: "Back to home",
        emailMismatch: "This invitation was sent to a different email. Sign in with the matching address."
      };

  if (!token) return errorPage(t.invalid, t.backHome);

  const db = getDb();
  const invitation = (await db.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      orgId: true,
      email: true,
      role: true,
      expiresAt: true
    }
  })) as {
    id: string;
    orgId: string;
    email: string;
    role: string;
    expiresAt: Date;
  } | null;

  if (!invitation || invitation.expiresAt.getTime() < Date.now()) {
    return errorPage(t.invalid, t.backHome);
  }

  const auth = await getAuthContext();
  if (!auth.userId) {
    redirect(`/signin?next=/accept-invite?token=${encodeURIComponent(token)}` as never);
  }
  if (auth.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return errorPage(t.emailMismatch, t.backHome);
  }

  // Consume the invitation: delete it + create the Membership.
  await db.$transaction([
    db.membership.create({
      data: {
        userId: auth.userId!,
        orgId: invitation.orgId,
        role: invitation.role
      }
    }),
    db.invitation.delete({ where: { id: invitation.id } })
  ]);

  // Set the active org cookie to the org they just joined.
  const { cookies } = await import("next/headers");
  const c = await cookies();
  c.set("active_org_id", invitation.orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  redirect("/");
}

function errorPage(message: string, backLabel: string) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-background to-amber-50">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
        <h1 className="text-xl font-bold tracking-tight mb-2">⚠</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <a
          href="/"
          className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground underline"
        >
          {backLabel}
        </a>
      </div>
    </main>
  );
}
