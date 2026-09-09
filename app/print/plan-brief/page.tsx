// Print-only Plan briefs — captured by Playwright for the PDF export and
// openable in the browser as the preview.
//
//   /print/plan-brief?sheetId=X&kind=commercial[&month=YYYY-MM]
//   /print/plan-brief?sheetId=X&kind=role&role=web|email|…|all[&month=]
//
// One initiative appears once. A team brief prints only what that team owns.
// `role=all` prints every team brief in one document, one per page.

import { notFound } from "next/navigation";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { getAuthContext } from "@/lib/auth/session";
import { getPublicBaseUrl } from "@/lib/server/base-url";
import { buildPlanBrief, rolesInPlan } from "@/lib/services/plan-brief-service";
import { buildPlanView } from "@/lib/services/plan-service";
import { INITIATIVE_STATUS_LABEL } from "@/lib/domain/plan";
import { BRIEF_ROLE_LABEL, parseBriefRole, type BriefAction, type BriefInitiative, type BriefRole, type PlanBrief } from "@/lib/domain/plan-brief";

export const dynamic = "force-dynamic";

type Locale = "he" | "en";

function fmtDay(iso: string, locale: Locale): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { timeZone: "UTC", day: "numeric", month: "short" });
}
function fmtRange(start: string, end: string, locale: Locale): string {
  return start === end ? fmtDay(start, locale) : `${fmtDay(start, locale)} – ${fmtDay(end, locale)}`;
}
function fmtMonth(month: string, locale: Locale): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  needs_decision: "#b45309",
  blocked: "#b91c1c",
  review: "#b45309",
  live: "#166534",
  ready: "#166534",
  watch: "#b45309",
  planned: "#475569",
  completed: "#94a3b8"
};

function Action({ a, locale, showRole }: { a: BriefAction; locale: Locale; showRole: boolean }) {
  const t = (he: string, en: string) => (locale === "he" ? he : en);
  return (
    <li className="action">
      <div className="action-head">
        <span className={a.state === "done" ? "check done" : "check"}>{a.state === "done" ? "✓" : "○"}</span>
        <span className="when">{fmtRange(a.start, a.end, locale)}</span>
        {a.channel ? <span className="chip">{a.channel}</span> : null}
        {a.actionLabel ? <span className="chip muted">{a.actionLabel[locale]}</span> : null}
        {showRole && a.role ? <span className="chip muted">{BRIEF_ROLE_LABEL[a.role][locale]}</span> : null}
      </div>
      <div className="action-text">{a.text}</div>
      {a.href ? (
        <div className="action-link">
          <a href={a.href}>{t("פתיחה בהילומי", "Open in Hiloomy")}</a>
        </div>
      ) : null}
    </li>
  );
}

