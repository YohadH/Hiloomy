"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Users, Clock, X, MoreHorizontal } from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  isYou: boolean;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function TeamManagement({
  memberships,
  invitations,
  canEdit,
  viewerLocale
}: {
  memberships: TeamMember[];
  invitations: PendingInvitation[];
  canEdit: boolean;
  viewerLocale: "he" | "en";
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = viewerLocale === "he"
    ? {
        title: "צוות",
        subtitle: "חברי הארגון והזמנות בהמתנה",
        membersTitle: "חברי צוות",
        pendingTitle: "הזמנות בהמתנה",
        invite: "הזמינו חבר",
        emailLabel: "אימייל",
        roleLabel: "תפקיד",
        member: "חבר",
        admin: "מנהל",
        owner: "בעלים",
        you: "(אתם)",
        sendInvite: "שלחו הזמנה",
        sending: "שולח…",
        sentMsg: "ההזמנה נשלחה.",
        revoke: "ביטול",
        revoking: "מבטל…",
        noPending: "אין הזמנות בהמתנה.",
        expiresOn: "פג תוקף ב-",
        actions: "פעולות",
        changeRole: "שנו תפקיד",
        remove: "הסרה",
        removing: "מסיר…",
        confirmRemove: "להסיר חבר זה מהארגון?",
        makeOwner: "הפכו לבעלים",
        makeAdmin: "הפכו למנהל",
        makeMember: "הפכו לחבר"
      }
    : {
        title: "Team",
        subtitle: "Organization members and pending invitations",
        membersTitle: "Members",
        pendingTitle: "Pending invitations",
        invite: "Invite a teammate",
        emailLabel: "Email",
        roleLabel: "Role",
        member: "Member",
        admin: "Admin",
        owner: "Owner",
        you: "(you)",
        sendInvite: "Send invitation",
        sending: "Sending…",
        sentMsg: "Invitation sent.",
        revoke: "Revoke",
        revoking: "Revoking…",
        noPending: "No pending invitations.",
        expiresOn: "Expires ",
        actions: "Actions",
        changeRole: "Change role",
        remove: "Remove",
        removing: "Removing…",
        confirmRemove: "Remove this member from the organization?",
        makeOwner: "Make owner",
        makeAdmin: "Make admin",
        makeMember: "Make member"
      };

  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);

  const handleChangeRole = async (membershipId: string, role: "owner" | "admin" | "member") => {
    setMemberBusy(membershipId);
    setError(null);
    try {
      const res = await fetch("/api/settings/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, role })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setMemberBusy(null);
      setMemberMenu(null);
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!window.confirm(t.confirmRemove)) return;
    setMemberBusy(membershipId);
    setError(null);
    try {
      const res = await fetch(`/api/settings/team/member?membershipId=${encodeURIComponent(membershipId)}`, {
        method: "DELETE"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setMemberBusy(null);
      setMemberMenu(null);
    }
  };

  const handleInvite = async () => {
    setSubmitting(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed.");
      setSavedMsg(t.sentMsg);
      setInviteEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setRevoking(invitationId);
    setError(null);
    try {
      const res = await fetch("/api/settings/team/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setRevoking(null);
    }
  };

  const roleLabel = (r: string) => (r === "owner" ? t.owner : r === "admin" ? t.admin : t.member);

  return (
    <div dir={viewerLocale === "he" ? "rtl" : "ltr"} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Members list */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/70 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="me-1 inline h-3 w-3" aria-hidden />
            {t.membersTitle} ({memberships.length})
          </p>
        </div>
        <ul className="divide-y divide-border/70">
          {memberships.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {m.displayName ?? m.email}
                  {m.isYou ? <span className="ms-1 text-muted-foreground text-xs">{t.you}</span> : null}
                </p>
                {m.displayName ? (
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground capitalize shrink-0">
                {roleLabel(m.role)}
              </span>
              {canEdit && !m.isYou ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMemberMenu(memberMenu === m.id ? null : m.id)}
                    disabled={memberBusy === m.id}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-card p-1 text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
                    aria-label={t.actions}
                  >
                    {memberBusy === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                  {memberMenu === m.id ? (
                    <div className="absolute end-0 top-full z-10 mt-1 min-w-[180px] rounded-md border border-border bg-card shadow-lg overflow-hidden text-xs">
                      {m.role !== "owner" ? (
                        <button
                          type="button"
                          onClick={() => handleChangeRole(m.id, "owner")}
                          className="block w-full text-start px-3 py-1.5 hover:bg-muted/60"
                        >
                          {t.makeOwner}
                        </button>
                      ) : null}
                      {m.role !== "admin" ? (
                        <button
                          type="button"
                          onClick={() => handleChangeRole(m.id, "admin")}
                          className="block w-full text-start px-3 py-1.5 hover:bg-muted/60"
                        >
                          {t.makeAdmin}
                        </button>
                      ) : null}
                      {m.role !== "member" ? (
                        <button
                          type="button"
                          onClick={() => handleChangeRole(m.id, "member")}
                          className="block w-full text-start px-3 py-1.5 hover:bg-muted/60"
                        >
                          {t.makeMember}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="block w-full text-start px-3 py-1.5 hover:bg-rose-50 text-rose-700 border-t border-border/70"
                      >
                        {t.remove}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invitations */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/70 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="me-1 inline h-3 w-3" aria-hidden />
            {t.pendingTitle} ({invitations.length})
          </p>
        </div>
        {invitations.length === 0 ? (
          <p className="px-5 py-4 text-xs text-muted-foreground">{t.noPending}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(inv.role)} · {t.expiresOn}
                    {new Date(inv.expiresAt).toLocaleDateString(viewerLocale === "he" ? "he-IL" : "en-US")}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={revoking === inv.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] hover:bg-muted/60 disabled:opacity-60"
                  >
                    {revoking === inv.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <X className="h-3 w-3" aria-hidden />
                    )}
                    {revoking === inv.id ? t.revoking : t.revoke}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invite form */}
      {canEdit ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Mail className="me-1 inline h-3 w-3" aria-hidden />
            {t.invite}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t.emailLabel}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="member">{t.member}</option>
              <option value="admin">{t.admin}</option>
            </select>
            <button
              type="button"
              onClick={handleInvite}
              disabled={submitting || !inviteEmail.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {submitting ? t.sending : t.sendInvite}
            </button>
          </div>
          {savedMsg ? (
            <p className="mt-2 text-xs text-emerald-700">✓ {savedMsg}</p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-rose-700">⚠ {error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
