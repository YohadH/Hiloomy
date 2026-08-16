import { getAppLocale } from "@/lib/i18n";
import { ShieldCheck, Lock, KeyRound, Database, Server, FileCheck2 } from "lucide-react";

// Public /security page. Read before sign-up by privacy-conscious
// customers; linked from the marketing site and the privacy policy.
// Walks through how data is stored, encrypted, isolated, deleted.
//
// Bilingual. RTL-safe.

export const metadata = {
  title: "Security & Data Handling — Hiloomy",
  description:
    "How Hiloomy protects your Shopify, Meta Ads, and affiliate data: encryption, isolation, deletion."
};

export default async function SecurityPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";

  const t = isHe
    ? {
        kicker: "אבטחה",
        title: "איך אנחנו מטפלים בנתונים שלכם",
        subtitle:
          "אנחנו מבינים שאתם נותנים לנו גישה לנתונים רגישים — הכנסות, רווחים, לקוחות, קמפיינים. הנה איך אנחנו שומרים עליהם.",
        sections: [
          {
            icon: Lock,
            title: "הצפנה באחסון ובתעבורה",
            body:
              "כל הסודות (טוקני Shopify, Meta Ads וInstagram) מוצפנים בבסיס הנתונים עם AES-GCM 256-bit. כל התעבורה מוצפנת בHTTPS (TLS 1.3)."
          },
          {
            icon: Database,
            title: "בידוד נתונים בין לקוחות",
            body:
              "כל שאילתת נתונים מסוננת לפי הארגון שלכם בשכבת האפליקציה. Supabase Row Level Security (RLS) מספק שכבת הגנה שנייה ברמת בסיס הנתונים."
          },
          {
            icon: KeyRound,
            title: "אימות וגישה",
            body:
              "האימות מתבצע בSupabase Auth (תואם SOC 2). סיסמאות מוגנות עם bcrypt. תמיכה בOAuth (התחברות מאובטחת דרך ספק חיצוני) מGoogle, GitHub ועוד תגיע בקרוב."
          },
          {
            icon: Server,
            title: "תשתית",
            body:
              "הנתונים נשמרים בענן של Supabase בeu-central-1 (פרנקפורט). השרת רץ בRender בפרנקפורט. עדכוני אבטחה מתבצעים אוטומטית."
          },
          {
            icon: FileCheck2,
            title: "מחיקת נתונים",
            body:
              "בכל רגע תוכלו לבקש מחיקה מלאה של הנתונים שלכם — המחיקה מתבצעת תוך 7 ימים. Meta data deletion callback מטופל אוטומטית."
          },
          {
            icon: ShieldCheck,
            title: "ביקורת ועדכון",
            body:
              "אנחנו ממשיכים להוסיף שכבות אבטחה — SAML SSO, IP whitelisting וDPA זמינים לפי בקשה בכתובת yohad@brandzp.co.il."
          }
        ],
        contact:
          "שאלות אבטחה? כתבו לנו לyohad@brandzp.co.il ונחזור אליכם תוך יום עסקים."
      }
    : {
        kicker: "Security",
        title: "How we handle your data",
        subtitle:
          "We know you're entrusting us with sensitive data — revenue, profit, customers, campaigns. Here's how we protect it.",
        sections: [
          {
            icon: Lock,
            title: "Encryption at rest and in transit",
            body:
              "All secrets (Shopify, Meta Ads, Instagram tokens) are encrypted at rest with AES-GCM 256-bit. All traffic uses HTTPS (TLS 1.3)."
          },
          {
            icon: Database,
            title: "Tenant data isolation",
            body:
              "Every data query is filtered by your organization at the application layer. Supabase Row Level Security (RLS) provides a second defense at the database layer."
          },
          {
            icon: KeyRound,
            title: "Authentication and access",
            body:
              "Auth is handled by Supabase Auth (SOC 2 compliant). Passwords protected with bcrypt. Google + GitHub OAuth coming soon."
          },
          {
            icon: Server,
            title: "Infrastructure",
            body:
              "Data lives in Supabase Postgres in eu-central-1 (Frankfurt). Application server runs on Render in Frankfurt. Security updates applied automatically."
          },
          {
            icon: FileCheck2,
            title: "Data deletion",
            body:
              "You can request full data deletion at any time — we erase within 7 days. Meta's data deletion callback is handled automatically."
          },
          {
            icon: ShieldCheck,
            title: "Audits and roadmap",
            body:
              "We continue to add hardening layers — SAML SSO, IP whitelisting, and a DPA available on request. Email yohad@brandzp.co.il."
          }
        ],
        contact:
          "Security questions? Email us at yohad@brandzp.co.il. We respond within one business day."
      };

  return (
    <main
      dir={isHe ? "rtl" : "ltr"}
      className="min-h-screen bg-gradient-to-br from-violet-50/30 via-background to-indigo-50/30"
    >
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          {t.kicker}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-4 text-base text-muted-foreground leading-7">{t.subtitle}</p>

        <div className="mt-10 grid gap-5">
          {t.sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-violet-100 p-2 text-violet-700 shrink-0">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{section.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-6">
                      {section.body}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 sm:p-6">
          <p className="text-sm text-violet-900">{t.contact}</p>
        </div>
      </div>
    </main>
  );
}