function InitiativeBlock({ i, brief, locale }: { i: BriefInitiative; brief: PlanBrief; locale: Locale }) {
  const t = (he: string, en: string) => (locale === "he" ? he : en);
  const role = brief.role;
  const offer = [i.offer.discountPct !== null ? `${i.offer.discountPct}%` : null, i.offer.couponCode ? `${t("קוד", "code")} ${i.offer.couponCode}` : null].filter(Boolean).join(" · ");
  const d = i.decision;
  return (
    <section className="initiative">
      <header className="ini-head">
        <div>
          <h2>{i.title}</h2>
          <p className="ini-meta">
            {fmtRange(i.start, i.end, locale)} · <span style={{ color: STATUS_COLOR[i.status] }}>{INITIATIVE_STATUS_LABEL[i.status][locale]}</span>
          </p>
        </div>
        {role && i.firstDue ? (
          <div className="due">
            <span className="label">{t("מועד ראשון", "First due")}</span>
            <strong>{fmtDay(i.firstDue, locale)}</strong>
          </div>
        ) : null}
      </header>

      {d && (d.state === "pending" || d.state === "upcoming") ? (
        <div className="decision">
          <strong>⚠ {t("החלטת הנהלה", "Management decision")} {d.state === "pending" ? t("ממתינה", "pending") : t("צפויה", "expected")}</strong>
          <div>{d.question[locale]}</div>
          <div className="src">„{d.sourceText}”</div>
          <div className="dline">
            {d.displayId ? `${t("החלטה", "Decision")} ${d.displayId} · ` : ""}
            {d.state === "pending" ? t(`עד ${fmtDay(d.due, locale)}`, `by ${fmtDay(d.due, locale)}`) : t(`תופיע בהיום ב-${fmtDay(d.due, locale)}`, `arrives on Today ${fmtDay(d.due, locale)}`)}
            {d.todayUrl ? (
              <>
                {" · "}
                <a href={d.todayUrl}>{t("פתיחה בהיום", "Open in Today")}</a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {d && d.state === "expired" ? <div className="decision expired">{t(`החלטה ${d.displayId} פגה בלי הכרעה`, `Decision ${d.displayId} expired with no choice`)}</div> : null}
      {d && d.state === "resolved" ? (
        <div className="decision resolved">
          {t(`הוחלט — ${d.displayId}`, `Decided — ${d.displayId}`)}
          {d.todayUrl ? (
            <>
              {" · "}
              <a href={d.todayUrl}>{t("קבלה", "Receipt")}</a>
            </>
          ) : null}
        </div>
      ) : null}

      <dl className="facts">
        <dt>{t("המהלך", "Business move")}</dt>
        <dd>{offer || t("ללא הצעה מספרית בתוכנית", "No numeric offer in the plan")}</dd>
        <dt>{t("ערוצים", "Channels")}</dt>
        <dd>{i.channels.length ? i.channels.join(" · ") : "—"}</dd>
        {!role ? (
          <>
            <dt>{t("אחראים", "Owners")}</dt>
            <dd>{i.owners.length ? i.owners.map((r) => BRIEF_ROLE_LABEL[r][locale]).join(" / ") : "—"}</dd>
          </>
        ) : null}
        {i.products.length ? (
          <>
            <dt>{t("מוצרים", "Products")}</dt>
            <dd>{i.products.join(", ")}</dd>
          </>
        ) : null}
      </dl>

      {i.dependencies.length || d ? (
        <div className="deps">
          <span className="label">{t("תלויות", "Dependencies")}</span>
          <ul>
            {i.dependencies.map((dep, k) => (
              <li key={k} className={dep.state}>
                <span className="mark">{dep.state === "ok" ? "✓" : dep.state === "missing" ? "✗" : "?"}</span> {dep.label[locale]} — {dep.detail[locale]}
              </li>
            ))}
            {d ? (
              <li className={d.state === "pending" || d.state === "upcoming" ? "missing" : "ok"}>
                <span className="mark">{d.state === "pending" || d.state === "upcoming" ? "!" : "✓"}</span> {t("החלטת הנהלה", "Management decision")}: {d.state === "pending" ? t("ממתינה", "pending") : d.state === "upcoming" ? t("צפויה", "expected") : d.state === "expired" ? t("פגה", "expired") : t("התקבלה", "made")}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {i.notes.length ? (
        <ul className="notes">
          {i.notes.map((n, k) => (
            <li key={k}>{n[locale]}</li>
          ))}
        </ul>
      ) : null}

      {i.actionsByRole.map((g) => (
        <div key={g.role ?? "none"} className="group">
          <h3>{role ? t(`מה ${BRIEF_ROLE_LABEL[role][locale]} עושה`, `What ${BRIEF_ROLE_LABEL[role][locale]} owns`) : g.role ? BRIEF_ROLE_LABEL[g.role][locale] : t("ללא צוות", "Unassigned")}</h3>
          <ul className="actions">
            {g.actions.map((a) => (
              <Action key={a.rowId} a={a} locale={locale} showRole={false} />
            ))}
          </ul>
        </div>
      ))}
      {role === "customer_service" ? <p className="cs">{t("מה לדעת: ההצעה, הקוד והתאריכים למעלה. שאלות על תנאים — לשיווק.", "What to know: the offer, the code and the dates above. Terms questions go to marketing.")}</p> : null}
    </section>
  );
}

function BriefDocument({ brief, locale }: { brief: PlanBrief; locale: Locale }) {
  const t = (he: string, en: string) => (locale === "he" ? he : en);
  const h = brief.header;
  const title = brief.kind === "commercial" ? t("בריף מסחרי חודשי", "Monthly Commercial Brief") : BRIEF_ROLE_LABEL[brief.role!][locale];
  return (
    <div className="doc">
      <header className="top">
        <p className="eyebrow">
          {brief.brandName} · {fmtMonth(brief.month, locale)}
        </p>
        <h1>{title}</h1>
        <ul className="counts">
          <li>
            <strong>{h.initiatives}</strong> {brief.role ? t("מהלכים שנוגעים לך", "initiatives relevant to you") : t("מהלכים מסחריים", "commercial initiatives")}
          </li>
          {brief.role !== "customer_service" ? (
            <li>
              <strong>{h.actions}</strong> {t("פעולות", "actions")}
            </li>
          ) : null}
          {h.live ? (
            <li>
              <strong>{h.live}</strong> {t("באוויר", "live")}
            </li>
          ) : null}
          {h.blocked ? (
            <li className="warn">
              <strong>{h.blocked}</strong> {t("חסומים", "blocked")}
            </li>
          ) : null}
          {h.decisionsPending ? (
            <li className="warn">
              <strong>{h.decisionsPending}</strong> {t("תלויים בהחלטת הנהלה", "dependent on a management decision")}
            </li>
          ) : null}
        </ul>
      </header>

      {brief.initiatives.length === 0 && brief.standalone.length === 0 ? <p className="empty">{t("אין מהלכים בחודש הזה.", "No initiatives in this month.")}</p> : null}
      {brief.initiatives.map((i) => (
        <InitiativeBlock key={i.id} i={i} brief={brief} locale={locale} />
      ))}

      {brief.standalone.length ? (
        <section className="initiative standalone">
          <h2>{brief.role ? t("פעולות נוספות שלך (ללא מהלך)", "Your other actions (no initiative)") : t("פעולות ללא מהלך", "Actions without an initiative")}</h2>
          <ul className="actions">
            {brief.standalone.map((a) => (
              <Action key={a.rowId} a={a} locale={locale} showRole={!brief.role} />
            ))}
          </ul>
        </section>
      ) : null}

      {brief.kind === "commercial" && brief.changes.length ? (
        <section className="initiative changes">
          <h2>{t("שינויים בתוכנית", "Plan changes")}</h2>
          {brief.changes.map((c) => (
            <div key={c.syncedAt} className="change">
              <div className="ini-meta">
                {new Date(c.syncedAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")} · +{c.added} · −{c.removed} · ~{c.changed}
              </div>
              {c.lines.length ? (
                <ul>
                  {c.lines.map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <p className="footer">
        {t(`נוצר מהתוכנית „${brief.sheetTitle}” · ${new Date(brief.generatedAt).toLocaleString("he-IL")} · הילומי`, `Generated from plan "${brief.sheetTitle}" · ${new Date(brief.generatedAt).toLocaleString("en-US")} · Hiloomy`)}
      </p>
    </div>
  );
}

export default async function PlanBriefPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await getAuthContext();
  if (!auth.orgId) return notFound();
  const params = await searchParams;
  const sheetId = params.sheetId;
  if (!sheetId) return notFound();
  const storeId = await resolveActiveStoreId();
  if (!storeId) return notFound();

  const locale: Locale = params.locale === "en" ? "en" : "he";
  const kind = params.kind === "role" ? "role" : "commercial";
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null;
  const baseUrl = getPublicBaseUrl("https://www.hiloomy.com");

  let briefs: PlanBrief[];
  if (kind === "role" && (params.role ?? "all") === "all") {
    const plan = await buildPlanView(storeId, sheetId);
    const roles = rolesInPlan(plan);
    briefs = await Promise.all(roles.map((role) => buildPlanBrief(storeId, sheetId, { kind: "role", role, month, baseUrl })));
  } else {
    const role: BriefRole | null = kind === "role" ? parseBriefRole(params.role) : null;
    if (kind === "role" && !role) return notFound();
    briefs = [await buildPlanBrief(storeId, sheetId, { kind, role, month, baseUrl })];
  }

  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <head>
        <title>{`Plan brief — ${briefs[0]?.sheetTitle ?? ""}`}</title>
        <style>{`
          * { box-sizing: border-box; }
          body { font-family: -apple-system, system-ui, "Segoe UI", "Heebo", sans-serif; margin: 0; color: #0f172a; font-size: 12.5px; line-height: 1.5; }
          a { color: #0f766e; }
          .doc { max-width: 880px; margin: 0 auto; padding: 32px 40px; }
          .doc + .doc { page-break-before: always; }
          .top { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .eyebrow { margin: 0; color: #475569; font-size: 12px; }
          h1 { font-size: 24px; margin: 2px 0 8px; }
          .counts { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; }
          .counts strong { font-size: 16px; }
          .counts .warn { color: #b45309; }
          .initiative { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
          .ini-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
          h2 { font-size: 17px; margin: 0; }
          h3 { font-size: 12px; margin: 12px 0 4px; color: #334155; text-transform: uppercase; letter-spacing: .02em; }
          .ini-meta { margin: 2px 0 0; color: #475569; font-size: 12px; }
          .due { text-align: center; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; min-width: 84px; }
          .due strong { display: block; font-size: 14px; }
          .label { display: block; font-size: 10.5px; color: #64748b; }
          .decision { margin: 10px 0; padding: 8px 12px; border-radius: 6px; background: #fffbeb; border: 1px solid #fcd34d; }
          .decision.expired { background: #fef2f2; border-color: #fecaca; }
          .decision.resolved { background: #f0fdf4; border-color: #bbf7d0; }
          .decision .src { color: #64748b; font-size: 11.5px; }
          .decision .dline { font-size: 11.5px; margin-top: 2px; }
          .facts { display: grid; grid-template-columns: 96px 1fr; gap: 2px 10px; margin: 10px 0 0; }
          .facts dt { color: #64748b; font-size: 11.5px; }
          .facts dd { margin: 0; }
          .deps { margin-top: 8px; }
          .deps ul, .notes { margin: 2px 0 0; padding-inline-start: 18px; }
          .deps .missing { color: #b91c1c; }
          .deps .unverified { color: #b45309; }
          .deps .ok { color: #166534; }
          .mark { display: inline-block; width: 14px; font-weight: 700; }
          .notes li { color: #b45309; }
          .actions { list-style: none; padding: 0; margin: 0; }
          .action { border-top: 1px solid #f1f5f9; padding: 6px 0; }
          .action-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; color: #475569; }
          .check { font-weight: 700; color: #94a3b8; }
          .check.done { color: #166534; }
          .when { font-weight: 600; color: #0f172a; }
          .chip { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 9999px; background: #ecfdf5; color: #065f46; font-weight: 600; }
          .chip.muted { background: #f1f5f9; color: #475569; }
          .action-text { white-space: pre-wrap; word-break: break-word; margin-top: 2px; }
          .action-link { font-size: 11px; margin-top: 2px; }
          .cs { margin: 8px 0 0; color: #475569; font-size: 11.5px; }
          .standalone h2, .changes h2 { font-size: 15px; margin-bottom: 6px; }
          .change { margin-bottom: 8px; }
          .change ul { margin: 2px 0 0; padding-inline-start: 18px; font-size: 11.5px; }
          .empty { color: #64748b; }
          .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10px; text-align: center; }
          @media print { .chip, .decision, .due { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        `}</style>
      </head>
      <body>
        {briefs.map((b) => (
          <BriefDocument key={`${b.kind}-${b.role ?? "all"}`} brief={b} locale={locale} />
        ))}
      </body>
    </html>
  );
}
