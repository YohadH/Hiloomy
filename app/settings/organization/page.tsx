import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { TeamManagement } from "@/components/settings/team-management";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/settings/organization" as never);
  if (!auth.orgId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-muted-foreground">No active organization.</p>
      </main>
    );
  }

  const db = getDb();
  const org = (await db.organization.findUnique({
    where: { id: auth.orgId },
    select: {
      name: true,
      slug: true,
      plan: true,
      currency: true,
      locale: true,
      billingCountry: true,
      trialEndsAt: true,
      createdAt: true,
      _count: { select: { memberships: true, stores: true } }
    }
  })) as {
    name: string;
    slug: string;
    plan: string;
    currency: string;
    locale: string;
    billingCountry: string | null;
    trialEndsAt: Date | null;
    createdAt: Date;
    _count: { memberships: number; stores: number };
  } | null;

  if (!org) redirect("/");

  const t =
    auth.locale === "he"
      ? {
          title: "הגדרות ארגון",
          subtitle: "שם הארגון, מטבע וחברי הצוות",
          plan: "מסלול נוכחי",
          trial: "תקופת ניסיון מסתיימת",
          members: "חברי צוות",
          brands: "מותגים מחוברים",
          adminOnly: "רק בעלים ומנהלים יכולים לשנות הגדרות אלו."
        }
      : {
          title: "Organization settings",
          subtitle: "Brand name, currency, and team members",
          plan: "Current plan",
          trial: "Trial ends",
          members: "Team members",
          brands: "Connected brands",
          adminOnly: "Only owners and admins can change these settings."
        };

  const isAdmin = auth.role === "owner" || auth.role === "admin";

  // Team list — memberships + pending invitations.
  const teamData = await Promise.all([
    db.membership.findMany({
      where: { orgId: auth.orgId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    db.invitation.findMany({
      where: { orgId: auth.orgId },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const memberships = teamData[0] as Array<{
    id: string;
    role: string;
    createdAt: Date;
    user: { id: string; email: string; displayName: string | null };
  }>;
  const invitations = teamData[1] as Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
    createdAt: Date;
  }>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t.plan}
          </p>
          <p className="mt-1 text-lg font-semibold capitalize">{org.plan}</p>
          {org.trialEndsAt && org.plan === "trial" ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t.trial}: {new Intl.DateTimeFormat(auth.locale === "he" ? "he-IL" : "en-US").format(org.trialEndsAt)}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t.brands}
          </p>
          <p className="mt-1 text-lg font-semibold">{org._count.stores}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t.members}: {org._count.memberships}
          </p>
        </div>
      </div>

      {!isAdmin ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {t.adminOnly}
        </p>
      ) : null}

      <OrganizationSettingsForm
        initialName={org.name}
        initialSlug={org.slug}
        initialCurrency={org.currency}
        initialLocale={org.locale === "en" ? "en" : "he"}
        initialBillingCountry={org.billingCountry ?? ""}
        canEdit={isAdmin}
        viewerLocale={auth.locale === "he" ? "he" : "en"}
      />

      <div className="mt-8">
        <TeamManagement
          memberships={memberships.map((m) => ({
            id: m.id,
            email: m.user.email,
            displayName: m.user.displayName,
            role: m.role,
            isYou: m.user.id === auth.userId
          }))}
          invitations={invitations.map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            expiresAt: inv.expiresAt.toISOString()
          }))}
          canEdit={isAdmin}
          viewerLocale={auth.locale === "he" ? "he" : "en"}
        />
      </div>
    </main>
  );
}
