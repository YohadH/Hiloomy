import { getAppLocale } from "@/lib/i18n";
import { PLANS } from "@/lib/billing/plans";
import { HiloomyLogo } from "@/components/ui/logo";
import {
  TrendingUp,
  Bell,
  PieChart,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Check
} from "lucide-react";

// Public marketing landing at /welcome.
// Bilingual (he default), works without auth, links to /signup.
// Lightweight — no frameworks, just Tailwind. Once you have Framer/Webflow
// live, this can become a redirect to the marketing domain.

export const metadata = {
  title: "Hiloomy — ניתוח רווח לחנויות Shopify",
  description:
    "ניתוח רווח, התראות בזמן אמת ודוחות שבועיים למותגי DTC בShopify. ניסיון 14 ימים בחינם."
};

export default async function WelcomePage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const dir = isHe ? "rtl" : "ltr";

  const t = isHe
    ? {
        nav: {
          features: "תכונות",
          pricing: "מחירים",
          security: "אבטחה",
          signin: "התחברו",
          signup: "פתחו חשבון"
        },
        hero: {
          eyebrow: "ניתוח רווח לבעלי מותגי Shopify",
          title: "תראו מה באמת מכניס כסף וקבלו פעולה לכל יום",
          subtitle:
            "Hiloomy מאחד את Shopify, Meta Ads, Instagram ושותפים תחת מקור אחד. במקום \"מה קרה\", מקבלים \"מה לעשות\".",
          ctaPrimary: "התחילו ניסיון 14 ימים",
          ctaSecondary: "ראו אבטחה ופרטיות",
          noCC: "ללא כרטיס אשראי · ביטול בכל רגע"
        },
        features: {
          title: "כלים לבעלי החלטות, לא רק לאנליסטים",
          subtitle: "שש יכולות שמייצרות כסף, לא רק מספרים",
          list: [
            {
              icon: PieChart,
              title: "שולי תרומה בזמן אמת",
              body:
                "הכנסה - הנחות - החזרים - עלות מוצרים (COGS) - עמלות שותפים = רווח אמיתי. עם תוויות דיוק כדי שתדעו על מה לסמוך."
            },
            {
              icon: Bell,
              title: "התראות פרואקטיביות",
              body:
                "להיט אזל מהמלאי? קמפיין צנח? אנחנו אומרים לכם — עם פעולה מומלצת ליום הזה."
            },
            {
              icon: TrendingUp,
              title: "מעקב קריאייטיבים בMeta Ads",
              body:
                "ראו אילו סרטונים ותמונות מייצרים את ההזמנות. סטטיסטיקה ברמת הקריאייטיב."
            },
            {
              icon: Sparkles,
              title: "מעקב שותפים בBixGrow",
              body:
                "הזמנות, קופונים ועמלות מBixGrow מסונכרנים אוטומטית. בלי גיליונות נפרדים."
            },
            {
              icon: ShieldCheck,
              title: "אבטחה ובידוד נתונים",
              body:
                "הצפנת AES-GCM 256-bit. בידוד מלא בין לקוחות. Supabase RLS על כל שאילתה."
            },
            {
              icon: Check,
              title: "דוח שבועי PDF",
              body:
                "מסכם את השבוע: מה עבד, מה לא ומה לעשות בשבוע הבא. בעברית ומותאם אישית."
            }
          ]
        },
        pricing: {
          title: "מחירים פשוטים, ללא הפתעות",
          subtitle: "ניסיון 14 ימים בחינם. ללא כרטיס אשראי. ניתן לבטל בכל רגע.",
          perMonth: "/ חודש",
          starter: "מומלץ למותג יחיד",
          growth: "מומלץ לסוכנויות קטנות",
          agency: "מומלץ לסוכנויות גדולות",
          cta: "התחילו ניסיון בחינם"
        },
        cta: {
          title: "מוכנים לראות את הנתונים שלכם?",
          subtitle: "30 שניות להירשם. דקה לחבר Shopify. 14 ימים לבדוק הכל.",
          button: "פתחו חשבון בחינם"
        },
        footer: {
          rights: "© 2026 Brandzp Ltd. כל הזכויות שמורות.",
          privacy: "פרטיות",
          terms: "תנאי שימוש",
          security: "אבטחה"
        }
      }
    : {
        nav: {
          features: "Features",
          pricing: "Pricing",
          security: "Security",
          signin: "Sign in",
          signup: "Sign up free"
        },
        hero: {
          eyebrow: "Founder analytics for Shopify brands",
          title: "See what actually makes you money — and what to do today",
          subtitle:
            "Hiloomy unifies Shopify, Meta Ads, Instagram, and affiliates in one source of truth. Less \"what happened\", more \"what to do\".",
          ctaPrimary: "Start 14-day free trial",
          ctaSecondary: "See security & privacy",
          noCC: "No credit card · Cancel anytime"
        },
        features: {
          title: "Tools for decision-makers, not just analysts",
          subtitle: "Six capabilities that move money, not just numbers",
          list: [
            {
              icon: PieChart,
              title: "Live contribution margin",
              body:
                "Revenue - discounts - refunds - COGS - affiliate commissions = real profit. With accuracy badges so you know what to trust."
            },
            {
              icon: Bell,
              title: "Proactive alerts",
              body:
                "Hero out of stock? Campaign collapsed? We tell you — with a recommended action for today."
            },
            {
              icon: TrendingUp,
              title: "Creative-level Meta Ads tracking",
              body:
                "See which video or image is driving orders. Per-creative ROAS, CTR, CPA."
            },
            {
              icon: Sparkles,
              title: "BixGrow affiliate tracking",
              body:
                "Orders, coupons, and commissions from BixGrow sync automatically. No more separate spreadsheets."
            },
            {
              icon: ShieldCheck,
              title: "Security & data isolation",
              body:
                "AES-GCM 256-bit encryption. Full tenant isolation. Supabase RLS on every query."
            },
            {
              icon: Check,
              title: "Weekly PDF reports",
              body:
                "Summarizes the week: what worked, what didn't, what to do next. Branded, customizable."
            }
          ]
        },
        pricing: {
          title: "Simple pricing, no surprises",
          subtitle: "14-day free trial. No credit card. Cancel anytime.",
          perMonth: "/ month",
          starter: "Recommended for a single brand",
          growth: "Recommended for small agencies",
          agency: "Recommended for larger agencies",
          cta: "Start free trial"
        },
        cta: {
          title: "Ready to see your numbers?",
          subtitle: "30 seconds to sign up. A minute to connect Shopify. 14 days to test everything.",
          button: "Sign up free"
        },
        footer: {
          rights: "© 2026 Brandzp Ltd. All rights reserved.",
          privacy: "Privacy",
          terms: "Terms",
          security: "Security"
        }
      };

  const plans = [PLANS.starter, PLANS.growth, PLANS.agency];

  return (
    <div dir={dir} className="min-h-screen bg-gradient-to-br from-violet-50/30 via-background to-indigo-50/30">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/welcome" className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground">{t.nav.features}</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground">{t.nav.pricing}</a>
            <a href="/security" className="text-muted-foreground hover:text-foreground">{t.nav.security}</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={`/signin?lang=${locale}`}
              className="text-xs sm:text-sm text-muted-foreground hover:text-foreground"
            >
              {t.nav.signin}
            </a>
            <a
              href={`/signup?lang=${locale}`}
              className="inline-flex items-center gap-1 rounded-md bg-violet-700 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
            >
              {t.nav.signup}
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          {t.hero.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight">{t.hero.title}</h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-7 sm:leading-8 max-w-2xl mx-auto">
          {t.hero.subtitle}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={`/signup?lang=${locale}`}
            className="inline-flex items-center gap-2 rounded-md bg-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-violet-800"
          >
            {t.hero.ctaPrimary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href="/security"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-6 py-3 text-sm font-medium hover:bg-muted/60"
          >
            {t.hero.ctaSecondary}
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t.hero.noCC}</p>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.features.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.features.subtitle}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.list.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-violet-100 p-2 text-violet-700">
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{feat.title}</h3>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{feat.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.pricing.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.pricing.subtitle}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan, idx) => {
            const recommendation = idx === 0 ? t.pricing.starter : idx === 1 ? t.pricing.growth : t.pricing.agency;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 ${
                  idx === 1
                    ? "border-violet-500 shadow-xl shadow-violet-100 bg-gradient-to-br from-violet-50/30 to-card scale-105"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="text-lg font-bold tracking-tight">{plan.name[isHe ? "he" : "en"]}</h3>
                <p className="mt-1 text-[11px] text-muted-foreground italic">{recommendation}</p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{isHe ? `₪${plan.display.monthly.ILS}` : `$${plan.display.monthly.USD}`}</span>
                  <span className="text-xs text-muted-foreground">{t.pricing.perMonth}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-xs">
                  {plan.features[isHe ? "he" : "en"].slice(0, 5).map((feat) => (
                    <li key={feat} className="flex items-start gap-1.5">
                      <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" aria-hidden />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`/signup?lang=${locale}`}
                  className={`mt-6 block text-center rounded-md py-2 text-sm font-semibold shadow-sm ${
                    idx === 1
                      ? "bg-violet-700 text-white hover:bg-violet-800"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {t.pricing.cta}
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 p-10 sm:p-14 text-center text-white shadow-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.cta.title}</h2>
          <p className="mt-3 text-sm sm:text-base text-violet-100">{t.cta.subtitle}</p>
          <a
            href={`/signup?lang=${locale}`}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-violet-700 shadow-md hover:bg-violet-50"
          >
            {t.cta.button}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>{t.footer.rights}</p>
          <nav className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-foreground">{t.footer.privacy}</a>
            <a href="/terms" className="hover:text-foreground">{t.footer.terms}</a>
            <a href="/security" className="hover:text-foreground">{t.footer.security}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
